import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OllamaService } from '../ollama/ollama.service';
import { OpenWaService } from '../openwa/openwa.service';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';
import { ChatService } from '../chat/chat.service';
import { AiService } from '../ai/ai.service';

export type NoteSource = 'whatsapp' | 'telegram' | 'dashboard';

@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ollama: OllamaService,
    private readonly openwa: OpenWaService,
    private readonly settings: SettingsService,
    private readonly logs: LogsService,
    private readonly chat: ChatService,
    private readonly ai: AiService,
  ) {}

  async create(data: {
    text: string;
    source: NoteSource;
    sourceId?: string;
    createdBy?: string;
    title?: string;
    tags?: string[];
  }) {
    return this.prisma.note.create({
      data: {
        text: data.text,
        source: data.source,
        sourceId: data.sourceId,
        createdBy: data.createdBy,
        title: data.title,
        tags: data.tags || [],
      },
    });
  }

  async list(params: { limit?: number; activeOnly?: boolean } = {}) {
    const { limit = 100, activeOnly = true } = params;
    return this.prisma.note.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 500),
    });
  }

  async findById(id: string) {
    return this.prisma.note.findUnique({ where: { id } });
  }

  async findByShortId(shortId: string) {
    const all = await this.prisma.note.findMany({ where: { active: true } });
    return all.find((n) => n.id.startsWith(shortId.toLowerCase())) || null;
  }

  async deleteById(id: string) {
    return this.prisma.note.update({ where: { id }, data: { active: false } });
  }

  async deleteByShortId(shortId: string) {
    const n = await this.findByShortId(shortId);
    if (!n) return null;
    return this.deleteById(n.id);
  }

  /**
   * Prompt por DEFECTO para limpiar notas — diseñado para tocar lo MÍNIMO:
   *  - Solo corrige ortografía, acentos y puntuación obvia.
   *  - Solo da un mínimo de orden visual.
   *  - NO resume, NO reinterpreta, NO inventa, NO añade preámbulo.
   *  - Mantiene casi palabra por palabra lo que dijo el usuario.
   *
   * Si el usuario quiere otro comportamiento, puede sobrescribir este
   * prompt desde el dashboard (Ajustes → Prompts → Notas). Si la setting
   * `notesPrompt` está vacía, se usa este prompt.
   */
  static readonly DEFAULT_NOTES_PROMPT = [
    'Eres un corrector ortográfico para WhatsApp. Tu única tarea es devolver el MISMO texto del usuario, prácticamente igual, con los siguientes cambios MÍNIMOS:',
    '',
    'OBLIGATORIO:',
    '- Corrige faltas de ortografía, tildes y puntuación obvia.',
    '- Pon una mayúscula al inicio de cada frase.',
    '- Si el texto es una lista de cosas separadas por comas o saltos de línea, ponla en líneas con guion "- ".',
    '- Si tiene una idea principal clara al principio, pon esa primera frase en negrita WhatsApp (UN solo asterisco: *así*).',
    '- Usa negritas WhatsApp con UN asterisco (*así*), NUNCA con dos (**no**) ni con _underscore_.',
    '',
    'PROHIBIDO (muy importante):',
    '- NO resumir, NO acortar, NO reinterpretar, NO reordenar las ideas.',
    '- NO añadir información que el usuario no haya escrito.',
    '- NO añadir títulos genéricos tipo "Nota", "Resumen", "Tareas", etc., si el usuario no los puso.',
    '- NO añadir emojis decorativos.',
    '- NO añadir preámbulo ("Aquí tienes...", "Claro,...", "He organizado...").',
    '- NO eliminar palabras del usuario aunque te parezcan redundantes.',
    '',
    'Devuelve SOLO el texto corregido, listo para enviar a WhatsApp.',
  ].join('\n');

  /**
   * Devuelve el prompt activo: setting `notesPrompt` si está rellena, si no
   * el DEFAULT_NOTES_PROMPT (corrección suave).
   */
  private async getActivePrompt(): Promise<string> {
    const custom = await this.settings.getNotesPrompt();
    return custom || NotesService.DEFAULT_NOTES_PROMPT;
  }

  /**
   * Limpia/organiza el texto de la nota. Por defecto toca poco — solo
   * ortografía y formato suave. Usa el proveedor IA activo (Ollama u
   * OpenAI) a través de AiService. Guarda el resultado en `organized`.
   */
  async organize(noteOrText: string | { id: string; text: string }): Promise<string> {
    const isString = typeof noteOrText === 'string';
    const text = isString ? noteOrText : noteOrText.text;
    const promptSystem = await this.getActivePrompt();

    try {
      const organized = await this.ai.complete(promptSystem, text);
      let final = (organized || '').trim();

      // Defensa: si el modelo devolvió ** (Markdown), convertir a * (WhatsApp).
      final = final.replace(/\*\*(.+?)\*\*/g, '*$1*');

      // Defensa extra: si el modelo devolvió algo MUY corto en comparación al
      // texto original, probablemente resumió demasiado → usamos el texto
      // original sin tocar y dejamos un aviso en logs. Así no perdemos info.
      if (
        final.length > 0 &&
        text.length > 80 &&
        final.length < Math.floor(text.length * 0.5)
      ) {
        await this.logs.write(
          'warn',
          'system',
          `organize note: salida muy corta (${final.length} vs original ${text.length}). Devuelvo original.`,
        );
        final = text;
      }

      // Si veníamos con id, persistimos.
      if (!isString && noteOrText.id) {
        await this.prisma.note.update({
          where: { id: noteOrText.id },
          data: { organized: final },
        });
      }
      return final;
    } catch (e: any) {
      await this.logs.write('error', 'system', `organize note fallo: ${e.message}`);
      throw e;
    }
  }

  /**
   * Flujo completo "Telegram (o dashboard) -> IA organiza -> WhatsApp":
   *  1) Crea la nota en DB con source='telegram' (o el que indique).
   *  2) Llama a `organize` con Ollama (guarda el resultado en la nota).
   *  3) Envía la versión organizada a WhatsApp (personalWhatsappChatId o
   *     el override pasado en `params.whatsappTarget`).
   *
   * Devuelve la nota actualizada + el chatId al que se envió + el contenido.
   */
  async organizeAndSendToWhatsapp(params: {
    text: string;
    source: NoteSource;
    sourceId?: string;
    createdBy?: string;
    whatsappTarget?: string;
  }): Promise<{
    noteId: string;
    organized: string;
    sentTo: string;
    delivered: boolean;
  }> {
    const note = await this.create({
      text: params.text,
      source: params.source,
      sourceId: params.sourceId,
      createdBy: params.createdBy,
    });

    const organized = await this.organize({ id: note.id, text: note.text });

    const target =
      params.whatsappTarget ||
      (await this.settings.getPersonalWhatsappChatId());

    let delivered = false;
    if (target) {
      try {
        await this.openwa.sendText(target, organized);
        // Registramos en historial de chats del dashboard.
        try {
          await this.chat.recordOutgoing({
            chatId: target,
            body: organized,
            meta: { kind: 'note-organized', noteId: note.id },
          });
        } catch {}
        delivered = true;
        await this.logs.write(
          'info',
          'system',
          `Nota ${note.id.slice(0, 6)} organizada y enviada a WhatsApp ${target}`,
        );
      } catch (e: any) {
        await this.logs.write(
          'error',
          'system',
          `Nota ${note.id.slice(0, 6)} fallo al enviar a WhatsApp ${target}: ${e.message}`,
        );
      }
    } else {
      await this.logs.write(
        'warn',
        'system',
        `Nota ${note.id.slice(0, 6)} organizada pero SIN destino WhatsApp configurado.`,
      );
    }

    return {
      noteId: note.id,
      organized,
      sentTo: target || '',
      delivered,
    };
  }
}

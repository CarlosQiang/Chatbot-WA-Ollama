import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OllamaService } from '../ollama/ollama.service';
import { OpenWaService } from '../openwa/openwa.service';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';
import { ChatService } from '../chat/chat.service';
import { AiService } from '../ai/ai.service';

export type NoteSource = 'whatsapp' | 'telegram' | 'dashboard';

@Injectable()
export class NotesService implements OnModuleInit {
  private readonly logger = new Logger(NotesService.name);

  /**
   * Al arrancar, si la setting `notesPrompt` está vacía la rellenamos con
   * el DEFAULT_NOTES_PROMPT. Así el usuario ve el prompt ya activo en el
   * dashboard la primera vez que abre Ajustes/Notas — puede editarlo o
   * borrarlo (vaciar = vuelve al default automáticamente). Idempotente:
   * solo escribe si está vacío, nunca sobrescribe lo que el usuario haya
   * personalizado.
   */
  async onModuleInit() {
    try {
      const current = await this.settings.getNotesPrompt();
      if (!current) {
        await this.settings.setNotesPrompt(
          NotesService.DEFAULT_NOTES_PROMPT,
          'seed',
        );
        this.logger.log('Seed inicial de notesPrompt aplicado');
      }
    } catch (e: any) {
      this.logger.warn(`Seed notesPrompt fallo: ${e.message}`);
    }
  }

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
    'Eres un corrector ortográfico estricto para WhatsApp.',
    'Tu ÚNICA tarea es devolver el MISMO texto del usuario con el MENOR número de cambios posibles.',
    'Piensa en ti como un corrector ortográfico de móvil, NO como un editor ni como un asistente.',
    '',
    'LO ÚNICO que estás autorizado a cambiar:',
    '1. Faltas de ortografía y tildes (ej: "trabago" → "trabajo", "mañana" si falta la tilde).',
    '2. Puntos y comas obvios que falten al final de frases.',
    '3. Mayúscula inicial al empezar una frase y después de un punto.',
    '4. Si el texto contiene una enumeración separada por comas o saltos de línea, ponla con guiones "- ".',
    '5. Si hay una frase clara al inicio que actúa como título, ponla en negrita WhatsApp con UN solo asterisco (*así*).',
    '',
    'PROHIBIDO TOTALMENTE (esto romperá tu respuesta):',
    '- NO reformules frases, ni siquiera para "que suenen mejor". Mantén el orden y la elección de palabras del usuario.',
    '- NO resumas, NO acortes, NO unifiques ideas, NO añadas conectores que el usuario no puso.',
    '- NO añadas información, ejemplos, recomendaciones, ni "ideas extra".',
    '- NO añadas títulos genéricos como "Nota:", "Resumen:", "Tareas:", "Lista de la compra:" si el usuario no los puso.',
    '- NO añadas emojis si el usuario no los puso.',
    '- NO añadas preámbulo ("Aquí tienes...", "Claro,...", "He organizado tu texto...", etc.).',
    '- NO uses ** (Markdown). Usa * (UN solo asterisco) para negrita.',
    '- NO traduzcas. Mantén el idioma exacto del usuario, incluyendo palabrotas, jerga y abreviaturas.',
    '',
    'REGLA DE ORO: si dudas entre cambiar algo o dejarlo, DÉJALO. El usuario quiere ver su propio texto, limpio, no una versión reescrita.',
    '',
    'Devuelve SOLO el texto corregido, sin explicaciones ni comentarios.',
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

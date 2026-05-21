import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OllamaService } from '../ollama/ollama.service';
import { OpenWaService } from '../openwa/openwa.service';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';
import { ChatService } from '../chat/chat.service';

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
   * Prompt para que Ollama devuelva una nota estructurada, lista para
   * enviar a WhatsApp. Usa negritas WhatsApp (asterisco simple `*texto*`),
   * NO Markdown (`**texto**` no se interpreta en WhatsApp).
   */
  private static readonly ORGANIZE_SYSTEM_PROMPT = [
    'Eres un asistente que reorganiza ideas dispersas en notas claras y útiles.',
    'Dada una idea, mensaje largo o conjunto de pensamientos del usuario, devuelve una nota lista para leer en WhatsApp.',
    '',
    'REGLAS DE FORMATO (obligatorias):',
    '- Idioma: español. Tono claro, conciso, directo.',
    '- Primera línea: título en negrita WhatsApp con UN solo asterisco: *Título corto*',
    '- Después un breve resumen (1-2 frases).',
    '- Luego secciones con título corto seguido de líneas con guion: "- punto importante".',
    '- Usa negritas WhatsApp con UN asterisco (*así*), NUNCA con dos (**no**) ni con _underscore_.',
    '- Sin emojis decorativos salvo que ayuden a estructura (•, →).',
    '- Máximo 250 palabras. Conciso, sin "idas mentales".',
    '- No inventes información. Mantén la intención del usuario.',
    '- NO añadas preámbulo tipo "Aquí tienes la nota organizada". Devuelve solo la nota.',
  ].join('\n');

  /**
   * Usa Ollama para organizar/limpiar el texto de la nota.
   * Devuelve la version organizada y la guarda en `organized`.
   */
  async organize(noteOrText: string | { id: string; text: string }): Promise<string> {
    const isString = typeof noteOrText === 'string';
    const text = isString ? noteOrText : noteOrText.text;

    const model = await this.settings.getActiveModel();

    try {
      const organized = await this.ollama.chat(model, [
        { role: 'system', content: NotesService.ORGANIZE_SYSTEM_PROMPT },
        { role: 'user', content: text },
      ]);
      let final = (organized || '').trim();

      // Defensa: si el modelo devolvió ** (Markdown), convertir a * (WhatsApp).
      final = final.replace(/\*\*(.+?)\*\*/g, '*$1*');

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

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OllamaService } from '../ollama/ollama.service';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';

export type NoteSource = 'whatsapp' | 'telegram' | 'dashboard';

@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ollama: OllamaService,
    private readonly settings: SettingsService,
    private readonly logs: LogsService,
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
   * Usa Ollama para organizar/limpiar el texto de la nota.
   * Devuelve la version organizada y la guarda en `organized`.
   */
  async organize(noteOrText: string | { id: string; text: string }): Promise<string> {
    const isString = typeof noteOrText === 'string';
    const text = isString ? noteOrText : noteOrText.text;

    const model = await this.settings.getActiveModel();
    const sys =
      'Eres un asistente que organiza ideas y notas. Dada una idea o conjunto de pensamientos, ' +
      'devuelve una versión ESTRUCTURADA, CONCISA y CLARA en español. Usa puntos, listas o sub-secciones ' +
      'si ayuda. Corrige ortografía. Mantén la intención original. NO inventes información. ' +
      'Responde SOLO con el texto organizado, sin preámbulo.';

    try {
      const organized = await this.ollama.chat(model, [
        { role: 'system', content: sys },
        { role: 'user', content: text },
      ]);
      const final = (organized || '').trim();

      // Si veníamos con id, persistimos
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
}

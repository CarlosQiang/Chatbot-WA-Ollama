import { Injectable, Logger } from '@nestjs/common';
import { ReminderService } from '../reminder/reminder.service';
import { NotesService, NoteSource } from '../notes/notes.service';
import { LogsService } from '../logs/logs.service';
import { SettingsService } from '../settings/settings.service';

export type IntentResult =
  | { intent: 'reminder'; reply: string }
  | { intent: 'note'; reply: string }
  | { intent: 'organize'; reply: string }
  | { intent: 'chat' };

@Injectable()
export class IntentService {
  private readonly logger = new Logger(IntentService.name);

  constructor(
    private readonly reminder: ReminderService,
    private readonly notes: NotesService,
    private readonly logs: LogsService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Analiza un texto y, si parece intencion de recordatorio/nota/organizar,
   * la procesa y devuelve la respuesta. Si no, devuelve { intent: 'chat' }
   * para que el flujo siga con Ollama normal.
   */
  async detect(params: {
    text: string;
    source: NoteSource;
    sourceId?: string;
    createdBy?: string;
  }): Promise<IntentResult> {
    const raw = params.text.trim();
    const t = raw.toLowerCase();

    // ─── RECORDATORIO ──────────────────────────────────────────
    // Patrones: "recuerdame X", "recuerdame que X", "ponme un recordatorio para X",
    // "agendame X", "avisame X"
    const reminderMatch =
      raw.match(/^recu[ée]rdame(?:\s+que)?\s+(.+)$/i) ||
      raw.match(/^recordarme(?:\s+que)?\s+(.+)$/i) ||
      raw.match(/^ponme\s+(?:un\s+)?recordatorio(?:\s+(?:para|de))?\s+(.+)$/i) ||
      raw.match(/^pon\s+(?:un\s+)?recordatorio(?:\s+(?:para|de))?\s+(.+)$/i) ||
      raw.match(/^agenda(?:me)?\s+(.+)$/i) ||
      raw.match(/^av[ií]same(?:\s+(?:de|que))?\s+(.+)$/i);

    if (reminderMatch) {
      const expr = reminderMatch[1].trim();
      try {
        // Todos los recordatorios se entregan por WhatsApp. Si viene de
        // WhatsApp, al mismo chat. Si viene de Telegram, al personalWhatsapp.
        const r: any = await this.reminder.parseAndCreate(expr, {
          createdBy: params.createdBy,
          whatsappChatId: params.source === 'whatsapp' ? params.sourceId : undefined,
          telegramChatId: params.source === 'telegram' ? params.sourceId : undefined,
          defaultTarget: 'whatsapp',
        });
        const dest = r.targetChatId;
        return {
          intent: 'reminder',
          reply:
            `✅ Recordatorio creado:\n_"${r.text}"_\n${r._human || ''}\n` +
            `📲 Se enviará a: \`${dest}\`\nID: \`${r.id.slice(0, 6)}\``,
        };
      } catch (e: any) {
        return {
          intent: 'reminder',
          reply:
            `No pude crear el recordatorio: ${e.message || 'error'}\n\n` +
            'Ejemplos que funcionan:\n' +
            '· _recuérdame en una hora hacer el trabajo de Florence_\n' +
            '· _recuérdame mañana a las 7 llamar al médico_\n' +
            '· _ponme un recordatorio para el viernes a las 21:00 backup_\n\n' +
            'Si la frase es muy rara y la IA no la entiende, prueba a reformularla en un formato más estándar (hora, día, fecha).',
        };
      }
    }

    // ─── NOTA ──────────────────────────────────────────────────
    // Patrones: "anota X", "apunta X", "tomar nota: X", "guarda esta idea: X"
    const noteMatch =
      raw.match(/^an[oó]ta(?:me)?\s*:?\s*(.+)$/i) ||
      raw.match(/^apunta(?:me)?\s*:?\s*(.+)$/i) ||
      raw.match(/^tomar?\s+nota\s*:?\s*(.+)$/i) ||
      raw.match(/^guarda\s+(?:esta\s+)?(?:idea|nota)\s*:?\s*(.+)$/i) ||
      raw.match(/^nueva\s+nota\s*:?\s*(.+)$/i);

    if (noteMatch) {
      const text = noteMatch[1].trim();
      // Si la nota viene de Telegram o del dashboard, la organizamos con IA
      // y la enviamos al WhatsApp personal. Confirmación corta — la nota
      // completa queda en WhatsApp. Si viene de WhatsApp, comportamiento
      // legacy (guardar + responder en el mismo chat).
      if (params.source === 'telegram' || params.source === 'dashboard') {
        try {
          const personal = await this.settings.getPersonalWhatsappChatId();
          if (!personal) {
            // Fallback: guardar solo, avisar de configurar destino.
            const note = await this.notes.create({
              text,
              source: params.source,
              sourceId: params.sourceId,
              createdBy: params.createdBy,
            });
            return {
              intent: 'note',
              reply:
                `Nota guardada (pero sin destino WhatsApp configurado).\nID: \`${note.id.slice(0, 6)}\`\n\n` +
                'Configura tu *WhatsApp personal* en el dashboard para que las notas se manden ahí.',
            };
          }
          const r = await this.notes.organizeAndSendToWhatsapp({
            text,
            source: params.source,
            sourceId: params.sourceId,
            createdBy: params.createdBy,
            whatsappTarget: personal,
          });
          return {
            intent: 'note',
            reply: r.delivered
              ? `✅ Nota organizada y enviada a tu WhatsApp\n_ID:_ \`${r.noteId.slice(0, 6)}\``
              : `⚠ Nota guardada pero NO se pudo enviar a WhatsApp (revisa logs).\n_ID:_ \`${r.noteId.slice(0, 6)}\``,
          };
        } catch (e: any) {
          return {
            intent: 'note',
            reply: `No pude organizar la nota: ${e.message || 'error'}`,
          };
        }
      }

      // Legacy / WhatsApp: solo guardar + confirmar en el mismo chat.
      const note = await this.notes.create({
        text,
        source: params.source,
        sourceId: params.sourceId,
        createdBy: params.createdBy,
      });
      return {
        intent: 'note',
        reply: `Nota guardada:\n_"${text.slice(0, 100)}${text.length > 100 ? '...' : ''}"_\nID: \`${note.id.slice(0, 6)}\``,
      };
    }

    // ─── ORGANIZAR ─────────────────────────────────────────────
    // "organiza esto: X", "ordena esta idea: X", "estructurame: X"
    const organizeMatch =
      raw.match(/^organiza(?:\s+esto)?\s*:?\s*(.+)$/i) ||
      raw.match(/^ordena(?:\s+(?:esta?\s+idea|esto))?\s*:?\s*(.+)$/i) ||
      raw.match(/^estructura(?:me)?\s*:?\s*(.+)$/i) ||
      raw.match(/^corrige(?:me)?\s*:?\s*(.+)$/i) ||
      raw.match(/^limpia(?:me)?\s*(?:esta?\s+)?(?:idea|texto)?\s*:?\s*(.+)$/i);

    if (organizeMatch) {
      const text = organizeMatch[1].trim();
      // Desde Telegram/dashboard: organizar + enviar a WhatsApp + confirmación
      // corta. Desde WhatsApp: organizar y devolver al mismo chat (ya es WA).
      if (params.source === 'telegram' || params.source === 'dashboard') {
        try {
          const personal = await this.settings.getPersonalWhatsappChatId();
          if (!personal) {
            return {
              intent: 'organize',
              reply:
                '⚠ No tienes configurado tu *WhatsApp personal*.\n' +
                'Ve a Ajustes → "Mi WhatsApp personal" y configura un número.',
            };
          }
          const r = await this.notes.organizeAndSendToWhatsapp({
            text,
            source: params.source,
            sourceId: params.sourceId,
            createdBy: params.createdBy,
            whatsappTarget: personal,
          });
          return {
            intent: 'organize',
            reply: r.delivered
              ? `✅ Nota organizada y enviada a tu WhatsApp\n_ID:_ \`${r.noteId.slice(0, 6)}\``
              : `⚠ Nota organizada pero NO se pudo enviar a WhatsApp (revisa logs).\n_ID:_ \`${r.noteId.slice(0, 6)}\``,
          };
        } catch (e: any) {
          return {
            intent: 'organize',
            reply: `No pude organizar: ${e.message || 'error'}`,
          };
        }
      }

      // Legacy / WhatsApp: organizar y devolver al mismo chat.
      try {
        const organized = await this.notes.organize(text);
        await this.notes.create({
          text,
          source: params.source,
          sourceId: params.sourceId,
          createdBy: params.createdBy,
        });
        return {
          intent: 'organize',
          reply: `*Versión organizada:*\n\n${organized}`,
        };
      } catch (e: any) {
        return {
          intent: 'organize',
          reply: `No pude organizar: ${e.message || 'error'}`,
        };
      }
    }

    return { intent: 'chat' };
  }
}

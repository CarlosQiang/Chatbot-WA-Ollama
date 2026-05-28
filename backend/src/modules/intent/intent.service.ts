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

/**
 * Patrones para detectar intenciones en lenguaje natural. Cada regex tiene
 * un grupo capturador `(1)` que contiene el "cuerpo" del recordatorio /
 * nota / texto a organizar.
 *
 * Cuanto más amplio sea el conjunto, mejor cobertura — incluyendo errores
 * tipográficos comunes ("recuerdame" sin tilde), abreviaciones ("q" por
 * "que", "x" por "por"), muletillas ("porfa", "tío", "porfis") y
 * variantes coloquiales españolas.
 *
 * Las muletillas y abreviaciones se NORMALIZAN ANTES (ver `prefilter`) para
 * no tener que duplicar regex por cada combinación. Las regex de aquí
 * trabajan sobre texto ya pre-procesado.
 */

// ── RECORDATORIOS ─────────────────────────────────────────────────────────
// Empiezan con un verbo/expresión "imperativa" de recordatorio y todo lo
// que sigue es el cuerpo del recordatorio. El parser de fechas
// (ReminderService.parseAndCreate) se encarga del "cuándo".
const REMINDER_PATTERNS: RegExp[] = [
  // "recuérdame ...", "recuerdame ...", "recordarme ..."
  /^recu[eé]rdamelo\s+(.+)$/i,
  /^recu[eé]rdame(?:\s+(?:que|de|para))?\s+(.+)$/i,
  /^recordarme(?:\s+(?:que|de|para))?\s+(.+)$/i,
  /^acu[eé]rdate\s+(?:de\s+)?(?:que\s+)?(.+)$/i,
  /^acu[eé]rdame\s+(?:de\s+)?(.+)$/i,
  // "recordatorio: ...", "recordatorio para ...", "nuevo recordatorio ..."
  /^(?:nuevo\s+)?recordatorio(?:\s+(?:para|de))?\s*[:\-]?\s+(.+)$/i,
  // "ponme un recordatorio para ...", "pon recordatorio ..."
  /^(?:ponme|pon|m[eé]teme|m[eé]te|colocame|coloca|setea|set)\s+(?:un\s+)?recordatorio(?:\s+(?:para|de))?\s*[:\-]?\s+(.+)$/i,
  // "crea/crear recordatorio ...", "añade recordatorio ..."
  /^(?:crea|crear|a[ñn]ade|a[ñn][aá]deme|agrega|agregame|nuevo|haz|hazme|programa|prog[ra]mame)\s+(?:un\s+)?recordatorio(?:\s+(?:para|de))?\s*[:\-]?\s+(.+)$/i,
  // "agenda(me) ...", "agenda esto: ..."
  /^agenda(?:me)?(?:\s+esto)?\s*[:\-]?\s+(.+)$/i,
  // "avísame ...", "avisa(me) cuando/de/que/en/para ..."
  /^av[ií]same(?:\s+(?:de|que|cuando|en|para|si))?\s+(.+)$/i,
  /^av[ií]sa(?:me)?\s+(?:cuando|en|de|que|para|si)\s+(.+)$/i,
  // "notifícame ..."
  /^notif[ií]came(?:\s+(?:de|que|cuando|en|para|si))?\s+(.+)$/i,
  /^notifica(?:me)?\s+(?:cuando|en|de|que|para|si)\s+(.+)$/i,
  // "alerta(me) ...", "alarma para ..."
  /^al[eé]rta(?:me)?(?:\s+(?:de|que|cuando|en|para|si))?\s+(.+)$/i,
  /^alarma\s+(?:para|de|en)\s+(.+)$/i,
  /^ponme\s+(?:una\s+)?alarma(?:\s+(?:para|de|en))?\s+(.+)$/i,
  /^despi[eé]rtame(?:\s+(?:en|a|para))?\s+(.+)$/i,
  // "no se me olvide ...", "que no se me olvide ..."
  /^(?:que\s+)?no\s+(?:se\s+)?me\s+olvide(?:\s+(?:de|que))?\s+(.+)$/i,
  /^(?:que\s+)?no\s+olvide(?:\s+(?:de|que))?\s+(.+)$/i,
  // "tengo que acordarme ...", "necesito acordarme ..."
  /^tengo\s+que\s+acordarme\s+(?:de\s+)?(.+)$/i,
  /^necesito\s+acordarme\s+(?:de\s+)?(.+)$/i,
  /^necesito\s+(?:un\s+)?recordatorio\s+(?:de|para)?\s*(.+)$/i,
  /^necesito\s+que\s+me\s+recuerdes\s+(?:que\s+)?(.+)$/i,
  // "me tienes que recordar ...", "tienes que recordarme ..."
  /^me\s+tienes\s+que\s+recordar\s+(?:que\s+)?(.+)$/i,
  /^tienes\s+que\s+recordarme\s+(?:que\s+)?(.+)$/i,
  // "/recordar X", "/recordatorio X" (slash-command estilo Telegram)
  /^\/recordar(?:me)?\s+(.+)$/i,
  /^\/recordatorio\s+(.+)$/i,
  /^\/aviso\s+(.+)$/i,
  /^\/alarma\s+(.+)$/i,
];

// ── NOTAS ────────────────────────────────────────────────────────────────
const NOTE_PATTERNS: RegExp[] = [
  /^an[oó]ta(?:me|lo|melo)?\s*[:\-]?\s+(.+)$/i,
  /^apunta(?:me|lo|melo)?\s*[:\-]?\s+(.+)$/i,
  /^toma(?:r)?\s+nota(?:\s+de)?\s*[:\-]?\s+(.+)$/i,
  /^guarda(?:me)?\s+(?:esta\s+)?(?:idea|nota|info|informaci[oó]n)\s*[:\-]?\s+(.+)$/i,
  /^guarda(?:me)?\s+esto\s*[:\-]?\s+(.+)$/i,
  /^guarda(?:me)?\s*[:\-]\s+(.+)$/i,
  /^(?:nueva\s+)?nota\s*[:\-]\s+(.+)$/i,
  /^memo\s*[:\-]?\s+(.+)$/i,
  /^(?:a[ñn]ade|a[ñn][aá]deme|agrega|agregame|crear?|haz|hazme)\s+(?:una\s+)?nota(?:\s+(?:de|sobre|con))?\s*[:\-]?\s+(.+)$/i,
  /^registra(?:me)?(?:\s+esto)?\s*[:\-]?\s+(.+)$/i,
  /^toma(?:r)?\s+apunte(?:s)?(?:\s+de)?\s*[:\-]?\s+(.+)$/i,
  /^apuntalo\s*[:\-]?\s+(.+)$/i,
  /^escr[ií]be(?:me)?\s+(?:una\s+)?nota\s*[:\-]?\s+(.+)$/i,
  // "/nota X" slash-command
  /^\/nota\s+(.+)$/i,
  /^\/anotar\s+(.+)$/i,
  /^\/apuntar\s+(.+)$/i,
];

// ── ORGANIZAR ────────────────────────────────────────────────────────────
const ORGANIZE_PATTERNS: RegExp[] = [
  /^organiza(?:me)?(?:\s+esto)?\s*[:\-]?\s+(.+)$/i,
  /^ordena(?:me)?(?:\s+(?:esta?\s+idea|esto))?\s*[:\-]?\s+(.+)$/i,
  /^estructura(?:me)?(?:\s+esto)?\s*[:\-]?\s+(.+)$/i,
  /^corrige(?:me)?(?:\s+esto)?\s*[:\-]?\s+(.+)$/i,
  /^limpia(?:me)?\s*(?:esta?\s+)?(?:idea|texto|nota)?\s*[:\-]?\s+(.+)$/i,
  /^reescribe(?:me)?(?:\s+esto)?\s*[:\-]?\s+(.+)$/i,
  /^redacta(?:me)?(?:\s+esto)?\s*[:\-]?\s+(.+)$/i,
  /^pasa(?:me)?\s+(?:esto\s+)?a\s+limpio\s*[:\-]?\s+(.+)$/i,
  /^mejora(?:me)?\s+(?:este\s+)?(?:texto|idea|nota|mensaje)?\s*[:\-]?\s+(.+)$/i,
  /^formatea(?:me)?(?:\s+esto)?\s*[:\-]?\s+(.+)$/i,
  /^arregla(?:me)?\s+(?:este\s+)?(?:texto|mensaje|idea)?\s*[:\-]?\s+(.+)$/i,
  // "/organizar X"
  /^\/organizar\s+(.+)$/i,
  /^\/limpiar\s+(.+)$/i,
];

/**
 * Pre-procesa el texto antes de pasarlo a las regex de detección:
 *  - Elimina muletillas finales/iniciales ("porfa", "porfavor", "porfis", "tío", "tia").
 *  - Expande abreviaciones SMS comunes ("q" → "que", "xq" → "porque", "x" → "por").
 *  - Colapsa espacios múltiples.
 *
 * NO toca tildes (las regex aceptan con/sin tilde explícitamente).
 */
function prefilter(input: string): string {
  let s = input.trim();

  // Quitar "/" de slash-commands no estándar al inicio (Telegram envía con /).
  // No las quitamos, las regex de slash-command las usan. OK.

  // Expandir abreviaciones SMS (solo como palabras completas, no dentro de otra).
  const abbr: Array<[RegExp, string]> = [
    [/\bxq\b/gi, 'porque'],
    [/\bpq\b/gi, 'porque'],
    [/\bpor\s+q\b/gi, 'porque'],
    [/\bporq\b/gi, 'porque'],
    [/\btb\b/gi, 'tambien'],
    [/\btbn\b/gi, 'tambien'],
    [/\btmb\b/gi, 'tambien'],
    [/\bq\b/gi, 'que'],
    [/\bx\b/gi, 'por'],
    [/\bk\b/gi, 'que'],
    [/\bdnd\b/gi, 'donde'],
    [/\bdsd\b/gi, 'desde'],
    [/\bxa\b/gi, 'para'],
    [/\bpa\b/gi, 'para'],
    [/\bmñn\b/gi, 'mañana'],
    [/\bmñna\b/gi, 'mañana'],
  ];
  for (const [r, w] of abbr) s = s.replace(r, w);

  // Quitar muletillas (al final y antes de signos de puntuación finales).
  // Lista deliberadamente conservadora: solo expresiones MUY claramente
  // muletillas que no aportan a la intención.
  const fillers = [
    'porfa',
    'porfavor',
    'por favor',
    'porfis',
    'porfi',
    'plis',
    'please',
    'tio',
    'tío',
    'tia',
    'tía',
    'bro',
    'tronco',
    'chaval',
    'gracias',
    'gracs',
    'thx',
    'thanks',
  ];
  const fillerRe = new RegExp(
    `(?:^|[,.\\s])(?:${fillers.map((f) => f.replace(/\s+/g, '\\s+')).join('|')})(?=$|[,.!?\\s])`,
    'gi',
  );
  s = s.replace(fillerRe, ' ').replace(/\s{2,}/g, ' ').trim();

  // Quitar signos de exclamación/interrogación finales repetidos.
  s = s.replace(/[!?.]+$/g, '').trim();

  return s;
}

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
   * Devuelve el primer match (grupo 1) de la lista de patrones, o null.
   */
  private tryPatterns(text: string, patterns: RegExp[]): string | null {
    for (const re of patterns) {
      const m = text.match(re);
      if (m && m[1] && m[1].trim()) return m[1].trim();
    }
    return null;
  }

  /**
   * Analiza un texto y, si parece intención de recordatorio/nota/organizar,
   * la procesa y devuelve la respuesta. Si no, devuelve { intent: 'chat' }
   * para que el flujo siga con Ollama normal.
   *
   * Orden de prioridad:
   *   1. Recordatorio (más específico, con tiempo)
   *   2. Nota
   *   3. Organizar (más general, mismo verbo puede solapar con nota)
   */
  async detect(params: {
    text: string;
    source: NoteSource;
    sourceId?: string;
    createdBy?: string;
  }): Promise<IntentResult> {
    const raw = params.text.trim();
    if (!raw) return { intent: 'chat' };

    // Normalizamos para tener más cobertura sin duplicar regex.
    const normalized = prefilter(raw);

    // ─── RECORDATORIO ────────────────────────────────────────
    const reminderBody = this.tryPatterns(normalized, REMINDER_PATTERNS);
    if (reminderBody) {
      try {
        const r: any = await this.reminder.parseAndCreate(reminderBody, {
          createdBy: params.createdBy,
          whatsappChatId:
            params.source === 'whatsapp' ? params.sourceId : undefined,
          telegramChatId:
            params.source === 'telegram' ? params.sourceId : undefined,
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
        this.logger.debug(
          `[intent] reminder parse fallo: "${reminderBody}" -> ${e.message}`,
        );
        return {
          intent: 'reminder',
          reply:
            `No pude crear el recordatorio: ${e.message || 'error'}\n\n` +
            'Ejemplos que funcionan:\n' +
            '· _recuérdame en una hora hacer el trabajo de Florence_\n' +
            '· _recuérdame mañana a las 7 llamar al médico_\n' +
            '· _ponme un recordatorio para el viernes a las 21:00 backup_\n' +
            '· _avísame en 30 minutos que saque el pollo_\n' +
            '· _no se me olvide mañana llamar al gestor_\n\n' +
            'Si la frase es muy rara y la IA no la entiende, prueba a reformularla en un formato más estándar (hora, día, fecha).',
        };
      }
    }

    // ─── NOTA ────────────────────────────────────────────────
    const noteBody = this.tryPatterns(normalized, NOTE_PATTERNS);
    if (noteBody) {
      // Si la nota viene de Telegram o del dashboard, la organizamos con IA
      // y la enviamos al WhatsApp personal. Confirmación corta.
      if (params.source === 'telegram' || params.source === 'dashboard') {
        try {
          const personal = await this.settings.getPersonalWhatsappChatId();
          if (!personal) {
            const note = await this.notes.create({
              text: noteBody,
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
            text: noteBody,
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
          this.logger.warn(`[intent] note fallo: ${e.message}`);
          return {
            intent: 'note',
            reply: `No pude organizar la nota: ${e.message || 'error'}`,
          };
        }
      }

      // Legacy / WhatsApp: solo guardar + confirmar en el mismo chat.
      const note = await this.notes.create({
        text: noteBody,
        source: params.source,
        sourceId: params.sourceId,
        createdBy: params.createdBy,
      });
      return {
        intent: 'note',
        reply: `Nota guardada:\n_"${noteBody.slice(0, 100)}${noteBody.length > 100 ? '...' : ''}"_\nID: \`${note.id.slice(0, 6)}\``,
      };
    }

    // ─── ORGANIZAR ───────────────────────────────────────────
    const organizeBody = this.tryPatterns(normalized, ORGANIZE_PATTERNS);
    if (organizeBody) {
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
            text: organizeBody,
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
          this.logger.warn(`[intent] organize fallo: ${e.message}`);
          return {
            intent: 'organize',
            reply: `No pude organizar: ${e.message || 'error'}`,
          };
        }
      }

      // Legacy / WhatsApp: organizar y devolver al mismo chat.
      try {
        const organized = await this.notes.organize(organizeBody);
        await this.notes.create({
          text: organizeBody,
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

  /**
   * Expone los patrones (útil para tests, documentación o un endpoint de
   * diagnóstico desde el dashboard "qué reconoce el bot").
   */
  static getPatternsInfo() {
    return {
      reminder: REMINDER_PATTERNS.map((r) => r.source),
      note: NOTE_PATTERNS.map((r) => r.source),
      organize: ORGANIZE_PATTERNS.map((r) => r.source),
    };
  }
}

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenWaService } from '../openwa/openwa.service';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';
import { ChatService } from '../chat/chat.service';
import { normalizeChatId } from '../../common/validators';

export type CreateContext = {
  createdBy?: string;
  /** ChatId Telegram desde el que se solicitó (para confirmación). */
  telegramChatId?: string;
  /** ChatId WhatsApp explícito al que entregar (override). */
  whatsappChatId?: string;
  /** @deprecated mantenido por compat. Todos los recordatorios van por WhatsApp. */
  defaultTarget?: 'telegram' | 'whatsapp';
};

const DOW: Record<string, number> = {
  domingo: 0, dom: 0,
  lunes: 1, lun: 1,
  martes: 2, mar: 2,
  'miércoles': 3, miercoles: 3, mie: 3, mier: 3,
  jueves: 4, jue: 4,
  viernes: 5, vie: 5,
  'sábado': 6, sabado: 6, sab: 6,
};

const MONTH: Record<string, number> = {
  enero: 0, ene: 0,
  febrero: 1, feb: 1,
  marzo: 2,
  abril: 3, abr: 3,
  mayo: 4, may: 4,
  junio: 5, jun: 5,
  julio: 6, jul: 6,
  agosto: 7, ago: 7,
  septiembre: 8, sept: 8, sep: 8,
  octubre: 9, oct: 9,
  noviembre: 10, nov: 10,
  diciembre: 11, dic: 11,
};

const UNITS: Record<string, number> = {
  segundo: 1_000, segundos: 1_000, seg: 1_000, s: 1_000,
  minuto: 60_000, minutos: 60_000, min: 60_000, mins: 60_000, m: 60_000,
  hora: 3_600_000, horas: 3_600_000, h: 3_600_000,
  'día': 86_400_000, dia: 86_400_000, 'días': 86_400_000, dias: 86_400_000, d: 86_400_000,
  semana: 7 * 86_400_000, semanas: 7 * 86_400_000, sem: 7 * 86_400_000, w: 7 * 86_400_000,
};

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);
  /**
   * Sender opcional para confirmación de creación en Telegram (mensaje
   * "Recordatorio guardado..."). NO se usa para disparar el recordatorio
   * en sí — todos los recordatorios se entregan por WhatsApp.
   */
  private telegramSender: ((chatId: string | number, text: string) => Promise<any>) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly openwa: OpenWaService,
    private readonly settings: SettingsService,
    private readonly logs: LogsService,
    private readonly chat: ChatService,
  ) {}

  setTelegramSender(fn: (chatId: string | number, text: string) => Promise<any>) {
    this.telegramSender = fn;
  }

  /**
   * Devuelve el chatId WhatsApp donde se debe entregar el recordatorio.
   * Prioridad: override explícito → personalWhatsappChatId → self-chat del bot.
   */
  private async resolveWaTarget(override?: string): Promise<string> {
    if (override) {
      const n = normalizeChatId(override);
      if (n) return n;
    }
    const personal = await this.settings.getPersonalWhatsappChatId();
    if (personal) return personal;
    // Último recurso: testChatId (legacy fallback).
    return this.settings.getTestChatId();
  }

  async list() {
    return this.prisma.reminder.findMany({
      where: { active: true },
      orderBy: [{ fireAt: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  async create(data: any) {
    return this.prisma.reminder.create({ data });
  }

  async deleteByShortId(shortId: string) {
    const all = await this.prisma.reminder.findMany({ where: { active: true } });
    const found = all.find((r) => r.id.startsWith(shortId.toLowerCase()));
    if (!found) return null;
    return this.prisma.reminder.update({
      where: { id: found.id },
      data: { active: false },
    });
  }

  async deleteById(id: string) {
    return this.prisma.reminder.update({ where: { id }, data: { active: false } });
  }

  private nowInTz(tz: string) {
    return this.partsInTz(new Date(), tz);
  }

  private partsInTz(date: Date, tz: string) {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false, weekday: 'short',
    });
    const map: any = {};
    for (const p of fmt.formatToParts(date)) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }
    return {
      year: +map.year,
      month: +map.month,
      day: +map.day,
      hour: +map.hour,
      minute: +map.minute,
      second: +map.second,
      weekday: map.weekday as string,
    };
  }

  private dateInTz(tz: string, y: number, m: number, d: number, hh: number, mm: number): Date {
    let guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
    for (let i = 0; i < 3; i++) {
      const p = this.partsInTz(guess, tz);
      const tzMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0);
      const delta = tzMs - guess.getTime();
      if (delta === 0) break;
      guess = new Date(guess.getTime() - delta);
    }
    return guess;
  }

  private formatHuman(date: Date, tz: string): string {
    const today = this.nowInTz(tz);
    const t = this.partsInTz(date, tz);
    const sameDay = t.year === today.year && t.month === today.month && t.day === today.day;
    const tomorrowDate = new Date(this.dateInTz(tz, today.year, today.month, today.day, 0, 0));
    tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
    const tom = this.partsInTz(tomorrowDate, tz);
    const isTomorrow = t.year === tom.year && t.month === tom.month && t.day === tom.day;
    const hhmm = `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
    if (sameDay) return `Hoy a las ${hhmm}`;
    if (isTomorrow) return `Manana a las ${hhmm}`;
    return new Intl.DateTimeFormat('es-ES', {
      timeZone: tz,
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  /**
   * Convierte expresiones de hora en lenguaje natural a formato HH:MM:
   *   "nueve" -> "09:00"
   *   "nueve y media" -> "09:30"
   *   "siete y cuarto de la tarde" -> "19:15"
   *   "diez de la noche" -> "22:00"
   *   "mediodia" -> "12:00"
   *   "medianoche" -> "00:00"
   *   "a las 9" -> "a las 09:00"
   *   "a las 21" -> "a las 21:00"
   */
  private normalizeTimeExpressions(s: string): string {
    const numWord: Record<string, number> = {
      una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
      siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
      trece: 13, catorce: 14, quince: 15, dieciseis: 16, 'dieciséis': 16,
      diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
      veintiuna: 21, veintiuno: 21, veintidos: 22, 'veintidós': 22,
      veintitres: 23, 'veintitrés': 23, veinticuatro: 24,
    };
    const minWord: Record<string, number> = {
      media: 30, cuarto: 15,
      // "menos cuarto" se trata aparte
    };

    let out = s;

    // mediodia / medianoche
    out = out.replace(/\bmediod[ií]a\b/gi, '12:00');
    out = out.replace(/\bmedianoche\b/gi, '00:00');

    // Patron 1: "a las <NUM> y <MIN> (de la <franja>)?"
    // Ej: "a las nueve y media de la tarde" -> "a las 21:30"
    const re1 = /\b(?:a\s+las?\s+)?(\w+)(?:\s+y\s+(\w+))?(?:\s+de\s+la\s+(ma[ñn]ana|tarde|noche|madrugada))?\b/gi;
    out = out.replace(re1, (match, hWord, mWord, franja, offset, fullStr) => {
      const h = numWord[hWord?.toLowerCase()];
      if (h === undefined || h < 0 || h > 24) return match;
      // No tocar si es una palabra suelta en medio (debe ir precedida de "a las" o ser inicio)
      const before = (fullStr as string).slice(Math.max(0, offset - 8), offset).toLowerCase();
      if (!/a\s+las?\s+$/.test(before) && !/^a\s+las?\s+/i.test(match)) return match;

      let hour = h;
      let min = 0;
      if (mWord) {
        const m = minWord[mWord.toLowerCase()];
        if (m !== undefined) min = m;
        else {
          const mNum = numWord[mWord.toLowerCase()];
          if (mNum !== undefined && mNum < 60) min = mNum;
          else return match;
        }
      }
      if (franja) {
        const f = franja.toLowerCase();
        if ((f === 'tarde' || f === 'noche') && hour >= 1 && hour <= 11) hour += 12;
        if (f === 'madrugada' && hour === 12) hour = 0;
        if (f === 'mañana' || f === 'manana') {
          if (hour === 12) hour = 0;
        }
      } else if (hour > 23) {
        return match;
      }
      const hh = String(hour % 24).padStart(2, '0');
      const mm = String(min).padStart(2, '0');
      return `a las ${hh}:${mm}`;
    });

    // Patron 2: "a las N" o "a las N de la tarde/noche/manana" donde N es numero
    out = out.replace(
      /\ba\s+las?\s+(\d{1,2})(?::(\d{2}))?(?:\s+de\s+la\s+(ma[ñn]ana|tarde|noche|madrugada))?\b/gi,
      (_m, hStr, mStr, franja) => {
        let hour = parseInt(hStr, 10);
        let min = mStr ? parseInt(mStr, 10) : 0;
        if (isNaN(hour) || hour > 24) return _m;
        if (franja) {
          const f = franja.toLowerCase();
          if ((f === 'tarde' || f === 'noche') && hour >= 1 && hour <= 11) hour += 12;
          if (f === 'madrugada' && hour === 12) hour = 0;
        }
        const hh = String(hour % 24).padStart(2, '0');
        const mm = String(min).padStart(2, '0');
        return `a las ${hh}:${mm}`;
      },
    );

    return out;
  }

  async parseAndCreate(input: string, ctx: CreateContext) {
    if (!input || !input.trim()) throw new BadRequestException('Texto vacio');
    const tz = await this.settings.getReminderTz();
    let raw = this.normalizeTimeExpressions(input.trim());

    // Prefijos legacy: los aceptamos pero los desechamos. TODO recordatorio
    // se entrega por WhatsApp. Si quieres mandar a otro WhatsApp, configura
    // `personalWhatsappChatId` o pasa `whatsappChatId` en el ctx.
    if (/^(wa|tg|telegram)\s+/i.test(raw)) {
      raw = raw.replace(/^(wa|tg|telegram)\s+/i, '').trim();
    }

    const target: 'whatsapp' = 'whatsapp';
    const targetChatId = await this.resolveWaTarget(ctx.whatsappChatId);

    const parsed: { text: string; fireAt?: Date; cronExpression?: string } | null =
      this.tryRecurring(raw) ||
      this.tryRelative(raw) ||
      this.tryHoyManana(raw, tz) ||
      this.tryDayOfWeek(raw, tz) ||
      this.tryDateLong(raw, tz) ||
      this.tryDateNumeric(raw, tz) ||
      this.tryBareTime(raw, tz);

    if (!parsed) throw new BadRequestException(this.helpText());

    const created = await this.create({
      text: parsed.text,
      target,
      targetChatId,
      fireAt: parsed.fireAt,
      cronExpression: parsed.cronExpression,
      createdBy: ctx.createdBy,
    });

    return {
      ...created,
      _human: parsed.fireAt ? this.formatHuman(parsed.fireAt, tz) : `Recurrente: ${this.cronHuman(parsed.cronExpression!)}`,
      _tz: tz,
    };
  }

  formatConfirmation(reminder: any, tz: string): string {
    const when = reminder.fireAt
      ? this.formatHuman(new Date(reminder.fireAt), tz)
      : `Recurrente · ${this.cronHuman(reminder.cronExpression)}`;
    const hhmm = reminder.fireAt ? this.partsInTz(new Date(reminder.fireAt), tz) : null;
    return (
      `✅ *Recordatorio guardado*\n` +
      `_"${reminder.text}"_\n` +
      `📅 ${when}` +
      (hhmm ? `\n⏰ ${String(hhmm.hour).padStart(2, '0')}:${String(hhmm.minute).padStart(2, '0')}` : '') +
      `\n📲 Se enviará a: \`${reminder.targetChatId}\`` +
      `\nID: \`${reminder.id.slice(0, 6)}\``
    );
  }

  /**
   * Formato del mensaje que llega a WhatsApp cuando salta el recordatorio.
   * Visualmente limpio: emoji, título en negrita, hora local, separadores.
   */
  private formatWhatsappBody(reminder: any, tz: string): string {
    const when = reminder.fireAt
      ? this.formatHuman(new Date(reminder.fireAt), tz)
      : `(recurrente · ${this.cronHuman(reminder.cronExpression)})`;
    return (
      `⏰ *Recordatorio*\n` +
      `${reminder.text}\n` +
      `\n_${when}_`
    );
  }

  private helpText(): string {
    return (
      'Formato no reconocido. Ejemplos:\n' +
      '- hoy a las 18:00 revisar Docker\n' +
      '- en 2 horas revisar logs\n' +
      '- en 3 dias llamar a Juan\n' +
      '- el viernes a las 21:00 hacer backup\n' +
      '- el 25 de mayo pagar el servidor\n' +
      '- manana 09:00 reunion\n' +
      '- 25/12/2026 09:00 felicitar\n' +
      '- +30m revisar horno\n' +
      '- diario 09:00 tomar pastilla\n' +
      '- cada lunes revisar Traefik\n' +
      '- cada lunes a las 08:00 sacar basura\n' +
      '- semanal viernes 20:00 backup\n' +
      '- Prefijo "wa " envia a WhatsApp.'
    );
  }

  private tryRecurring(raw: string): null | { text: string; cronExpression: string } {
    let m = raw.match(/^diario\s+(?:a\s+las\s+)?(\d{1,2})[:h](\d{2})\s+(.+)$/is);
    if (m) {
      const hh = +m[1], mm = +m[2];
      this.validateTime(hh, mm);
      return { text: m[3].trim(), cronExpression: `${mm} ${hh} * * *` };
    }

    m = raw.match(/^semanal\s+(\S+)\s+(?:a\s+las\s+)?(\d{1,2})[:h](\d{2})\s+(.+)$/is);
    if (m) {
      const day = DOW[m[1].toLowerCase()];
      if (day === undefined) throw new BadRequestException(`Dia desconocido: ${m[1]}`);
      const hh = +m[2], mm = +m[3];
      this.validateTime(hh, mm);
      return { text: m[4].trim(), cronExpression: `${mm} ${hh} * * ${day}` };
    }

    m = raw.match(/^cada\s+(?:día|dia)\s+(?:a\s+las\s+)?(?:(\d{1,2})[:h](\d{2})\s+)?(.+)$/is);
    if (m) {
      const hh = m[1] ? +m[1] : 9;
      const mm = m[2] ? +m[2] : 0;
      this.validateTime(hh, mm);
      return { text: m[3].trim(), cronExpression: `${mm} ${hh} * * *` };
    }

    m = raw.match(/^cada\s+(\S+)\s+(?:a\s+las\s+)?(?:(\d{1,2})[:h](\d{2})\s+)?(.+)$/is);
    if (m && DOW[m[1].toLowerCase()] !== undefined) {
      const day = DOW[m[1].toLowerCase()];
      const hh = m[2] ? +m[2] : 9;
      const mm = m[3] ? +m[3] : 0;
      this.validateTime(hh, mm);
      return { text: m[4].trim(), cronExpression: `${mm} ${hh} * * ${day}` };
    }

    m = raw.match(/^cada\s+(\d+)\s+(hora|horas|h|minuto|minutos|min|m|día|dia|días|dias|d)\s+(.+)$/is);
    if (m) {
      const n = +m[1];
      const u = m[2].toLowerCase();
      if (n <= 0) throw new BadRequestException('Numero invalido');
      if (u.startsWith('h')) {
        if (n > 23) throw new BadRequestException('Para "cada N horas" usa N<=23');
        return { text: m[3].trim(), cronExpression: `0 */${n} * * *` };
      }
      if (u.startsWith('m')) {
        if (n > 59) throw new BadRequestException('Para "cada N minutos" usa N<=59');
        return { text: m[3].trim(), cronExpression: `*/${n} * * * *` };
      }
      if (u.startsWith('d')) {
        if (n > 31) throw new BadRequestException('Para "cada N dias" usa N<=31');
        return { text: m[3].trim(), cronExpression: `0 9 */${n} * *` };
      }
    }
    return null;
  }

  private tryRelative(raw: string): null | { text: string; fireAt: Date } {
    let m = raw.match(/^en\s+(\d+)\s+(\S+)\s+(.+)$/is);
    if (m) {
      const n = +m[1];
      const u = m[2].toLowerCase();
      const unitMs = UNITS[u];
      if (unitMs && n > 0) return { text: m[3].trim(), fireAt: new Date(Date.now() + n * unitMs) };
    }
    m = raw.match(/^\+(\d+)\s*([smhdw])\s+(.+)$/is);
    if (m) {
      const n = +m[1];
      const u = m[2].toLowerCase();
      const unitMs = UNITS[u];
      if (unitMs && n > 0) return { text: m[3].trim(), fireAt: new Date(Date.now() + n * unitMs) };
    }
    return null;
  }

  private tryHoyManana(raw: string, tz: string): null | { text: string; fireAt: Date } {
    const m = raw.match(
      /^(hoy|ma(?:n|ñ)ana|pasado(?:\s+ma(?:n|ñ)ana)?)\s+(?:a\s+las\s+)?(\d{1,2})[:h](\d{2})\s+(.+)$/is,
    );
    if (!m) return null;
    const word = m[1].toLowerCase().replace(/\s+/g, ' ');
    const hh = +m[2], mm = +m[3];
    this.validateTime(hh, mm);
    const now = this.nowInTz(tz);
    let dayOffset = 0;
    if (word === 'hoy') dayOffset = 0;
    else if (word.startsWith('ma')) dayOffset = 1;
    else dayOffset = 2;
    const target = new Date(this.dateInTz(tz, now.year, now.month, now.day, hh, mm));
    target.setUTCDate(target.getUTCDate() + dayOffset);
    if (dayOffset === 0 && target.getTime() <= Date.now() + 30_000) {
      throw new BadRequestException(
        `Esa hora ya paso hoy. Usa "manana ${hh}:${String(mm).padStart(2, '0')}" o "en N (minutos|horas)".`,
      );
    }
    return { text: m[4].trim(), fireAt: target };
  }

  private tryDayOfWeek(raw: string, tz: string): null | { text: string; fireAt: Date } {
    const m = raw.match(
      /^(?:el\s+)?(\S+)(?:\s+que\s+viene)?(?:\s+pr(?:o|ó)ximo)?\s+(?:a\s+las\s+)?(\d{1,2})[:h](\d{2})\s+(.+)$/is,
    );
    if (!m) return null;
    const dow = DOW[m[1].toLowerCase()];
    if (dow === undefined) return null;
    const hh = +m[2], mm = +m[3];
    this.validateTime(hh, mm);
    const now = this.nowInTz(tz);
    const todayDate = new Date(this.dateInTz(tz, now.year, now.month, now.day, hh, mm));
    const wkParts = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      weekday: 'short',
    }).format(todayDate);
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const realDow = map[wkParts] ?? 0;
    let add = (dow - realDow + 7) % 7;
    if (add === 0 && todayDate.getTime() <= Date.now() + 30_000) add = 7;
    const target = new Date(todayDate);
    target.setUTCDate(target.getUTCDate() + add);
    return { text: m[4].trim(), fireAt: target };
  }

  private tryDateLong(raw: string, tz: string): null | { text: string; fireAt: Date } {
    const m = raw.match(
      /^(?:el\s+)?(\d{1,2})\s+de\s+(\S+?)(?:\s+(?:de\s+)?(\d{4}))?\s+(?:(?:a\s+las\s+)?(\d{1,2})[:h](\d{2})\s+)?(.+)$/is,
    );
    if (!m) return null;
    const day = +m[1];
    const monthName = m[2].toLowerCase();
    const month = MONTH[monthName];
    if (month === undefined) return null;
    const now = this.nowInTz(tz);
    let year = m[3] ? +m[3] : now.year;
    const hh = m[4] ? +m[4] : 9;
    const mm = m[5] ? +m[5] : 0;
    this.validateTime(hh, mm);
    let target = this.dateInTz(tz, year, month + 1, day, hh, mm);
    if (target.getTime() <= Date.now()) {
      if (!m[3]) {
        year += 1;
        target = this.dateInTz(tz, year, month + 1, day, hh, mm);
      } else {
        throw new BadRequestException('Esa fecha ya paso');
      }
    }
    return { text: m[6].trim(), fireAt: target };
  }

  private tryDateNumeric(raw: string, tz: string): null | { text: string; fireAt: Date } {
    const m = raw.match(
      /^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\s+(?:(?:a\s+las\s+)?(\d{1,2})[:h](\d{2})\s+)?(.+)$/is,
    );
    if (!m) return null;
    const day = +m[1], month = +m[2];
    const now = this.nowInTz(tz);
    let year = m[3] ? +m[3] : now.year;
    if (year < 100) year += 2000;
    const hh = m[4] ? +m[4] : 9;
    const mm = m[5] ? +m[5] : 0;
    this.validateTime(hh, mm);
    let target = this.dateInTz(tz, year, month, day, hh, mm);
    if (target.getTime() <= Date.now()) {
      if (!m[3]) target = this.dateInTz(tz, year + 1, month, day, hh, mm);
      else throw new BadRequestException('Esa fecha/hora ya paso');
    }
    return { text: m[6].trim(), fireAt: target };
  }

  private tryBareTime(raw: string, tz: string): null | { text: string; fireAt: Date } {
    const m = raw.match(/^(?:a\s+las\s+)?(\d{1,2})[:h](\d{2})\s+(.+)$/is);
    if (!m) return null;
    const hh = +m[1], mm = +m[2];
    this.validateTime(hh, mm);
    const now = this.nowInTz(tz);
    let target = this.dateInTz(tz, now.year, now.month, now.day, hh, mm);
    if (target.getTime() <= Date.now() + 30_000) {
      target = new Date(target.getTime() + 86_400_000);
    }
    return { text: m[3].trim(), fireAt: target };
  }

  private validateTime(hh: number, mm: number) {
    if (isNaN(hh) || isNaN(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
      throw new BadRequestException(`Hora invalida ${hh}:${mm}. Formato 24h.`);
    }
  }

  private cronHuman(expr: string): string {
    const parts = expr.split(/\s+/);
    if (parts.length !== 5) return `cron \`${expr}\``;
    const [mm, hh, dom, mon, dow] = parts;
    const dowMap = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    if (mm.startsWith('*/')) return `cada ${mm.slice(2)} minuto(s)`;
    if (hh.startsWith('*/')) return `cada ${hh.slice(2)} hora(s)`;
    if (dom.startsWith('*/')) return `cada ${dom.slice(2)} dia(s) a las ${hh}:${mm.padStart(2, '0')}`;
    const t = `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`;
    if (dow !== '*') return `cada ${dowMap[+dow] || dow} a las ${t}`;
    if (mon !== '*' || dom !== '*') return `cron \`${expr}\``;
    return `cada dia a las ${t}`;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    try {
      const now = new Date();
      const due = await this.prisma.reminder.findMany({
        where: {
          active: true,
          OR: [
            { fireAt: { lte: now }, lastFiredAt: null },
            { cronExpression: { not: null } },
          ],
        },
      });
      const tz = await this.settings.getReminderTz();
      for (const r of due) {
        if (r.cronExpression) {
          if (!this.shouldFireCron(r.cronExpression, now, r.lastFiredAt, tz)) continue;
        }
        await this.fire(r);
      }
    } catch (e: any) {
      this.logger.error(`tick fallo: ${e.message}`);
    }
  }

  private shouldFireCron(expr: string, now: Date, lastFiredAt: Date | null, tz: string): boolean {
    const parts = expr.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    const [mm, hh, dom, mon, dow] = parts;
    const local = this.partsInTz(now, tz);
    const localDow = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(now);
    const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const dowNum = dowMap[localDow] ?? 0;

    const matches = (field: string, val: number): boolean => {
      if (field === '*') return true;
      if (field.startsWith('*/')) {
        const step = +field.slice(2);
        return step > 0 && val % step === 0;
      }
      return parseInt(field, 10) === val;
    };

    if (!matches(mm, local.minute)) return false;
    if (!matches(hh, local.hour)) return false;
    if (!matches(dom, local.day)) return false;
    if (!matches(mon, local.month)) return false;
    if (!matches(dow, dowNum)) return false;

    if (lastFiredAt) {
      const sameMinute =
        Math.floor(lastFiredAt.getTime() / 60_000) === Math.floor(now.getTime() / 60_000);
      if (sameMinute) return false;
    }
    return true;
  }

  private async fire(r: any) {
    const tz = await this.settings.getReminderTz();
    const body = this.formatWhatsappBody(r, tz);

    // Resolución defensiva del destino: si el recordatorio se creó cuando
    // aún no había personalWhatsappChatId, o el targetChatId quedó vacío
    // por alguna razón, fallback al WhatsApp configurado AHORA.
    let dest = r.targetChatId;
    const n = dest ? normalizeChatId(dest) : null;
    if (!n) dest = await this.resolveWaTarget();
    else dest = n;

    if (!dest) {
      await this.logs.write(
        'error',
        'system',
        `Recordatorio ${r.id.slice(0, 6)} sin destino WhatsApp. Configura "Mi WhatsApp personal".`,
      );
      // Lo marcamos como disparado para no entrar en bucle infinito.
      await this.prisma.reminder.update({
        where: { id: r.id },
        data: { lastFiredAt: new Date(), active: r.cronExpression ? true : false },
      });
      return;
    }

    try {
      // Forzamos WhatsApp. El campo target=telegram (legacy) ya no se usa
      // para enrutar — todos los recordatorios van a WhatsApp.
      await this.openwa.sendText(dest, body);
      // Registramos en el historial de chats del dashboard.
      try {
        await this.chat.recordOutgoing({
          chatId: dest,
          body,
          meta: { kind: 'reminder', reminderId: r.id },
        });
      } catch {}
      const updateData: any = { lastFiredAt: new Date() };
      if (!r.cronExpression) updateData.active = false;
      await this.prisma.reminder.update({ where: { id: r.id }, data: updateData });
      this.logger.log(
        `[reminder] ${r.id.slice(0, 6)} disparado -> ${dest} (tz=${tz}, cron=${!!r.cronExpression})`,
      );
      await this.logs.write(
        'info',
        'system',
        `Recordatorio ${r.id.slice(0, 6)} -> WhatsApp ${dest}`,
      );
    } catch (e: any) {
      this.logger.error(`[reminder] ${r.id.slice(0, 6)} fallo: ${e.message}`);
      await this.logs.write(
        'error',
        'system',
        `Recordatorio ${r.id.slice(0, 6)} fallo enviando a ${dest}: ${e.message}`,
      );
      // No marcamos lastFiredAt para que el siguiente tick reintente.
      // Para evitar reintento infinito en caso de error permanente, lo
      // desactivamos si llevamos varios fallos seguidos: lo dejamos
      // pasar al siguiente tick (a 1 min) — los logs harán visible el bucle.
    }
  }
}

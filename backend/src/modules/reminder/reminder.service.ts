import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { OpenWaService } from '../openwa/openwa.service';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';

export type CreateContext = {
  createdBy?: string;
  telegramChatId?: string;
  whatsappChatId?: string;
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
  private telegramSender: ((chatId: string | number, text: string) => Promise<any>) | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly openwa: OpenWaService,
    private readonly settings: SettingsService,
    private readonly logs: LogsService,
  ) {}

  setTelegramSender(fn: (chatId: string | number, text: string) => Promise<any>) {
    this.telegramSender = fn;
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

  async parseAndCreate(input: string, ctx: CreateContext) {
    if (!input || !input.trim()) throw new BadRequestException('Texto vacio');
    const tz = await this.settings.getReminderTz();
    let raw = input.trim();

    let target: 'telegram' | 'whatsapp' = ctx.defaultTarget || 'telegram';
    if (/^wa\s+/i.test(raw)) {
      target = 'whatsapp';
      raw = raw.replace(/^wa\s+/i, '').trim();
    } else if (/^(tg|telegram)\s+/i.test(raw)) {
      target = 'telegram';
      raw = raw.replace(/^(tg|telegram)\s+/i, '').trim();
    }

    const targetChatId =
      target === 'whatsapp'
        ? (ctx.whatsappChatId || (await this.settings.getTestChatId()))
        : (ctx.telegramChatId || 'dashboard');

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
      `Recordatorio guardado:\n` +
      `_"${reminder.text}"_\n` +
      `Fecha: ${when}` +
      (hhmm ? `\nHora: ${String(hhmm.hour).padStart(2, '0')}:${String(hhmm.minute).padStart(2, '0')}` : '') +
      `\nID: \`${reminder.id.slice(0, 6)}\``
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
    const msg = `Recordatorio:\n${r.text}`;
    try {
      if (r.target === 'whatsapp') {
        await this.openwa.sendText(r.targetChatId, msg);
      } else if (this.telegramSender) {
        await this.telegramSender(r.targetChatId, msg);
      }
      const updateData: any = { lastFiredAt: new Date() };
      if (!r.cronExpression) updateData.active = false;
      await this.prisma.reminder.update({ where: { id: r.id }, data: updateData });
      await this.logs.write('info', 'system', `Recordatorio ${r.id.slice(0, 6)} disparado -> ${r.target} (${tz})`);
    } catch (e: any) {
      await this.logs.write('error', 'system', `Recordatorio ${r.id.slice(0, 6)} fallo: ${e.message}`);
    }
  }
}

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import { OllamaService } from '../ollama/ollama.service';
import { OpenWaService } from '../openwa/openwa.service';
import {
  BOT_MODES,
  BOT_MODE_DESCRIPTIONS,
  BotMode,
  SettingsService,
} from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';
import { ReminderService } from '../reminder/reminder.service';
import { NotesService } from '../notes/notes.service';
import { DevToolsService } from '../devtools/devtools.service';
import { SystemService } from '../system/system.service';
import { IntentService } from '../intent/intent.service';
import { ChatService } from '../chat/chat.service';
import { normalizeChatId } from '../../common/validators';

type TgUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: string };
    date: number;
    text?: string;
  };
};

const HELP = `*Local AI Hub Bot — Telegram = panel de control*

Todo lo que generes (recordatorios, notas, respuestas IA largas) sale a tu *WhatsApp personal*. Configúralo en el dashboard → Ajustes → "Mi WhatsApp personal".

*Chat IA*
\`<texto corto>\` chat libre con Ollama (responde en Telegram)
\`<texto largo (>220 chars o varias líneas)>\` se organiza con IA y se manda a tu WhatsApp
\`/ai <texto>\` chat libre explícito
\`/codigo <lang> <desc>\` · \`/explica <texto>\`
\`/sec <desc>\` · \`/regexgen <desc>\` · \`/sqlgen <desc>\`
\`/modelos\`  \`/modelo <n>\`  \`/estado\`  \`/latencia\`

*Notas — Telegram → IA → WhatsApp*
\`/organiza <texto>\` lo organizo con IA y mando la nota a tu WhatsApp
\`/notas\` lista las notas guardadas
\`/borrarnota <id>\`

*Recordatorios (todos llegan a tu WhatsApp)*
\`/recordar hoy a las 18:00 revisar Docker\`
\`/recordar en 2 horas revisar logs\`
\`/recordar el viernes a las 21:00 hacer backup\`
\`/recordar cada lunes a las 08:00 sacar basura\`
\`/recordatorios\`  \`/borrar <id>\`

*Envíos manuales a WhatsApp*
\`/wa <texto>\` envía a tu WhatsApp personal
\`/wa <34xxx@c.us> <texto>\` envía a otro número
\`/aiwa <texto>\` IA responde y envía a tu WhatsApp

*Modo del bot WhatsApp*
\`/modo\` muestra modo actual
\`/modo manual|private|ai|silent|maintenance\`
\`/silencio\`  \`/resumir\`

*Admin*
\`/whitelist\` \`/whitelist add <num>\` \`/whitelist del <num>\`
\`/admins\`

*DevTools*
\`/hash\` \`/hashes\` \`/b64\` \`/url\` \`/jwt\` \`/uuid\` \`/pass\` \`/timestamp\` \`/regex\`

*Ciber*
\`/dns\` \`/headers\` \`/ssl\` \`/cve\`

*Sistema*
\`/ping\` \`/ayuda\` \`/quien\` \`/uptime\` \`/ip\` \`/ippub\``;

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private http: AxiosInstance;
  private offset = 0;
  private timer?: NodeJS.Timeout;
  private running = false;
  private enabled = false;
  private allowedUserIds: Set<number> = new Set();
  private readonly intervalMs: number;

  constructor(
    private readonly ollama: OllamaService,
    private readonly openwa: OpenWaService,
    private readonly settings: SettingsService,
    private readonly logs: LogsService,
    private readonly reminder: ReminderService,
    private readonly devtools: DevToolsService,
    private readonly system: SystemService,
    private readonly intent: IntentService,
    private readonly notes: NotesService,
    private readonly chat: ChatService,
  ) {
    this.intervalMs = parseInt(process.env.TELEGRAM_POLL_INTERVAL_MS || '2000', 10);
  }

  async onModuleInit() {
    await this.startFromConfig();
  }

  private async startFromConfig() {
    const token = await this.settings.getTelegramBotToken();
    const enabledEnv = (process.env.TELEGRAM_ENABLED ?? 'true').toLowerCase() !== 'false';
    if (!token || !enabledEnv) {
      this.logger.log('Telegram desactivado (sin token o TELEGRAM_ENABLED=false)');
      this.enabled = false;
      return;
    }
    this.enabled = true;
    this.http = axios.create({
      baseURL: `https://api.telegram.org/bot${token}`,
      timeout: 35_000,
    });
    const ids = await this.settings.getTelegramAllowedUserIds();
    this.allowedUserIds = new Set(ids);
    this.logger.log(`Telegram iniciado · whitelist: ${ids.length ? ids.join(',') : 'ABIERTO'}`);
    this.logs.write('info', 'system', `Telegram iniciado (whitelist=${ids.length})`);
    this.startPolling();
  }

  async restartFromSettings() {
    if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
    this.offset = 0;
    this.running = false;
    this.enabled = false;
    await this.startFromConfig();
  }

  async getConfig() {
    const token = await this.settings.getTelegramBotToken();
    const ids = await this.settings.getTelegramAllowedUserIds();
    return {
      hasToken: !!token,
      tokenMask: token ? `${token.slice(0, 6)}...${token.slice(-4)}` : '',
      allowedUserIds: ids,
      bridgeWa: await this.settings.getTelegramBridgeWa(),
      bridgeChatId: await this.settings.getTelegramBridgeChatId(),
    };
  }

  async setConfig(body: {
    botToken?: string;
    allowedUserIds?: string;
    bridgeWa?: boolean;
    bridgeChatId?: string;
  }) {
    let needsRestart = false;
    if (body.botToken !== undefined) {
      await this.settings.setTelegramBotToken(body.botToken, 'dashboard');
      needsRestart = true;
    }
    if (body.allowedUserIds !== undefined) {
      await this.settings.setTelegramAllowedUserIds(body.allowedUserIds, 'dashboard');
      // recargar whitelist en runtime sin reiniciar polling
      const ids = await this.settings.getTelegramAllowedUserIds();
      this.allowedUserIds = new Set(ids);
    }
    if (body.bridgeWa !== undefined) {
      await this.settings.setTelegramBridgeWa(!!body.bridgeWa, 'dashboard');
    }
    if (body.bridgeChatId !== undefined) {
      await this.settings.setTelegramBridgeChatId(body.bridgeChatId, 'dashboard');
    }
    if (needsRestart) await this.restartFromSettings();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  isEnabled() { return this.enabled; }

  async sendMessage(chatId: number | string, text: string, parseMode: 'Markdown' | 'HTML' | null = 'Markdown') {
    if (!this.enabled) return null;
    try {
      const body: any = { chat_id: chatId, text, disable_web_page_preview: true };
      if (parseMode) body.parse_mode = parseMode;
      const { data } = await this.http.post('/sendMessage', body);
      return data;
    } catch (err: any) {
      if (parseMode) {
        try {
          const { data } = await this.http.post('/sendMessage', {
            chat_id: chatId, text, disable_web_page_preview: true,
          });
          return data;
        } catch {}
      }
      this.logger.warn(`sendMessage fallo: ${err.message}`);
      return null;
    }
  }

  async getMe() {
    if (!this.enabled) return { ok: false, error: 'Bot no configurado' };
    try {
      const { data } = await this.http.get('/getMe');
      return { ok: true, ...data.result };
    } catch (err: any) { return { ok: false, error: err.message }; }
  }

  private startPolling() {
    this.timer = setInterval(() => this.tick().catch((e) => this.logger.error(e.message)), this.intervalMs);
  }

  private async tick() {
    if (this.running || !this.enabled) return;
    this.running = true;
    try {
      const { data } = await this.http.get('/getUpdates', {
        params: { offset: this.offset, timeout: 25 },
        timeout: 35_000,
      });
      const updates: TgUpdate[] = data?.result || [];
      for (const u of updates) {
        this.offset = u.update_id + 1;
        if (!u.message?.text) continue;
        await this.handleMessage(u.message);
      }
    } catch (err: any) {
      if (err?.response?.status === 409) this.offset = 0;
    } finally {
      this.running = false;
    }
  }

  private async handleMessage(msg: TgUpdate['message']) {
    const userId = msg.from?.id;
    const chatId = msg.chat.id;
    const text = (msg.text || '').trim();
    const userName = msg.from?.first_name || msg.from?.username || 'usuario';

    if (this.allowedUserIds.size > 0 && userId && !this.allowedUserIds.has(userId)) {
      await this.sendMessage(chatId, `No estas en la whitelist. Tu user id: \`${userId}\``);
      return;
    }

    await this.logs.write('info', 'system', `[tg] ${userName}(${userId}) -> ${text.slice(0, 80)}`);

    try {
      if (text.startsWith('/')) {
        await this.handleCommand(chatId, userId, text);
      } else {
        await this.replyWithOllama(chatId, text);
      }
    } catch (err: any) {
      await this.sendMessage(chatId, `Error: ${err.message}`);
      await this.logs.write('error', 'system', `[tg] error: ${err.message}`);
    }
  }

  private async handleCommand(chatId: number, userId: number | undefined, text: string) {
    const [rawCmd, ...rest] = text.split(/\s+/);
    const args = rest.join(' ').trim();
    const cmd = rawCmd.toLowerCase();

    switch (cmd) {
      case '/start': case '/ayuda': case '/help':
        return this.sendMessage(chatId, HELP);
      case '/ping': return this.sendMessage(chatId, 'pong');
      case '/quien': return this.sendMessage(chatId, `Tu user id: \`${userId}\``);
      case '/estado': {
        const [wa, ai] = await Promise.all([this.openwa.health(), this.ollama.health()]);
        const model = await this.settings.getActiveModel();
        const mode = await this.settings.getBotMode();
        return this.sendMessage(
          chatId,
          `*Estado*\nModo: \`${mode}\`\nOpenWA: ${wa.ok ? 'OK' : 'KO'}\nOllama: ${ai.ok ? 'OK' : 'KO'}\nModelo: \`${model}\``,
        );
      }

      case '/modelos': {
        const models = await this.ollama.listModels();
        const active = await this.settings.getActiveModel();
        if (!models.length) return this.sendMessage(chatId, 'Sin modelos.');
        const list = models.map((m) => (m.name === active ? `> \`${m.name}\`` : `- \`${m.name}\``)).join('\n');
        return this.sendMessage(chatId, `*Modelos*\n${list}`);
      }
      case '/modelo': {
        if (!args) return this.sendMessage(chatId, 'Uso: `/modelo <nombre>`');
        const models = await this.ollama.listModels();
        const match = models.find((m) => m.name === args) || models.find((m) => m.name.startsWith(args));
        if (!match) return this.sendMessage(chatId, `Modelo "${args}" no encontrado.`);
        await this.settings.setActiveModel(match.name, `tg:${userId}`);
        return this.sendMessage(chatId, `Modelo activo: \`${match.name}\``);
      }

      case '/ai':
        if (!args) return this.sendMessage(chatId, 'Uso: `/ai <texto>`');
        return this.replyWithOllama(chatId, args);

      case '/codigo': {
        if (!args) return this.sendMessage(chatId, 'Uso: `/codigo <lenguaje> <descripcion>`');
        const m = args.match(/^(\S+)\s+(.+)$/s);
        if (!m) return this.sendMessage(chatId, 'Falta descripcion');
        return this.replyWithOllamaPrompt(
          chatId,
          `Eres desarrollador senior. Genera SOLO codigo limpio en ${m[1]}, comentarios minimos.`,
          m[2],
        );
      }

      case '/explica':
        if (!args) return this.sendMessage(chatId, 'Uso: `/explica <texto>`');
        return this.replyWithOllamaPrompt(chatId, 'Explica de forma clara, breve y tecnica.', args);

      case '/sec':
        if (!args) return this.sendMessage(chatId, 'Uso: `/sec <descripcion>`');
        return this.replyWithOllamaPrompt(
          chatId,
          'Eres analista de ciberseguridad. Lista riesgos OWASP/CIS, vectores y mitigaciones.',
          args,
        );

      case '/regexgen':
        if (!args) return this.sendMessage(chatId, 'Uso: `/regexgen <descripcion>`');
        return this.replyWithOllamaPrompt(chatId, 'Genera SOLO la regex y 1 linea de explicacion.', args);

      case '/sqlgen':
        if (!args) return this.sendMessage(chatId, 'Uso: `/sqlgen <descripcion>`');
        return this.replyWithOllamaPrompt(chatId, 'Genera SOLO la query SQL y 1 linea de explicacion.', args);

      case '/wa': {
        if (!args)
          return this.sendMessage(
            chatId,
            'Uso: `/wa <texto>` (a tu WhatsApp personal) o `/wa 612345678 <texto>` (a otro número)',
          );
        // Intenta parsear "<numero> <texto>". Acepta cualquier formato.
        const m = args.match(/^(\S+)\s+(.+)$/s);
        let target: string;
        let body: string;
        if (m) {
          const candidate = normalizeChatId(m[1]);
          if (candidate) {
            target = candidate;
            body = m[2];
          } else {
            target = await this.settings.getPersonalWhatsappChatId();
            body = args;
          }
        } else {
          target = await this.settings.getPersonalWhatsappChatId();
          body = args;
        }
        if (!target) {
          return this.sendMessage(
            chatId,
            '⚠ No tienes configurado tu *WhatsApp personal*. Configúralo en el dashboard → Ajustes.',
          );
        }
        try {
          await this.openwa.sendText(target, body);
          await this.chat
            .recordOutgoing({ chatId: target, body, meta: { kind: 'tg-wa-manual' } })
            .catch(() => null);
          return this.sendMessage(chatId, `📲 Enviado a \`${target}\``);
        } catch (e: any) {
          return this.sendMessage(chatId, `Error: ${e.message}`);
        }
      }

      case '/aiwa': {
        if (!args) return this.sendMessage(chatId, 'Uso: `/aiwa <texto>`');
        try {
          const waTarget = await this.settings.getPersonalWhatsappChatId();
          if (!waTarget) {
            return this.sendMessage(
              chatId,
              '⚠ Configura tu *WhatsApp personal* en el dashboard antes de usar /aiwa.',
            );
          }
          const model = await this.settings.getActiveModel();
          const sys = await this.settings.getSystemPrompt();
          const reply = await this.ollama.chat(model, [
            { role: 'system', content: sys },
            { role: 'user', content: args },
          ]);
          await this.openwa.sendText(waTarget, reply);
          await this.chat
            .recordOutgoing({ chatId: waTarget, body: reply, model, meta: { kind: 'tg-aiwa' } })
            .catch(() => null);
          return this.sendMessage(chatId, `📲 Enviado a WhatsApp \`${waTarget}\`:\n\n${reply}`);
        } catch (e: any) { return this.sendMessage(chatId, `Error: ${e.message}`); }
      }

      case '/recordar': {
        try {
          const r: any = await this.reminder.parseAndCreate(args, {
            createdBy: `tg:${userId}`,
            telegramChatId: String(chatId),
            defaultTarget: 'whatsapp',
          });
          const tz = await this.settings.getReminderTz();
          return this.sendMessage(chatId, this.reminder.formatConfirmation(r, tz));
        } catch (e: any) { return this.sendMessage(chatId, `Error: ${e.message}`); }
      }
      case '/recordatorios': {
        const list = await this.reminder.list();
        if (!list.length) return this.sendMessage(chatId, 'Sin recordatorios');
        const tz = await this.settings.getReminderTz();
        const txt = list.slice(0, 20).map((r) => {
          const when = r.fireAt
            ? new Date(r.fireAt).toLocaleString('es-ES', { timeZone: tz })
            : `cron \`${r.cronExpression}\``;
          return `\`${r.id.slice(0, 6)}\` · 📲 ${r.targetChatId} · ${when}\n  _${r.text}_`;
        }).join('\n\n');
        return this.sendMessage(chatId, `*Recordatorios activos* (WhatsApp)\n\n${txt}`);
      }
      case '/borrar': {
        if (!args) return this.sendMessage(chatId, 'Uso: `/borrar <id>`');
        const r = await this.reminder.deleteByShortId(args);
        return this.sendMessage(chatId, r ? `Borrado ${args}` : 'No encontrado');
      }

      case '/modo': {
        if (!args) {
          const current = await this.settings.getBotMode();
          const list = BOT_MODES.map(
            (m) => `${m === current ? '>' : '-'} *${m}* — ${BOT_MODE_DESCRIPTIONS[m]}`,
          ).join('\n');
          return this.sendMessage(chatId, `*Modo actual:* \`${current}\`\n\n${list}\n\nUso: /modo <nombre>`);
        }
        const mode = args.toLowerCase() as BotMode;
        if (!BOT_MODES.includes(mode)) {
          return this.sendMessage(chatId, `Modo invalido. Validos: ${BOT_MODES.join(', ')}`);
        }
        await this.settings.setBotMode(mode, `tg:${userId}`);
        return this.sendMessage(chatId, `Modo cambiado a \`${mode}\`\n_${BOT_MODE_DESCRIPTIONS[mode]}_`);
      }
      case '/silencio':
      case '/silenciar':
        await this.settings.setBotMode('silent', `tg:${userId}`);
        return this.sendMessage(chatId, 'Modo silencio activado.');
      case '/resumir':
      case '/activar':
        await this.settings.setBotMode('private', `tg:${userId}`);
        return this.sendMessage(chatId, 'Modo `private` activado.');

      case '/whitelist': {
        const [sub, ...rest] = args.split(/\s+/);
        const target = rest.join(' ').trim();
        if (sub === 'add' && target) {
          const n = normalizeChatId(target);
          if (!n) {
            return this.sendMessage(
              chatId,
              'Número inválido. Acepta `612345678`, `+34612345678`, `34 612 345 678` o `34xxx@c.us`',
            );
          }
          await this.settings.addAllowed(n, `tg:${userId}`);
          return this.sendMessage(chatId, `Añadido a whitelist: \`${n}\``);
        }
        if ((sub === 'del' || sub === 'rm') && target) {
          const n = normalizeChatId(target);
          if (!n) {
            return this.sendMessage(chatId, 'Número inválido.');
          }
          await this.settings.removeAllowed(n, `tg:${userId}`);
          return this.sendMessage(chatId, `Quitado: \`${n}\``);
        }
        const list = await this.settings.getAllowedChatIds();
        return this.sendMessage(
          chatId,
          `*Whitelist* (${list.length})\n` +
            (list.map((c) => `- \`${c}\``).join('\n') || '_(vacia)_') +
            `\n\nUso:\n- \`/whitelist add 612345678\` (cualquier formato)\n- \`/whitelist del 612345678\``,
        );
      }
      case '/admins': {
        const list = await this.settings.getAdminChatIds();
        return this.sendMessage(
          chatId,
          `*Administradores WhatsApp* (${list.length})\n` +
            (list.map((c) => `- \`${c}\``).join('\n') || '_(vacia)_'),
        );
      }

      case '/hash': {
        const m = args.match(/^(\S+)\s+(.+)$/s);
        if (!m) return this.sendMessage(chatId, 'Uso: `/hash <md5|sha256|sha512> <texto>`');
        try {
          const h = this.devtools.hash(m[1], m[2]);
          return this.sendMessage(chatId, `${m[1].toLowerCase()}:\n\`${h}\``);
        } catch (e: any) { return this.sendMessage(chatId, `Error: ${e.message}`); }
      }
      case '/hashes': {
        if (!args) return this.sendMessage(chatId, 'Uso: `/hashes <texto>`');
        const h = this.devtools.allHashes(args);
        return this.sendMessage(
          chatId,
          `*Hashes*\n*md5:* \`${h.md5}\`\n*sha1:* \`${h.sha1}\`\n*sha256:* \`${h.sha256}\`\n*sha512:* \`${h.sha512.slice(0, 64)}...\``,
        );
      }
      case '/b64': {
        const m = args.match(/^(enc|dec)\s+(.+)$/is);
        if (!m) return this.sendMessage(chatId, 'Uso: `/b64 enc|dec <texto>`');
        try {
          const r = m[1].toLowerCase() === 'enc'
            ? this.devtools.base64Encode(m[2])
            : this.devtools.base64Decode(m[2]);
          return this.sendMessage(chatId, `\`${r}\``);
        } catch (e: any) { return this.sendMessage(chatId, `Error: ${e.message}`); }
      }
      case '/url': {
        const m = args.match(/^(enc|dec)\s+(.+)$/is);
        if (!m) return this.sendMessage(chatId, 'Uso: `/url enc|dec <texto>`');
        const r = m[1].toLowerCase() === 'enc'
          ? this.devtools.urlEncode(m[2])
          : this.devtools.urlDecode(m[2]);
        return this.sendMessage(chatId, `\`${r}\``);
      }
      case '/jwt': {
        if (!args) return this.sendMessage(chatId, 'Uso: `/jwt <token>`');
        try {
          const d = this.devtools.jwtDecode(args);
          return this.sendMessage(
            chatId,
            `*Header:*\n\`\`\`\n${JSON.stringify(d.header, null, 2)}\n\`\`\`\n*Payload:*\n\`\`\`\n${JSON.stringify(d.payload, null, 2)}\n\`\`\``,
          );
        } catch (e: any) { return this.sendMessage(chatId, `Error: ${e.message}`); }
      }
      case '/uuid':
        return this.sendMessage(chatId, `\`${this.devtools.uuidv4()}\``);
      case '/pass': {
        const len = parseInt(args, 10) || 16;
        if (len < 4 || len > 128) return this.sendMessage(chatId, 'Longitud entre 4 y 128');
        return this.sendMessage(chatId, `\`${this.devtools.generatePassword(len)}\``);
      }
      case '/timestamp': {
        try {
          const t = this.devtools.timestamp(args || undefined);
          return this.sendMessage(
            chatId,
            `*Timestamp*\nUnix: \`${t.unix}\`\nISO: \`${t.iso}\`\nHumano: ${t.human}`,
          );
        } catch (e: any) { return this.sendMessage(chatId, `Error: ${e.message}`); }
      }
      case '/regex': {
        const m = args.match(/^(\S+)\s+(.+)$/s);
        if (!m) return this.sendMessage(chatId, 'Uso: `/regex <patron> <texto>`');
        const r = this.devtools.regexTest(m[1], m[2]);
        if (!r.ok) return this.sendMessage(chatId, `Error: ${r.error}`);
        return this.sendMessage(
          chatId,
          `*${r.count} match(es)*\n${r.matches.slice(0, 20).map((x) => `- \`${x}\``).join('\n') || '_(ninguno)_'}`,
        );
      }

      case '/dns': {
        if (!args) return this.sendMessage(chatId, 'Uso: `/dns <dominio>`');
        try {
          const r = await this.devtools.dnsLookup(args);
          const fmt = (k: string, v: any[]) => v?.length ? `*${k}:* ${v.map((x) => typeof x === 'object' ? JSON.stringify(x) : x).slice(0, 5).join(', ')}` : '';
          const out = ['A', 'AAAA', 'MX', 'NS', 'TXT'].map((k) => fmt(k, r[k])).filter(Boolean).join('\n');
          return this.sendMessage(chatId, `*DNS ${args}*\n${out || '_sin resultados_'}`);
        } catch (e: any) { return this.sendMessage(chatId, `Error: ${e.message}`); }
      }
      case '/headers': {
        if (!args) return this.sendMessage(chatId, 'Uso: `/headers <url>`');
        const r = await this.devtools.httpHeaders(args);
        if ((r as any).error) return this.sendMessage(chatId, `Error: ${(r as any).error}`);
        const hdrs = Object.entries((r as any).headers || {}).slice(0, 15).map(([k, v]) => `${k}: ${v}`).join('\n');
        return this.sendMessage(chatId, `*${(r as any).status} ${(r as any).statusText}*\n\`\`\`\n${hdrs}\n\`\`\``);
      }
      case '/ssl': {
        if (!args) return this.sendMessage(chatId, 'Uso: `/ssl <dominio>`');
        try {
          const info: any = await this.devtools.sslInfo(args);
          return this.sendMessage(
            chatId,
            `*SSL ${args}*\nEmisor: ${info.issuer?.O || info.issuer?.CN}\nValido desde: ${info.valid_from}\nValido hasta: ${info.valid_to}\nDias restantes: ${info.daysUntilExpiry}\nSAN: ${info.subjectaltname?.slice(0, 200)}`,
          );
        } catch (e: any) { return this.sendMessage(chatId, `Error: ${e.message}`); }
      }
      case '/cve': {
        if (!args) return this.sendMessage(chatId, 'Uso: `/cve CVE-2024-1234`');
        try {
          const c: any = await this.devtools.cveInfo(args);
          if (!c.ok) return this.sendMessage(chatId, `Error: ${c.error}`);
          const cvss = c.cvss ? `\n*CVSS:* ${c.cvss.score} ${c.cvss.severity} (${c.cvss.version})\n*Vector:* \`${c.cvss.vector}\`` : '';
          return this.sendMessage(
            chatId,
            `*${c.id}*\nPublicado: ${c.published?.slice(0, 10)}${cvss}\n\n${c.description?.slice(0, 800)}`,
          );
        } catch (e: any) { return this.sendMessage(chatId, `Error: ${e.message}`); }
      }

      case '/uptime': {
        const u = this.system.uptime();
        return this.sendMessage(chatId, `*Uptime*: ${u.human}\nHost: \`${u.hostname}\` (${u.platform}/${u.arch})`);
      }
      case '/ip': {
        const ips = this.system.localIps().filter((i) => !i.internal && i.family === 'IPv4');
        if (!ips.length) return this.sendMessage(chatId, 'Sin interfaces externas.');
        return this.sendMessage(chatId, `*IPs locales*\n` + ips.map((i) => `- \`${i.address}\` (${i.iface})`).join('\n'));
      }
      case '/ippub':
      case '/ippublica': {
        const r = await this.system.publicIp();
        if (!r.ip) return this.sendMessage(chatId, `Error: ${r.error}`);
        return this.sendMessage(chatId, `IP publica: \`${r.ip}\``);
      }
      case '/latencia': {
        const m = this.ollama.metrics();
        if (!m.samples) return this.sendMessage(chatId, 'Sin muestras.');
        return this.sendMessage(
          chatId,
          `*Latencia Ollama* (n=${m.samples})\nURL: \`${m.activeUrl}\`\nP50: ${m.p50}ms · P95: ${m.p95}ms · P99: ${m.p99}ms · max: ${m.max}ms\nErrores 5m: ${m.errors5m}`,
        );
      }

      // ─── Notas ─────────────────────────────────────────
      case '/nota': {
        if (!args) return this.sendMessage(chatId, 'Uso: `/nota <texto>`');
        const n = await this.notes.create({
          text: args,
          source: 'telegram',
          sourceId: String(chatId),
          createdBy: `tg:${userId}`,
        });
        return this.sendMessage(chatId, `Nota guardada: \`${n.id.slice(0, 6)}\``);
      }
      case '/notas': {
        const list = await this.notes.list({ limit: 20 });
        if (!list.length) return this.sendMessage(chatId, 'No hay notas guardadas.');
        const txt = list
          .slice(0, 15)
          .map((n) => {
            const preview = n.text.slice(0, 80);
            return `\`${n.id.slice(0, 6)}\` · ${preview}${n.text.length > 80 ? '...' : ''}`;
          })
          .join('\n');
        return this.sendMessage(chatId, `*Notas* (${list.length})\n${txt}`);
      }
      case '/borrarnota': {
        if (!args) return this.sendMessage(chatId, 'Uso: `/borrarnota <id>`');
        const n = await this.notes.deleteByShortId(args);
        return this.sendMessage(chatId, n ? `Nota borrada \`${args}\`` : 'No encontrada.');
      }
      case '/organiza':
      case '/nota_ia':
      case '/organizar': {
        if (!args)
          return this.sendMessage(
            chatId,
            'Uso: `/organiza <texto largo>` — lo organizo con IA y lo mando a tu WhatsApp.',
          );
        try {
          const personal = await this.settings.getPersonalWhatsappChatId();
          if (!personal) {
            return this.sendMessage(
              chatId,
              '⚠ No tienes configurado tu *WhatsApp personal*.\n' +
                'Ve a Ajustes → "Mi WhatsApp personal" y configura un número antes de usar /organiza.',
            );
          }
          await this.sendMessage(
            chatId,
            '_Organizando con IA..._\n_(puede tardar unos segundos)_',
            null,
          );
          const result = await this.notes.organizeAndSendToWhatsapp({
            text: args,
            source: 'telegram',
            sourceId: String(chatId),
            createdBy: `tg:${userId}`,
            whatsappTarget: personal,
          });
          const status = result.delivered
            ? `📲 Enviado a WhatsApp \`${result.sentTo}\``
            : `⚠ No se pudo enviar a WhatsApp (revisa logs).`;
          return this.sendMessage(
            chatId,
            `*Nota organizada:*\n\n${result.organized}\n\n${status}\n_ID:_ \`${result.noteId.slice(0, 6)}\``,
          );
        } catch (e: any) {
          return this.sendMessage(chatId, `Error: ${e.message}`);
        }
      }

      default:
        return this.sendMessage(chatId, 'Comando desconocido. Usa /ayuda');
    }
  }

  private async replyWithOllama(chatId: number, text: string) {
    // Detección de intención (recordatorio/nota/organizar)
    const intentResult = await this.intent.detect({
      text,
      source: 'telegram',
      sourceId: String(chatId),
      createdBy: `tg:${chatId}`,
    });
    if (intentResult.intent !== 'chat') {
      await this.sendMessage(chatId, intentResult.reply);
      // Si el intent fue organizar, ya quedó como nota — también la
      // enviamos al WhatsApp personal con formato bonito.
      if (intentResult.intent === 'organize') {
        await this.maybeForwardOrganizedToWhatsapp(chatId, intentResult.reply);
      }
      return;
    }

    // Heurística "mensaje largo de Telegram" → organizar + mandar a WhatsApp.
    // Aplica si supera 220 caracteres O tiene 3+ saltos de línea (lluvia de
    // ideas). Si Carlos solo quiere chatear, mensajes cortos siguen siendo chat
    // normal con Ollama.
    const looksLikeBrainDump =
      text.length >= 220 || (text.match(/\n/g)?.length || 0) >= 3;
    const personal = await this.settings.getPersonalWhatsappChatId();
    if (looksLikeBrainDump && personal) {
      try {
        await this.sendMessage(chatId, '_Detectado mensaje largo → organizo con IA y mando a tu WhatsApp..._', null);
        const r = await this.notes.organizeAndSendToWhatsapp({
          text,
          source: 'telegram',
          sourceId: String(chatId),
          createdBy: `tg:${chatId}`,
          whatsappTarget: personal,
        });
        const status = r.delivered
          ? `📲 Enviado a WhatsApp \`${r.sentTo}\``
          : `⚠ No se pudo enviar a WhatsApp (revisa logs).`;
        await this.sendMessage(
          chatId,
          `*Nota organizada:*\n\n${r.organized}\n\n${status}\n_ID:_ \`${r.noteId.slice(0, 6)}\``,
        );
        return;
      } catch (e: any) {
        // Si el organize falla, caemos a chat normal sin interrumpir.
        await this.sendMessage(chatId, `_(no pude organizar: ${e.message}, sigo en chat normal)_`, null);
      }
    }

    const model = await this.settings.getActiveModel();
    const sys = await this.settings.getSystemPrompt();
    try {
      const reply = await this.ollama.chat(model, [
        { role: 'system', content: sys },
        { role: 'user', content: text },
      ]);
      const finalReply = reply || '_(vacio)_';
      await this.sendMessage(chatId, finalReply);
    } catch (e: any) {
      await this.sendMessage(chatId, `Error Ollama: ${e.message}`);
    }
  }

  /**
   * Reenvía contenido ya organizado al WhatsApp personal del usuario.
   * Silencioso si no hay personalWhatsappChatId configurado.
   */
  private async maybeForwardOrganizedToWhatsapp(tgChatId: number, content: string) {
    const target = await this.settings.getPersonalWhatsappChatId();
    if (!target) return;
    try {
      await this.openwa.sendText(target, content);
      await this.chat
        .recordOutgoing({ chatId: target, body: content, meta: { kind: 'tg-forward-organized' } })
        .catch(() => null);
      await this.sendMessage(tgChatId, `_(también enviado a tu WhatsApp \`${target}\`)_`, null);
    } catch (e: any) {
      this.logger.warn(`forward organized to wa fallo: ${e.message}`);
    }
  }

  private async replyWithOllamaPrompt(chatId: number, systemPrompt: string, userText: string) {
    const model = await this.settings.getActiveModel();
    try {
      const reply = await this.ollama.chat(model, [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ]);
      await this.sendMessage(chatId, reply || '_(vacio)_');
    } catch (e: any) {
      await this.sendMessage(chatId, `Error: ${e.message}`);
    }
  }
}

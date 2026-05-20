import { Injectable } from '@nestjs/common';
import { OpenWaService } from '../openwa/openwa.service';
import { OllamaService } from '../ollama/ollama.service';
import {
  BOT_MODES,
  BOT_MODE_DESCRIPTIONS,
  BotMode,
  SettingsService,
} from '../settings/settings.service';
import { ChatService } from '../chat/chat.service';
import { SystemService } from '../system/system.service';
import { LogsService } from '../logs/logs.service';
import { ReminderService } from '../reminder/reminder.service';
import { NotesService } from '../notes/notes.service';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const HELP_USER = `*Local AI Hub* — comandos

*IA*
/ayuda — esta ayuda
/estado — estado del sistema
/modelos — lista modelos Ollama
/modelo <nombre> — cambia modelo activo (admin)
/reset — borra contexto de esta conversacion
/contexto — nº de mensajes en contexto

*Sistema*
/ping — pong
/quien — tu chatId
/uptime — tiempo activo del backend
/ram — memoria
/cpu — cpu
/disco — disco
/temperatura — temperatura

*Recordatorios*
/recordar <expresion> — crea recordatorio (ej: hoy a las 18:00 revisar Docker)
/recordatorios — lista los activos
/borrar <id> — cancela un recordatorio

Cualquier otro mensaje sera respondido por la IA.`;

const HELP_ADMIN_EXTRA = `

*Admin*
/modo — muestra el modo actual
/modo <manual|private|ai|silent|maintenance> — cambia modo
/silencio — alias /modo silent
/resumir — alias /modo private
/ip — IPs locales del backend
/ippub — IP publica
/openwa — estado OpenWA
/ollama — estado y latencias Ollama
/latencia — metricas Ollama detalladas
/whitelist — ver whitelist
/whitelist add <chatId> — anadir chatId
/whitelist del <chatId> — quitar chatId
/admins — ver lista de admins
/docker — estado de contenedores (si hay socket)
/logs — ultimos logs`;

@Injectable()
export class CommandService {
  constructor(
    private readonly openwa: OpenWaService,
    private readonly ollama: OllamaService,
    private readonly settings: SettingsService,
    private readonly chat: ChatService,
    private readonly system: SystemService,
    private readonly logs: LogsService,
    private readonly reminder: ReminderService,
    private readonly notes: NotesService,
  ) {}

  isCommand(text: string) {
    return typeof text === 'string' && text.trim().startsWith('/');
  }

  async handle(
    chatId: string,
    text: string,
    opts: { isAdmin?: boolean } = {},
  ): Promise<boolean> {
    const trimmed = text.trim();
    const [cmd, ...rest] = trimmed.split(/\s+/);
    const arg = rest.join(' ').trim();
    const command = cmd.toLowerCase();
    const isAdmin = !!opts.isAdmin;

    const reply = async (msg: string) => {
      await this.chat.saveMessage({
        chatId,
        direction: 'out',
        role: 'assistant',
        body: msg,
        meta: { command },
      });
      await this.openwa.sendText(chatId, msg);
    };

    const adminOnly = async (): Promise<boolean> => {
      if (isAdmin) return true;
      await reply('Comando solo para administradores.');
      return false;
    };

    await this.logs.write(
      'info',
      'command',
      `${chatId}${isAdmin ? ' (admin)' : ''} -> ${command} ${arg}`,
    );

    switch (command) {
      case '/ayuda':
      case '/help':
      case '/start':
        await reply(HELP_USER + (isAdmin ? HELP_ADMIN_EXTRA : ''));
        return true;

      case '/ping':
        await reply('pong');
        return true;

      case '/quien':
        await reply(`Tu chatId: \`${chatId}\`\nAdmin: ${isAdmin ? 'si' : 'no'}`);
        return true;

      case '/estado': {
        const [wa, ai] = await Promise.all([this.openwa.health(), this.ollama.health()]);
        const model = await this.settings.getActiveModel();
        const mode = await this.settings.getBotMode();
        await reply(
          `*Estado*\n` +
            `Modo: \`${mode}\`\n` +
            `Backend: OK\n` +
            `OpenWA: ${wa.ok ? 'OK' : 'KO'}\n` +
            `Ollama: ${ai.ok ? `OK ${(ai as any).models} modelos · ${(ai as any).latencyMs}ms` : 'KO ' + (ai as any).error}\n` +
            `Modelo activo: *${model}*`,
        );
        return true;
      }

      case '/uptime': {
        const u = this.system.uptime();
        await reply(`Uptime: ${u.human}\nHost: \`${u.hostname}\` (${u.platform}/${u.arch})`);
        return true;
      }

      case '/modelos': {
        const models = await this.ollama.listModels();
        const active = await this.settings.getActiveModel();
        if (!models.length) {
          await reply('No hay modelos en Ollama.');
          return true;
        }
        const list = models
          .map((m) => `${m.name === active ? '>' : '-'} ${m.name}`)
          .join('\n');
        await reply(`*Modelos disponibles*\n${list}\n\nUsa: \`/modelo <nombre>\` (admin)`);
        return true;
      }

      case '/modelo': {
        if (!(await adminOnly())) return true;
        if (!arg) {
          await reply('Uso: `/modelo <nombre>`. Lista con `/modelos`');
          return true;
        }
        const models = await this.ollama.listModels();
        const match =
          models.find((m) => m.name === arg) || models.find((m) => m.name.startsWith(arg));
        if (!match) {
          await reply(`Modelo "${arg}" no encontrado. Usa /modelos.`);
          return true;
        }
        await this.settings.setActiveModel(match.name, `wa:${chatId}`);
        await reply(`Modelo activo: *${match.name}*`);
        return true;
      }

      case '/reset':
        await this.chat.resetContext(chatId);
        await this.openwa.sendText(chatId, 'Contexto borrado.');
        return true;

      case '/contexto': {
        const ctx = await this.chat.getContext(chatId);
        await reply(`Mensajes en contexto: ${ctx.length}`);
        return true;
      }

      case '/modo': {
        if (!arg) {
          const current = await this.settings.getBotMode();
          const list = BOT_MODES.map(
            (m) => `${m === current ? '>' : '-'} *${m}* — ${BOT_MODE_DESCRIPTIONS[m]}`,
          ).join('\n');
          await reply(`*Modo actual:* \`${current}\`\n\n${list}\n\nUso: /modo <nombre> (admin)`);
          return true;
        }
        if (!(await adminOnly())) return true;
        const mode = arg.toLowerCase() as BotMode;
        if (!BOT_MODES.includes(mode)) {
          await reply(`Modo invalido. Validos: ${BOT_MODES.join(', ')}`);
          return true;
        }
        await this.settings.setBotMode(mode, `wa:${chatId}`);
        await reply(`Modo cambiado a \`${mode}\`\n_${BOT_MODE_DESCRIPTIONS[mode]}_`);
        return true;
      }

      case '/silencio':
      case '/silenciar': {
        if (!(await adminOnly())) return true;
        await this.settings.setBotMode('silent', `wa:${chatId}`);
        await reply('Modo silencio activado. No respondo a nadie hasta /resumir.');
        return true;
      }

      case '/resumir':
      case '/activar': {
        if (!(await adminOnly())) return true;
        await this.settings.setBotMode('private', `wa:${chatId}`);
        await reply('Modo `private` activado. Vuelvo a responder a whitelist + admins.');
        return true;
      }

      case '/whitelist': {
        if (!(await adminOnly())) return true;
        const subcmd = (rest[0] || '').toLowerCase();
        const target = (rest[1] || '').trim();
        if (subcmd === 'add' && target) {
          if (!/^\d{6,18}@c\.us$/.test(target)) {
            await reply(`chatId invalido. Formato: 34670209033@c.us`);
            return true;
          }
          await this.settings.addAllowed(target, `wa:${chatId}`);
          await reply(`Anadido a whitelist: \`${target}\``);
          return true;
        }
        if ((subcmd === 'del' || subcmd === 'rm') && target) {
          await this.settings.removeAllowed(target, `wa:${chatId}`);
          await reply(`Quitado de whitelist: \`${target}\``);
          return true;
        }
        const list = await this.settings.getAllowedChatIds();
        const open = this.settings.isOpenToAll();
        await reply(
          `*Whitelist* (${list.length})\n` +
            (list.map((c) => `- \`${c}\``).join('\n') || '_(vacia)_') +
            `\n\nOPEN_TO_ALL: ${open ? 'si' : 'no'}` +
            `\n\nUso:\n- \`/whitelist add 34xxxxx@c.us\`\n- \`/whitelist del 34xxxxx@c.us\``,
        );
        return true;
      }

      case '/admins': {
        if (!(await adminOnly())) return true;
        const list = await this.settings.getAdminChatIds();
        await reply(
          `*Administradores* (${list.length})\n` +
            (list.map((c) => `- \`${c}\``).join('\n') || '_(vacia)_'),
        );
        return true;
      }

      case '/recordar': {
        if (!arg) {
          await reply('Uso: `/recordar <expresion>`\nEj: `/recordar hoy a las 18:00 revisar Docker`');
          return true;
        }
        try {
          const r: any = await this.reminder.parseAndCreate(arg, {
            createdBy: `wa:${chatId}`,
            whatsappChatId: chatId,
            defaultTarget: 'whatsapp',
          });
          const tz = await this.settings.getReminderTz();
          await reply(this.reminder.formatConfirmation(r, tz));
        } catch (e: any) {
          await reply(`Error: ${e.message}`);
        }
        return true;
      }

      case '/recordatorios': {
        const list = await this.reminder.list();
        if (!list.length) {
          await reply('No tienes recordatorios activos.');
          return true;
        }
        const filtered = isAdmin
          ? list
          : list.filter((r) => r.targetChatId === chatId || r.createdBy === `wa:${chatId}`);
        if (!filtered.length) {
          await reply('No tienes recordatorios activos.');
          return true;
        }
        const tz = await this.settings.getReminderTz();
        const txt = filtered
          .slice(0, 20)
          .map((r) => {
            const when = r.fireAt
              ? new Date(r.fireAt).toLocaleString('es-ES', { timeZone: tz })
              : `cron \`${r.cronExpression}\``;
            return `\`${r.id.slice(0, 6)}\` · ${r.target} · ${when}\n  _${r.text}_`;
          })
          .join('\n\n');
        await reply(`*Recordatorios activos*\n\n${txt}`);
        return true;
      }

      case '/borrar': {
        if (!arg) {
          await reply('Uso: `/borrar <id>` (los 6 primeros caracteres bastan)');
          return true;
        }
        const r = await this.reminder.deleteByShortId(arg);
        await reply(r ? `Borrado \`${arg}\`` : 'No encontrado.');
        return true;
      }

      // ─── Notas ────────────────────────────────────────────────
      case '/nota': {
        if (!arg) {
          await reply('Uso: `/nota <texto>` — guarda una nota');
          return true;
        }
        const n = await this.notes.create({
          text: arg,
          source: 'whatsapp',
          sourceId: chatId,
          createdBy: `wa:${chatId}`,
        });
        await reply(`Nota guardada: \`${n.id.slice(0, 6)}\``);
        return true;
      }

      case '/notas': {
        const list = await this.notes.list({ limit: 20 });
        if (!list.length) {
          await reply('No hay notas guardadas.');
          return true;
        }
        const txt = list
          .slice(0, 15)
          .map((n) => {
            const preview = n.text.slice(0, 80);
            return `\`${n.id.slice(0, 6)}\` · ${preview}${n.text.length > 80 ? '...' : ''}`;
          })
          .join('\n');
        await reply(`*Notas* (${list.length})\n${txt}\n\nUsa \`/nota <texto>\` para crear, \`/borrarnota <id>\` para borrar, \`/organiza <texto|id>\` para organizar.`);
        return true;
      }

      case '/borrarnota': {
        if (!arg) {
          await reply('Uso: `/borrarnota <id>`');
          return true;
        }
        const n = await this.notes.deleteByShortId(arg);
        await reply(n ? `Nota borrada \`${arg}\`` : 'Nota no encontrada.');
        return true;
      }

      case '/organiza': {
        if (!arg) {
          await reply('Uso: `/organiza <texto>` o `/organiza <id_nota>`');
          return true;
        }
        try {
          // Si arg parece un id corto (6 chars alfanumericos sin espacios), buscar nota
          if (/^[a-z0-9]{6,}$/.test(arg) && !arg.includes(' ')) {
            const n = await this.notes.findByShortId(arg);
            if (n) {
              const organized = await this.notes.organize({ id: n.id, text: n.text });
              await reply(`*Versión organizada:*\n\n${organized}`);
              return true;
            }
          }
          const organized = await this.notes.organize(arg);
          await reply(`*Versión organizada:*\n\n${organized}`);
        } catch (e: any) {
          await reply(`Error: ${e.message}`);
        }
        return true;
      }

      case '/openwa': {
        if (!(await adminOnly())) return true;
        const h = await this.openwa.health();
        await reply(`OpenWA: ${h.ok ? 'conectado' : 'KO ' + (h as any).error}`);
        return true;
      }

      case '/ollama': {
        const h = await this.ollama.health();
        await reply(
          `Ollama: ${h.ok ? `OK ${(h as any).models} modelos · ${(h as any).latencyMs}ms\nURL: ${(h as any).baseUrl}` : 'KO ' + (h as any).error}`,
        );
        return true;
      }

      case '/latencia': {
        const m = this.ollama.metrics();
        if (!m.samples) {
          await reply('Sin muestras todavia.');
          return true;
        }
        await reply(
          `*Latencia Ollama* (n=${m.samples})\n` +
            `URL activa: \`${m.activeUrl}\`\n` +
            `P50: ${m.p50}ms · P95: ${m.p95}ms · P99: ${m.p99}ms · max: ${m.max}ms\n` +
            `Errores ultimos 5min: ${m.errors5m}`,
        );
        return true;
      }

      case '/ram': {
        const m = await this.system.memory();
        await reply(`RAM: ${m.usedMB}MB / ${m.totalMB}MB (${m.percent}%)`);
        return true;
      }

      case '/cpu': {
        const c = await this.system.cpu();
        await reply(
          `CPU: ${c.cores} cores · load ${c.load1.toFixed(2)} / ${c.load5.toFixed(2)} / ${c.load15.toFixed(2)}`,
        );
        return true;
      }

      case '/disco': {
        const d: any = await this.system.disk();
        if (d.error) await reply('Disco no disponible');
        else await reply(`Disco: ${d.used} / ${d.size} (${d.percent})`);
        return true;
      }

      case '/temperatura': {
        const t = await this.system.temperature();
        if (t.celsius == null) await reply('Temperatura no disponible en este contenedor.');
        else await reply(`${t.celsius.toFixed(1)} C`);
        return true;
      }

      case '/ip': {
        if (!(await adminOnly())) return true;
        const ips = this.system.localIps().filter((i) => !i.internal && i.family === 'IPv4');
        if (!ips.length) {
          await reply('Sin interfaces externas detectadas.');
          return true;
        }
        await reply(
          `*IPs locales*\n` + ips.map((i) => `- \`${i.address}\` (${i.iface})`).join('\n'),
        );
        return true;
      }

      case '/ippub':
      case '/ippublica': {
        if (!(await adminOnly())) return true;
        const r = await this.system.publicIp();
        if (!r.ip) await reply(`Error: ${r.error || 'no se pudo obtener'}`);
        else await reply(`IP publica: \`${r.ip}\``);
        return true;
      }

      case '/docker': {
        if (!(await adminOnly())) return true;
        try {
          const { stdout } = await execAsync('docker ps --format "{{.Names}} {{.Status}}"');
          await reply(`*Docker*\n\`\`\`\n${stdout.trim().slice(0, 2500) || 'sin contenedores'}\n\`\`\``);
        } catch {
          await reply('Docker no accesible desde el backend (falta socket).');
        }
        return true;
      }

      case '/logs': {
        if (!(await adminOnly())) return true;
        const logs = await this.logs.list({ limit: 10 });
        const out = logs
          .map((l) => `[${l.level}] ${l.source}: ${l.message.slice(0, 80)}`)
          .join('\n');
        await reply(`*Ultimos logs*\n\`\`\`\n${out || 'sin logs'}\n\`\`\``);
        return true;
      }

      default:
        await this.openwa.sendText(chatId, `Comando desconocido: ${command}\nUsa /ayuda`);
        return true;
    }
  }
}

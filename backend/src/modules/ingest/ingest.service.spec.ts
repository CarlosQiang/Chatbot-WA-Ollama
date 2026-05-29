import { IngestService } from './ingest.service';

/**
 * Tests del pipeline crítico de ingest. Cubrimos en particular:
 *
 *  - Descarte de grupos (@g.us).
 *  - Descarte de eventos sin contenido.
 *  - El fix Auto-IA: cuando un chatId está en la lista Auto-IA, debe
 *    SALTAR el filtro de "modo manual" y SALTAR el intent detector
 *    (un "recuerdame X" cae a Ollama, no a recordatorios).
 *
 * Usamos dobles de los colaboradores con la API estricta que IngestService
 * llama de verdad. Mantenemos los dobles dentro del fichero — no merece
 * la pena un fixture global cuando solo este spec los necesita.
 */

type AnyFn = (...args: any[]) => any;
const stub = (fn?: AnyFn): jest.Mock => jest.fn(fn);

function buildSettings(overrides: Partial<{
  mode: string;
  admins: string[];
  allowed: string[];
  autoReply: string[];
}> = {}) {
  const mode = overrides.mode || 'private';
  const admins = overrides.admins || [];
  const allowed = overrides.allowed || [];
  const autoReply = overrides.autoReply || [];
  return {
    getBotMode: stub(async () => mode),
    isAdmin: stub(async (id: string) => admins.includes(id)),
    isAllowed: stub(async (id: string) => allowed.includes(id)),
    isAutoReply: stub(async (id: string) => autoReply.includes(id)),
  };
}

function buildOpenwa() {
  return {
    isOwnMessage: stub(async () => false),
    markMessageSeen: stub(async () => true),
    isOwnEcho: stub(async () => false),
    checkBurst: stub(async () => ({ tripped: false, count: 0 })),
    sendText: stub(async () => ({ ok: true })),
  };
}

function buildChat() {
  return {
    ensureChat: stub(async () => null),
    saveMessage: stub(async () => null),
    generateAndReply: stub(async () => ({ ok: true, reply: 'pong' })),
  };
}

function buildIntent(intent: 'chat' | 'reminder' | 'note' = 'chat') {
  return {
    detect: stub(async () => ({ intent, reply: intent === 'chat' ? '' : 'ok' })),
  };
}

function buildLogs() {
  return { write: stub(async () => null) };
}

function buildCommand() {
  return {
    isCommand: stub((t: string) => t.startsWith('/')),
    handle: stub(async () => null),
  };
}

function build(opts: {
  mode?: string;
  admins?: string[];
  allowed?: string[];
  autoReply?: string[];
  intent?: 'chat' | 'reminder' | 'note';
} = {}) {
  const settings = buildSettings(opts);
  const openwa = buildOpenwa();
  const chat = buildChat();
  const intent = buildIntent(opts.intent);
  const logs = buildLogs();
  const command = buildCommand();

  const svc = new IngestService(
    chat as any,
    command as any,
    openwa as any,
    logs as any,
    settings as any,
    intent as any,
  );

  return { svc, settings, openwa, chat, intent, logs, command };
}

const userId = '34670209033@c.us';

describe('IngestService.extract', () => {
  it('lee el formato OpenWA estándar', () => {
    const { svc } = build();
    const r = svc.extract({
      data: { chatId: userId, body: 'hola', id: 'abc', senderName: 'Carlos' },
    });
    expect(r.chatId).toBe(userId);
    expect(r.text).toBe('hola');
    expect(r.fromMe).toBe(false);
    expect(r.displayName).toBe('Carlos');
  });

  it('lee el formato Baileys (key.remoteJid + message.conversation)', () => {
    const { svc } = build();
    const r = svc.extract({
      message: {
        key: { remoteJid: userId, id: 'xyz', fromMe: false },
        message: { conversation: 'hola' },
      },
    });
    expect(r.chatId).toBe(userId);
    expect(r.text).toBe('hola');
  });
});

describe('IngestService.ingest — filtros básicos', () => {
  it('ignora payload sin chatId/text', async () => {
    const { svc } = build();
    const r = await svc.ingest({ data: {} });
    expect(r).toEqual({ ok: true, ignored: 'no_text' });
  });

  it('ignora grupos', async () => {
    const { svc } = build();
    const r = await svc.ingest({
      data: { chatId: '123-456@g.us', body: 'hola' },
    });
    expect(r).toEqual({ ok: true, ignored: 'group' });
  });

  it('rechaza chats no autorizados', async () => {
    const { svc, openwa, chat } = build({ mode: 'private' });
    const r = await svc.ingest({ data: { chatId: userId, body: 'hola' } });
    expect(r).toEqual({ ok: true, ignored: 'not_allowed' });
    expect(chat.generateAndReply).not.toHaveBeenCalled();
    expect(openwa.sendText).not.toHaveBeenCalled();
  });
});

describe('IngestService.ingest — Auto-IA (fix)', () => {
  it('bypassa modo manual cuando el chatId está en Auto-IA', async () => {
    const { svc, chat } = build({
      mode: 'manual',
      autoReply: [userId],
    });
    const r = await svc.ingest({ data: { chatId: userId, body: 'que tal' } });
    expect(r.ok).toBe(true);
    expect(r.handled).toBe('chat');
    // generateAndReply DEBE llamarse con isAutoReply=true para que ChatService
    // inyecte el prompt + persona de Auto-IA.
    expect(chat.generateAndReply).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ isAutoReply: true }),
    );
  });

  it('bypassa el intent detector cuando el chatId está en Auto-IA', async () => {
    // Aunque el texto sería detectado como recordatorio, en Auto-IA
    // debe ir directo a Ollama, no a IntentService.
    const { svc, intent, chat } = build({
      mode: 'private',
      autoReply: [userId],
      intent: 'reminder',
    });
    const r = await svc.ingest({
      data: { chatId: userId, body: 'recuerdame llamar al medico mañana' },
    });
    expect(r.handled).toBe('chat');
    expect(intent.detect).not.toHaveBeenCalled();
    expect(chat.generateAndReply).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ isAutoReply: true }),
    );
  });

  it('cuando NO es Auto-IA y el intent es no-chat, no llama a generateAndReply', async () => {
    const { svc, intent, chat, openwa } = build({
      mode: 'private',
      allowed: [userId],
      intent: 'reminder',
    });
    const r = await svc.ingest({
      data: { chatId: userId, body: 'recuerdame X mañana' },
    });
    expect(r.handled).toBe('chat');
    expect(intent.detect).toHaveBeenCalled();
    expect(chat.generateAndReply).not.toHaveBeenCalled();
    expect(openwa.sendText).toHaveBeenCalled();
  });

  it('cuando NO es Auto-IA pero el intent es chat normal, va a Ollama sin isAutoReply', async () => {
    const { svc, chat } = build({
      mode: 'private',
      allowed: [userId],
      intent: 'chat',
    });
    await svc.ingest({ data: { chatId: userId, body: 'hola que tal' } });
    expect(chat.generateAndReply).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ isAutoReply: false }),
    );
  });
});

describe('IngestService.ingest — modos', () => {
  it('modo silent: descarta todo silenciosamente', async () => {
    const { svc, chat, openwa } = build({
      mode: 'silent',
      autoReply: [userId],
    });
    const r = await svc.ingest({ data: { chatId: userId, body: 'hola' } });
    expect(r).toEqual({ ok: true, ignored: 'silent' });
    expect(chat.generateAndReply).not.toHaveBeenCalled();
    expect(openwa.sendText).not.toHaveBeenCalled();
  });

  it('modo manual sin Auto-IA y sin admin: ignora mensajes normales', async () => {
    const { svc, chat } = build({
      mode: 'manual',
      allowed: [userId],
    });
    const r = await svc.ingest({ data: { chatId: userId, body: 'hola' } });
    expect(r).toEqual({ ok: true, ignored: 'manual_only' });
    expect(chat.generateAndReply).not.toHaveBeenCalled();
  });
});

describe('IngestService.ingest — comandos', () => {
  it('admin lanzando comando: lo enruta a CommandService aunque esté en Auto-IA', async () => {
    const { svc, command, chat } = build({
      mode: 'private',
      admins: [userId],
      autoReply: [userId],
    });
    const r = await svc.ingest({ data: { chatId: userId, body: '/estado' } });
    expect(r).toEqual({ ok: true, handled: 'command' });
    expect(command.handle).toHaveBeenCalled();
    expect(chat.generateAndReply).not.toHaveBeenCalled();
  });
});

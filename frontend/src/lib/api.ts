import axios from 'axios';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3411';

const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
});

// Cliente con timeout largo (3 min) para llamadas que pueden cargar modelos grandes
export const apiLong = axios.create({
  baseURL: API_URL,
  timeout: 180_000,
});

// Adjunta automáticamente la API key en cada request si existe
function attachApiKey(client: typeof api) {
  if (!API_KEY) return;
  client.interceptors.request.use((config) => {
    config.headers = config.headers || {};
    (config.headers as any)['x-api-key'] = API_KEY;
    return config;
  });
}
attachApiKey(api);
attachApiKey(apiLong);

export type HealthResponse = {
  status: 'ok' | 'degraded';
  timestamp: string;
  services: {
    backend: { ok: boolean };
    database: { ok: boolean };
    redis: { ok: boolean };
    openwa: { ok: boolean; error?: string; data?: any };
    ollama: { ok: boolean; error?: string; models?: number };
  };
};

export type Model = { name: string; size?: number; modified_at?: string };
export type Chat = {
  id: string;
  chatId: string;
  phone?: string;
  displayName?: string;
  model?: string;
  lastMessageAt?: string;
  messageCount: number;
};
export type Message = {
  id: string;
  chatId: string;
  direction: 'in' | 'out';
  role: 'user' | 'assistant' | 'system';
  body: string;
  model?: string;
  status: string;
  error?: string;
  createdAt: string;
};
export type Log = {
  id: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
  createdAt: string;
  meta?: any;
};

export type OllamaSettings = {
  baseUrl: string;
  activeModel: string;
  status: 'online' | 'offline';
  latencyMs: number | null;
  models: string[];
  error?: string;
};

export type OllamaTestResult = {
  ok: boolean;
  status?: 'online' | 'offline';
  latencyMs?: number | null;
  models?: string[];
  error?: string;
};

export type DiagnosticResult = {
  ok: boolean;
  message?: string;
  error?: string;
  chatId?: string;
  step?: 'ollama' | 'whatsapp';
  ollamaModel?: string;
  ollamaBaseUrl?: string;
  reply?: string;
  messageId?: string | null;
  whatsappMessageId?: string | null;
};

export const apiClient = {
  health: () => api.get<HealthResponse>('/health').then((r) => r.data),
  systemOverview: () => api.get('/system').then((r) => r.data),

  listModels: () =>
    api.get<{ active: string; models: Model[] }>('/models').then((r) => r.data),
  listAllModels: () =>
    api
      .get<{
        active: string;
        primary: string;
        servers: Array<{
          url: string;
          isPrimary: boolean;
          ok: boolean;
          latencyMs: number | null;
          models: string[];
          error?: string;
        }>;
      }>('/models/all')
      .then((r) => r.data),
  selectModel: (model: string, url?: string) =>
    api
      .post<{ active: string; primary: string }>('/models/select', { model, url })
      .then((r) => r.data),

  listChats: () => api.get<Chat[]>('/chats').then((r) => r.data),
  listMessages: (chatId: string) =>
    api
      .get<Message[]>(`/chats/${encodeURIComponent(chatId)}/messages`)
      .then((r) => r.data),
  resetChat: (chatId: string) =>
    api
      .post(`/chats/${encodeURIComponent(chatId)}/reset`)
      .then((r) => r.data),
  sendMessage: (chatId: string, text: string) =>
    apiLong.post('/chats/send', { chatId, text }).then((r) => r.data),

  listLogs: (params?: { limit?: number; level?: string; source?: string }) =>
    api.get<Log[]>('/logs', { params }).then((r) => r.data),
  clearLogs: () => api.delete('/logs').then((r) => r.data),

  settings: () => api.get('/settings').then((r) => r.data),
  saveSettings: (data: Record<string, string>) =>
    api.put('/settings', data).then((r) => r.data),

  // ─── Ollama dinámico ───────────────────────────────────────
  getOllamaSettings: () =>
    api.get<OllamaSettings & { fallbackUrls?: string[] }>('/settings/ollama').then((r) => r.data),
  saveOllamaSettings: (data: { baseUrl?: string; activeModel?: string; fallbackUrls?: string[] }) =>
    api.put<OllamaSettings>('/settings/ollama', data).then((r) => r.data),
  testOllama: (baseUrl: string) =>
    apiLong
      .post<OllamaTestResult>('/settings/ollama/test', { baseUrl })
      .then((r) => r.data),

  // ─── Telegram ──────────────────────────────────────────────
  telegramStatus: () =>
    api
      .get<{ enabled: boolean; bot: any; error?: string; config?: any }>('/telegram/status')
      .then((r) => r.data),
  telegramConfig: () =>
    api
      .get<{
        hasToken: boolean;
        tokenMask: string;
        allowedUserIds: number[];
        bridgeWa: boolean;
        bridgeChatId: string;
      }>('/telegram/config')
      .then((r) => r.data),
  saveTelegramConfig: (data: {
    botToken?: string;
    allowedUserIds?: string;
    bridgeWa?: boolean;
    bridgeChatId?: string;
  }) => api.put('/telegram/config', data).then((r) => r.data),
  restartTelegram: () => api.post('/telegram/restart').then((r) => r.data),

  // ─── Reminders ─────────────────────────────────────────────
  listReminders: () =>
    api
      .get<{ tz: string; list: any[] }>('/reminders')
      .then((r) => r.data),
  createReminder: (input: string, telegramChatId?: string) =>
    api.post('/reminders', { input, telegramChatId }).then((r) => r.data),
  deleteReminder: (id: string) =>
    api.delete(`/reminders/${id}`).then((r) => r.data),

  // ─── Notes ─────────────────────────────────────────────────
  listNotes: () => api.get<any[]>('/notes').then((r) => r.data),
  createNote: (data: { text: string; title?: string; tags?: string[] }) =>
    api.post('/notes', data).then((r) => r.data),
  organizeNote: (data: { text?: string; id?: string }) =>
    apiLong.post<{ organized: string }>('/notes/organize', data).then((r) => r.data),
  deleteNote: (id: string) => api.delete(`/notes/${id}`).then((r) => r.data),

  // ─── Auto-Reply IA ─────────────────────────────────────────
  getAutoReply: () =>
    api
      .get<{
        enabled: boolean;
        chatIds: string[];
        nicknames: Record<string, string>;
      }>('/settings/auto-reply')
      .then((r) => r.data),
  saveAutoReply: (data: { enabled: boolean; chatIds?: string[] }) =>
    api.put('/settings/auto-reply', data).then((r) => r.data),
  /**
   * Setea (o borra si `nickname=null`) el alias humano para un chatId.
   * No requiere que el chatId esté ya en la lista — útil para pre-etiquetar.
   */
  setAutoReplyNickname: (chatId: string, nickname: string | null) =>
    api
      .put('/settings/auto-reply/nickname', { chatId, nickname })
      .then((r) => r.data),
  getAutoReplyPrompt: () =>
    api
      .get<{ prompt: string; persona: string; default: string }>(
        '/settings/auto-reply/prompt',
      )
      .then((r) => r.data),
  saveAutoReplyPrompt: (data: { prompt?: string; persona?: string }) =>
    api.put('/settings/auto-reply/prompt', data).then((r) => r.data),
  getBotMode: () =>
    api
      .get<{
        mode: string;
        available: string[];
        descriptions: Record<string, string>;
      }>('/settings/mode')
      .then((r) => r.data),
  diagnoseAutoReply: (chatId: string) =>
    api
      .get<{
        input: string;
        normalized: string | null;
        botChatId: string;
        mode: string;
        isAdmin: boolean;
        isAutoTarget: boolean;
        isInWhitelist: boolean;
        autoReplyEnabled: boolean;
        autoReplyListSize: number;
        willReply: boolean;
        willUseAutoIaPrompt: boolean;
        reason: string;
      }>('/settings/auto-reply/diagnose', { params: { chatId } })
      .then((r) => r.data),

  // ─── Whitelist chatIds ─────────────────────────────────────
  getAllowedChats: () =>
    api
      .get<{
        allowedChatIds: string[];
        botPhone: string;
        personalWhatsappChatId?: string;
      }>('/settings/allowed-chats')
      .then((r) => r.data),
  saveAllowedChats: (chatIds: string[]) =>
    api
      .put<{ allowedChatIds: string[] }>('/settings/allowed-chats', { chatIds })
      .then((r) => r.data),

  // ─── Personal WhatsApp (destino flujos Telegram) ───────────
  getPersonalWa: () =>
    api
      .get<{ chatId: string; botPhone: string }>('/settings/personal-whatsapp')
      .then((r) => r.data),
  savePersonalWa: (chatId: string) =>
    api
      .put<{ chatId: string }>('/settings/personal-whatsapp', { chatId })
      .then((r) => r.data),

  // ─── Proveedor IA (Ollama | OpenAI) ───────────────────────
  getAiSettings: () =>
    api
      .get<{
        provider: 'ollama' | 'openai';
        model: string;
        temperature: number;
        openaiConfigured: boolean;
        openaiBaseUrl: string;
        availableProviders: Array<'ollama' | 'openai'>;
      }>('/settings/ai')
      .then((r) => r.data),
  saveAiSettings: (data: {
    provider?: 'ollama' | 'openai';
    temperature?: number;
    openaiApiKey?: string;
    openaiBaseUrl?: string;
    openaiModel?: string;
  }) => api.put('/settings/ai', data).then((r) => r.data),
  testOpenAi: (data: { baseUrl?: string; apiKey?: string }) =>
    apiLong
      .post<{ ok: boolean; models?: string[]; error?: string; latencyMs?: number }>(
        '/settings/ai/test-openai',
        data,
      )
      .then((r) => r.data),

  // ─── Prompts personalizables ──────────────────────────────
  getPrompts: () =>
    api
      .get<{
        notes: string;
        reminders: string;
        remindersAiFallback: boolean;
        defaults: { notes: string; reminders: string };
      }>('/settings/prompts')
      .then((r) => r.data),
  savePrompts: (data: {
    notes?: string;
    reminders?: string;
    remindersAiFallback?: boolean;
  }) => api.put('/settings/prompts', data).then((r) => r.data),

  // ─── Diagnostics ───────────────────────────────────────────
  testWhatsapp: (chatId?: string) =>
    api
      .post<DiagnosticResult>('/diagnostics/whatsapp/test-message', { chatId })
      .then((r) => r.data),
  testOllamaWhatsapp: (chatId?: string, prompt?: string) =>
    apiLong
      .post<DiagnosticResult>('/diagnostics/ollama-whatsapp/test-message', {
        chatId,
        prompt,
      })
      .then((r) => r.data),

  openwaSession: () => api.get('/openwa/session').then((r) => r.data),
  openwaQr: () => api.get('/openwa/qr').then((r) => r.data),
  openwaWebhooks: () => api.get('/openwa/webhooks').then((r) => r.data),
  openwaRegisterWebhook: (url?: string) =>
    api.post('/openwa/webhooks/register', { url }).then((r) => r.data),

  // ─── OpenWA · gestión completa desde el panel ──────────────
  openwaListSessions: () =>
    api.get<any[]>('/openwa/sessions').then((r) => r.data),
  openwaGetSessionById: (id: string) =>
    api.get(`/openwa/sessions/${id}`).then((r) => r.data),
  openwaGetQrById: (id: string) =>
    api.get(`/openwa/sessions/${id}/qr`).then((r) => r.data),
  openwaStartSession: (id?: string) =>
    api
      .post(id ? `/openwa/sessions/${id}/start` : '/openwa/session/start')
      .then((r) => r.data),
  openwaStopSession: (id?: string) =>
    api
      .post(id ? `/openwa/sessions/${id}/stop` : '/openwa/session/stop')
      .then((r) => r.data),
  openwaLogoutSession: (id?: string) =>
    api
      .post(id ? `/openwa/sessions/${id}/logout` : '/openwa/session/logout')
      .then((r) => r.data),
  openwaSwitchSession: (id: string) =>
    api.post(`/openwa/sessions/${id}/switch`).then((r) => r.data),
  openwaCreateSession: (data: { name: string; phone?: string; setActive?: boolean }) =>
    api.post('/openwa/sessions', data).then((r) => r.data),

  // Config (URL + API key + sessionId) editable desde panel
  openwaGetConfig: () =>
    api
      .get<{
        apiUrl: string;
        apiKeyMask: string;
        hasApiKey: boolean;
        sessionId: string;
        sessionName: string;
        sessionPhone: string;
      }>('/openwa/config')
      .then((r) => r.data),
  openwaSaveConfig: (data: {
    apiUrl?: string;
    apiKey?: string;
    sessionId?: string;
    sessionName?: string;
    sessionPhone?: string;
  }) => api.put('/openwa/config', data).then((r) => r.data),
};

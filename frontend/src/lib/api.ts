import axios from 'axios';

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3411';

const API_KEY = process.env.NEXT_PUBLIC_API_KEY || '';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 30_000,
});

// Adjunta automáticamente la API key en cada request si existe
if (API_KEY) {
  api.interceptors.request.use((config) => {
    config.headers = config.headers || {};
    (config.headers as any)['x-api-key'] = API_KEY;
    return config;
  });
}

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
  selectModel: (model: string) =>
    api.post<{ active: string }>('/models/select', { model }).then((r) => r.data),

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
    api.post('/chats/send', { chatId, text }).then((r) => r.data),

  listLogs: (params?: { limit?: number; level?: string; source?: string }) =>
    api.get<Log[]>('/logs', { params }).then((r) => r.data),
  clearLogs: () => api.delete('/logs').then((r) => r.data),

  settings: () => api.get('/settings').then((r) => r.data),
  saveSettings: (data: Record<string, string>) =>
    api.put('/settings', data).then((r) => r.data),

  // ─── Ollama dinámico ───────────────────────────────────────
  getOllamaSettings: () =>
    api.get<OllamaSettings>('/settings/ollama').then((r) => r.data),
  saveOllamaSettings: (data: { baseUrl?: string; activeModel?: string }) =>
    api.put<OllamaSettings>('/settings/ollama', data).then((r) => r.data),
  testOllama: (baseUrl: string) =>
    api
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
  listReminders: () => api.get<any[]>('/reminders').then((r) => r.data),
  createReminder: (input: string, telegramChatId?: string) =>
    api.post('/reminders', { input, telegramChatId }).then((r) => r.data),
  deleteReminder: (id: string) =>
    api.delete(`/reminders/${id}`).then((r) => r.data),

  // ─── Auto-Reply IA ─────────────────────────────────────────
  getAutoReply: () =>
    api.get<{ enabled: boolean; chatId: string }>('/settings/auto-reply').then((r) => r.data),
  saveAutoReply: (data: { enabled: boolean; chatId?: string }) =>
    api.put('/settings/auto-reply', data).then((r) => r.data),

  // ─── Whitelist chatIds ─────────────────────────────────────
  getAllowedChats: () =>
    api
      .get<{ allowedChatIds: string[]; botPhone: string }>('/settings/allowed-chats')
      .then((r) => r.data),
  saveAllowedChats: (chatIds: string[]) =>
    api
      .put<{ allowedChatIds: string[] }>('/settings/allowed-chats', { chatIds })
      .then((r) => r.data),

  // ─── Diagnostics ───────────────────────────────────────────
  testWhatsapp: (chatId?: string) =>
    api
      .post<DiagnosticResult>('/diagnostics/whatsapp/test-message', { chatId })
      .then((r) => r.data),
  testOllamaWhatsapp: (chatId?: string, prompt?: string) =>
    api
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
};

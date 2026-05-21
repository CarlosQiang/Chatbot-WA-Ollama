'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/loading';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Save, Plug, Phone, Shield, Plus, X } from 'lucide-react';

const isValidUrl = (s: string) => /^https?:\/\/\S+/i.test(s);

/**
 * Normalización flexible — espejo de `normalizeChatId` del backend.
 * Acepta cualquier formato razonable, devuelve `34XXXXXXXXX@c.us` o null.
 */
function normalizeChatId(input: string): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  const atIdx = raw.indexOf('@');
  const localPart = atIdx >= 0 ? raw.slice(0, atIdx) : raw;
  const digits = localPart.replace(/\D/g, '');
  if (!/^\d{6,18}$/.test(digits)) return null;
  return `${digits}@c.us`;
}
const isValidChatId = (s: string) => !!normalizeChatId(s);

export function SettingsView() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ['settings'], queryFn: apiClient.settings });
  const allowed = useQuery({ queryKey: ['allowedChats'], queryFn: apiClient.getAllowedChats });
  const ollama = useQuery({
    queryKey: ['ollamaSettings'],
    queryFn: apiClient.getOllamaSettings,
  });
  const webhooks = useQuery({
    queryKey: ['webhooks'],
    queryFn: apiClient.openwaWebhooks,
  });
  const session = useQuery({
    queryKey: ['session'],
    queryFn: apiClient.openwaSession,
  });

  const [systemPrompt, setSystemPrompt] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('');
  const [activeModel, setActiveModel] = useState('');
  const [testChatId, setTestChatId] = useState('');
  const [allowedList, setAllowedList] = useState<string[]>([]);
  const [newAllowed, setNewAllowed] = useState('');

  useEffect(() => {
    if (settings.data?.system_prompt) setSystemPrompt(settings.data.system_prompt);
    if (settings.data?.testWhatsappChatId) setTestChatId(settings.data.testWhatsappChatId);
  }, [settings.data]);

  useEffect(() => {
    if (allowed.data?.allowedChatIds) setAllowedList(allowed.data.allowedChatIds);
  }, [allowed.data]);

  useEffect(() => {
    if (ollama.data) {
      setOllamaUrl((u) => u || ollama.data.baseUrl);
      setActiveModel((m) => m || ollama.data.activeModel);
    }
  }, [ollama.data]);

  const saveBasic = useMutation({
    mutationFn: (values: Record<string, string>) => apiClient.saveSettings(values),
    onSuccess: () => {
      toast.success('Ajustes guardados');
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const saveAllowed = useMutation({
    mutationFn: (list: string[]) => apiClient.saveAllowedChats(list),
    onSuccess: () => {
      toast.success('Whitelist actualizada');
      qc.invalidateQueries({ queryKey: ['allowedChats'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const saveOllama = useMutation({
    mutationFn: () =>
      apiClient.saveOllamaSettings({ baseUrl: ollamaUrl.trim(), activeModel: activeModel.trim() }),
    onSuccess: (r) => {
      toast.success('Servidor Ollama actualizado correctamente.');
      qc.invalidateQueries({ queryKey: ['ollamaSettings'] });
      qc.invalidateQueries({ queryKey: ['models'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['health'] });
      if (r?.models?.length) setActiveModel((m) => (r.models.includes(m) ? m : r.activeModel));
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const testOllama = useMutation({
    mutationFn: () => apiClient.testOllama(ollamaUrl.trim()),
    onMutate: () => toast.loading('Probando conexión…', { id: 'oltest' }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(
          `Conexión correcta con Ollama. Modelos encontrados: ${r.models?.length ?? 0}.`,
          { id: 'oltest' },
        );
        qc.invalidateQueries({ queryKey: ['ollamaSettings'] });
      } else {
        toast.error(
          r.error ||
            'No se pudo conectar con ese servidor Ollama. Revisa la IP, el puerto o si la máquina está encendida.',
          { id: 'oltest' },
        );
      }
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || e.message, { id: 'oltest' }),
  });

  const registerWebhook = useMutation({
    mutationFn: () => apiClient.openwaRegisterWebhook(),
    onSuccess: () => {
      toast.success('Webhook registrado en OpenWA');
      qc.invalidateQueries({ queryKey: ['webhooks'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const addAllowed = () => {
    const normalized = normalizeChatId(newAllowed);
    if (!normalized) {
      toast.error('Número inválido. Acepta 612345678, +34612345678, 34 612 345 678...');
      return;
    }
    if (allowedList.includes(normalized)) {
      toast.error('Ya está en la lista');
      return;
    }
    setAllowedList([...allowedList, normalized]);
    setNewAllowed('');
  };

  const removeAllowed = (id: string) => {
    setAllowedList(allowedList.filter((x) => x !== id));
  };

  const urlValid = isValidUrl(ollamaUrl);
  const newAllowedValid = !newAllowed || isValidChatId(newAllowed);
  const botPhone = allowed.data?.botPhone || (settings.data as any)?.botPhone || '';
  const selfChatId = botPhone ? `${botPhone}@c.us` : '';

  return (
    <div className="space-y-4">
      {/* ── NÚMEROS DE WHATSAPP ────────────────────────────── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <Phone size={13} /> Números de WhatsApp
          </span>
        }
      >
        <div className="space-y-4">
          {/* Bot conectado */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5 block">
              Bot conectado (sesión OpenWA)
            </label>
            <div className="bg-bg-subtle/40 border border-border rounded-md px-3 py-2 text-sm font-mono flex items-center justify-between">
              <span>{botPhone || '—'}</span>
              <span className="text-[10px] text-fg-subtle uppercase tracking-wider">
                solo lectura
              </span>
            </div>
            <div className="text-[11px] text-fg-subtle mt-1">
              Es el número conectado a OpenWA. Para cambiarlo, escanea otro QR desde el dashboard de OpenWA.
              Si escribes a este número desde su propio móvil, también recibirás respuestas (modo self-chat).
            </div>
          </div>

          {/* Personal WhatsApp — destino para flujos Telegram → IA → WA */}
          <PersonalWaSection />

          {/* Test chatId */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5 block">
              WhatsApp para botones de TEST
            </label>
            <div className="flex gap-2">
              <input
                value={testChatId}
                onChange={(e) => setTestChatId(e.target.value)}
                placeholder="612345678 · +34612345678 · 34670209033@c.us"
                className="flex-1 bg-bg-subtle/60 border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-border-strong"
              />
              <Button
                variant="primary"
                onClick={() => {
                  const n = normalizeChatId(testChatId);
                  if (!n) {
                    toast.error('Número inválido');
                    return;
                  }
                  setTestChatId(n);
                  saveBasic.mutate({ testWhatsappChatId: n });
                }}
                disabled={saveBasic.isPending || !isValidChatId(testChatId)}
              >
                <Save size={12} /> Guardar
              </Button>
            </div>
            <div className="text-[11px] text-fg-subtle mt-1">
              Número al que se enviarán los mensajes de prueba desde la vista <strong>Conexiones</strong>.
              Por defecto: tu propio número.
            </div>
          </div>

          {/* Allowed list */}
          <div>
            <label className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5 block flex items-center gap-1.5">
              <Shield size={11} /> WhatsApp permitidos para chatear (whitelist)
            </label>
            <div className="space-y-1.5 mb-2">
              {allowedList.length === 0 ? (
                <div className="text-xs text-fg-muted bg-bg-subtle/40 border border-border rounded-md px-3 py-2">
                  Lista vacía → <strong>el bot responde a cualquier número</strong> que le escriba.
                </div>
              ) : (
                allowedList.map((id) => (
                  <div
                    key={id}
                    className="flex items-center justify-between bg-bg-subtle/40 border border-border rounded-md px-3 py-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{id}</span>
                      {selfChatId === id && (
                        <span className="text-[10px] uppercase tracking-wider text-accent">
                          tú mismo
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => removeAllowed(id)}
                      className="text-fg-muted hover:text-danger transition-colors"
                      aria-label="Quitar"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="flex gap-2">
              <input
                value={newAllowed}
                onChange={(e) => setNewAllowed(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addAllowed()}
                placeholder="612345678 · +34612345678 · 34 612 345 678"
                className="flex-1 bg-bg-subtle/60 border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-border-strong"
              />
              <Button variant="outline" onClick={addAllowed} disabled={!newAllowedValid}>
                <Plus size={12} /> Añadir
              </Button>
            </div>
            {newAllowed && newAllowedValid && normalizeChatId(newAllowed) && (
              <div className="text-[11px] text-fg-subtle mt-1">
                Se guardará como: <code className="text-fg-muted">{normalizeChatId(newAllowed)}</code>
              </div>
            )}
            {newAllowed && !newAllowedValid && (
              <div className="text-[11px] text-danger mt-1">
                Número inválido. Necesita entre 6 y 18 dígitos.
              </div>
            )}
            <div className="text-[11px] text-fg-subtle mt-2">
              Pega los números en cualquier formato (con/sin <code>+</code>, espacios, etc.).
              Si la lista tiene contenido, el bot <strong>solo responderá a esos chats</strong>.
              Recuerda incluirte a ti mismo (<code className="text-fg-muted">{selfChatId || '34XXXXXXXXX@c.us'}</code>).
            </div>
            <div className="mt-3 flex justify-end gap-2">
              {selfChatId && !allowedList.includes(selfChatId) && (
                <Button variant="outline" onClick={() => setAllowedList([...allowedList, selfChatId])}>
                  + Añadirme a mí mismo
                </Button>
              )}
              <Button
                variant="primary"
                onClick={() => saveAllowed.mutate(allowedList)}
                disabled={saveAllowed.isPending}
              >
                <Save size={12} /> Guardar whitelist
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* ── OLLAMA ───────────────────────────────────────── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <Plug size={13} /> Ollama
          </span>
        }
        action={
          ollama.data && (
            <span className="flex items-center gap-2 text-xs">
              <StatusBadge ok={ollama.data.status === 'online'} />
              {ollama.data.latencyMs != null && (
                <span className="text-fg-muted">· {ollama.data.latencyMs}ms</span>
              )}
            </span>
          )
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5 block">
              Servidor Ollama
            </label>
            <input
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://192.168.8.150:11434"
              className="w-full bg-bg-subtle/60 border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-border-strong"
            />
            {ollamaUrl && !urlValid && (
              <div className="text-[11px] text-danger mt-1">
                ⚠ Debe empezar por http:// o https://
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => testOllama.mutate()}
              disabled={!urlValid || testOllama.isPending}
            >
              <RefreshCw size={12} className={testOllama.isPending ? 'animate-spin' : ''} />
              Probar conexión
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5 block">
              Modelo activo
            </label>
            <select
              value={activeModel}
              onChange={(e) => setActiveModel(e.target.value)}
              className="w-full bg-bg-subtle/60 border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-border-strong"
            >
              {ollama.data?.models?.length ? (
                ollama.data.models.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))
              ) : (
                <option value="">— sin modelos detectados —</option>
              )}
            </select>
            {ollama.isLoading && <Skeleton className="h-4 w-32 mt-2" />}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => ollama.refetch()}
              disabled={ollama.isFetching}
            >
              <RefreshCw size={12} className={ollama.isFetching ? 'animate-spin' : ''} />
              Actualizar modelos
            </Button>
            <Button
              variant="primary"
              onClick={() => saveOllama.mutate()}
              disabled={!urlValid || saveOllama.isPending}
            >
              <Save size={12} />
              Guardar cambios
            </Button>
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border text-[11px] text-fg-subtle">
          Acepta cualquier IP local con Ollama (ej. <code className="text-fg-muted">http://192.168.8.150:11434</code>).
          No uses <code className="text-fg-muted">localhost</code> porque el backend corre en Docker.
          Prioridad: dashboard → variable de entorno → host.docker.internal:11434.
        </div>
      </Card>

      {/* PROMPT */}
      <Card title="Prompt del sistema">
        <textarea
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          rows={4}
          className="w-full bg-bg-subtle/60 border border-border rounded-md p-3 text-sm font-mono focus:outline-none focus:border-border-strong"
        />
        <div className="mt-3 flex justify-end">
          <Button
            variant="primary"
            onClick={() => saveBasic.mutate({ system_prompt: systemPrompt })}
            disabled={saveBasic.isPending}
          >
            <Save size={12} />
            Guardar prompt
          </Button>
        </div>
      </Card>

      {/* OpenWA */}
      <Card title="Sesión OpenWA">
        <div className="text-xs font-mono space-y-1">
          <div>
            <span className="text-fg-subtle">id:</span> {session.data?.id || '—'}
          </div>
          <div>
            <span className="text-fg-subtle">name:</span> {session.data?.name || '—'}
          </div>
          <div>
            <span className="text-fg-subtle">status:</span> {session.data?.status || '—'}
          </div>
          <div>
            <span className="text-fg-subtle">phone:</span> {session.data?.phone || session.data?.me?.user || '—'}
          </div>
        </div>
      </Card>

      <Card
        title="Webhooks OpenWA"
        action={
          <Button
            size="sm"
            variant="primary"
            onClick={() => registerWebhook.mutate()}
            disabled={registerWebhook.isPending}
          >
            Registrar este backend
          </Button>
        }
      >
        <pre className="text-[11px] font-mono bg-bg-subtle/50 p-3 rounded-md overflow-x-auto max-h-64">
{JSON.stringify(webhooks.data || [], null, 2)}
        </pre>
      </Card>
    </div>
  );
}

/**
 * Personal WhatsApp — destino por defecto cuando un recordatorio o nota
 * se crea desde Telegram o desde el dashboard. Si está vacío, fallback
 * automático al self-chat del bot (OPENWA_SESSION_PHONE@c.us).
 */
function PersonalWaSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['personalWa'],
    queryFn: apiClient.getPersonalWa,
  });
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (data?.chatId) setDraft(data.chatId);
  }, [data?.chatId]);

  const save = useMutation({
    mutationFn: (chatId: string) => apiClient.savePersonalWa(chatId),
    onSuccess: (r) => {
      toast.success(r.chatId ? `Guardado: ${r.chatId}` : 'WhatsApp personal limpiado');
      qc.invalidateQueries({ queryKey: ['personalWa'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const normalized = normalizeChatId(draft);
  const valid = draft.trim() === '' || !!normalized;

  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5 block">
        Mi WhatsApp personal (destino flujos Telegram)
      </label>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={data?.botPhone ? `${data.botPhone}@c.us (por defecto: self-chat)` : '612345678'}
          className="flex-1 bg-bg-subtle/60 border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-border-strong"
        />
        <Button
          variant="primary"
          onClick={() => {
            const v = draft.trim() === '' ? '' : (normalized || '');
            if (!valid) {
              toast.error('Número inválido');
              return;
            }
            save.mutate(v);
          }}
          disabled={save.isPending || !valid}
        >
          <Save size={12} /> Guardar
        </Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-4 w-32 mt-2" />
      ) : (
        <div className="text-[11px] text-fg-subtle mt-1">
          {data?.chatId
            ? <>Actualmente: <code className="text-fg-muted">{data.chatId}</code></>
            : <>Sin configurar → recordatorios y notas creados desde Telegram se enviarán al self-chat del bot.</>}
        </div>
      )}
      {draft && normalized && draft !== normalized && (
        <div className="text-[11px] text-fg-subtle mt-1">
          Se guardará como: <code className="text-fg-muted">{normalized}</code>
        </div>
      )}
      <div className="text-[11px] text-fg-subtle mt-1.5">
        Cuando crees un recordatorio o nota desde Telegram o desde el dashboard, el bot lo enviará
        a este número de WhatsApp. Acepta cualquier formato.
      </div>
    </div>
  );
}

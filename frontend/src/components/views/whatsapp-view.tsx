'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/loading';
import { motion } from 'framer-motion';
import {
  MessageCircle,
  Smartphone,
  Save,
  Eye,
  EyeOff,
  RefreshCw,
  Power,
  PowerOff,
  LogOut,
  QrCode,
  Plus,
  ArrowRightLeft,
  Key,
  Globe,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Vista WhatsApp / OpenWA.
 *
 * Permite gestionar TODO desde el panel sin tocar código ni .env:
 *  - Editar API URL + API key de OpenWA
 *  - Ver estado y datos de la sesión activa
 *  - Listar todas las sesiones disponibles en OpenWA
 *  - Cambiar de sesión activa
 *  - Crear sesión nueva (escaneo de nuevo QR)
 *  - Arrancar / parar / cerrar sesión
 *  - Ver QR cuando la sesión está pendiente de escaneo
 *  - Registrar el webhook contra el backend
 */
export function WhatsappView() {
  const qc = useQueryClient();

  const config = useQuery({
    queryKey: ['openwaConfig'],
    queryFn: apiClient.openwaGetConfig,
  });
  const session = useQuery({
    queryKey: ['session'],
    queryFn: apiClient.openwaSession,
    refetchInterval: 10_000,
  });
  const sessions = useQuery({
    queryKey: ['openwaSessions'],
    queryFn: apiClient.openwaListSessions,
    refetchInterval: 15_000,
  });
  const health = useQuery({
    queryKey: ['health'],
    queryFn: apiClient.health,
    refetchInterval: 10_000,
  });
  const webhooks = useQuery({
    queryKey: ['webhooks'],
    queryFn: apiClient.openwaWebhooks,
  });

  // ── Estado local de edición de config ──
  const [apiUrl, setApiUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [sessionPhone, setSessionPhone] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (config.data) {
      setApiUrl(config.data.apiUrl || '');
      setSessionId(config.data.sessionId || '');
      setSessionName(config.data.sessionName || '');
      setSessionPhone(config.data.sessionPhone || '');
    }
  }, [config.data]);

  // ── Estado local del wizard "nueva sesión" ──
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);

  // ── QR de la sesión seleccionada ──
  const qrQuery = useQuery({
    queryKey: ['openwaQrById', qrSessionId],
    queryFn: () =>
      qrSessionId ? apiClient.openwaGetQrById(qrSessionId) : Promise.resolve(null),
    enabled: !!qrSessionId,
    refetchInterval: 4000,
  });

  // ── Mutaciones ──
  const saveConfig = useMutation({
    mutationFn: () =>
      apiClient.openwaSaveConfig({
        apiUrl: apiUrl.trim() || undefined,
        ...(apiKey ? { apiKey } : {}),
        sessionId: sessionId.trim() || undefined,
        sessionName: sessionName.trim() || undefined,
        sessionPhone: sessionPhone.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('Config OpenWA guardada');
      setApiKey('');
      qc.invalidateQueries({ queryKey: ['openwaConfig'] });
      qc.invalidateQueries({ queryKey: ['session'] });
      qc.invalidateQueries({ queryKey: ['openwaSessions'] });
      qc.invalidateQueries({ queryKey: ['health'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const startSession = useMutation({
    mutationFn: (id?: string) => apiClient.openwaStartSession(id),
    onSuccess: () => {
      toast.success('Sesión arrancada');
      qc.invalidateQueries({ queryKey: ['session'] });
      qc.invalidateQueries({ queryKey: ['openwaSessions'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const stopSession = useMutation({
    mutationFn: (id?: string) => apiClient.openwaStopSession(id),
    onSuccess: () => {
      toast.success('Sesión parada');
      qc.invalidateQueries({ queryKey: ['session'] });
      qc.invalidateQueries({ queryKey: ['openwaSessions'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const logoutSession = useMutation({
    mutationFn: (id?: string) => apiClient.openwaLogoutSession(id),
    onSuccess: () => {
      toast.success('Sesión cerrada (logout)');
      qc.invalidateQueries({ queryKey: ['session'] });
      qc.invalidateQueries({ queryKey: ['openwaSessions'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const switchSession = useMutation({
    mutationFn: (id: string) => apiClient.openwaSwitchSession(id),
    onSuccess: (r) => {
      toast.success(`Sesión activa: ${r.name || r.id}`);
      qc.invalidateQueries({ queryKey: ['openwaConfig'] });
      qc.invalidateQueries({ queryKey: ['session'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const createSession = useMutation({
    mutationFn: () =>
      apiClient.openwaCreateSession({
        name: newName.trim(),
        phone: newPhone.trim() || undefined,
        setActive: true,
      }),
    onSuccess: (r: any) => {
      toast.success(`Sesión "${newName}" creada y activada`);
      const newId = r?.id || r?.sessionId;
      setNewName('');
      setNewPhone('');
      setShowCreate(false);
      if (newId) setQrSessionId(newId);
      qc.invalidateQueries({ queryKey: ['openwaConfig'] });
      qc.invalidateQueries({ queryKey: ['session'] });
      qc.invalidateQueries({ queryKey: ['openwaSessions'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const registerWebhook = useMutation({
    mutationFn: () => apiClient.openwaRegisterWebhook(),
    onSuccess: () => {
      toast.success('Webhook registrado en OpenWA');
      qc.invalidateQueries({ queryKey: ['webhooks'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  // ── Helpers de render ──
  const sessionStatus = session.data?.status || '·';
  const isConnected =
    sessionStatus.toLowerCase() === 'connected' ||
    sessionStatus.toLowerCase() === 'ready';

  const qrText: string | null =
    (qrQuery.data?.qr || qrQuery.data?.data?.qr || qrQuery.data?.qrCode) ?? null;
  const qrImageDataUrl: string | null =
    qrText && qrText.startsWith('data:image')
      ? qrText
      : qrText
        ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrText)}`
        : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-4"
    >
      {/* ─── Estado actual ─── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <MessageCircle size={13} /> Sesión WhatsApp activa
          </span>
        }
        action={<StatusBadge ok={isConnected} />}
      >
        <div className="space-y-2 text-sm">
          <Row
            label="Nombre"
            value={
              session.isLoading ? (
                <Skeleton className="h-4 w-32" />
              ) : (
                <span className="font-mono">{session.data?.name || sessionName || '·'}</span>
              )
            }
          />
          <Row
            label="Número"
            value={
              <span className="font-mono">
                {session.data?.phone || session.data?.me?.user || sessionPhone || '·'}
              </span>
            }
          />
          <Row
            label="Session ID"
            value={
              <span className="font-mono text-xs text-fg-muted">
                {session.data?.id || sessionId || '·'}
              </span>
            }
          />
          <Row
            label="Estado"
            value={<span className="font-mono">{sessionStatus}</span>}
          />
          <Row
            label="Backend → OpenWA"
            value={<StatusBadge ok={health.data?.services?.openwa?.ok} />}
          />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Button
            variant="outline"
            onClick={() => startSession.mutate(undefined)}
            disabled={startSession.isPending}
          >
            <Power size={12} /> Arrancar sesión
          </Button>
          <Button
            variant="outline"
            onClick={() => stopSession.mutate(undefined)}
            disabled={stopSession.isPending}
          >
            <PowerOff size={12} /> Parar sesión
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (
                confirm(
                  '¿Cerrar sesión de WhatsApp? Tendrás que escanear el QR de nuevo para volver a conectar.',
                )
              ) {
                logoutSession.mutate(undefined);
              }
            }}
            disabled={logoutSession.isPending}
          >
            <LogOut size={12} /> Cerrar sesión (logout)
          </Button>
          <Button
            variant="outline"
            onClick={() => setQrSessionId(sessionId || session.data?.id || null)}
            disabled={!sessionId && !session.data?.id}
          >
            <QrCode size={12} /> Ver QR de la sesión
          </Button>
        </div>
      </Card>

      {/* ─── Credenciales / API ─── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <Key size={13} /> Credenciales OpenWA
          </span>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-2xs uppercase tracking-wider text-fg-subtle mb-1.5 flex items-center gap-1.5">
              <Globe size={11} /> URL del servidor OpenWA
            </label>
            <input
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://192.168.8.200:2785/api"
              className="w-full input-base font-mono"
            />
            <div className="text-[11px] text-fg-subtle mt-1">
              Debe ser accesible desde dentro del contenedor del backend.
              Si OpenWA corre en el mismo host, usa <code className="text-fg-muted">http://host.docker.internal:2785/api</code>.
            </div>
          </div>

          <div>
            <label className="text-2xs uppercase tracking-wider text-fg-subtle mb-1.5 block">
              API Key de OpenWA
            </label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  config.data?.hasApiKey
                    ? `Actual: ${config.data.apiKeyMask} · escribe para cambiarla`
                    : 'owa_k1_xxxxxxxxxxxxxxxxxxxxx'
                }
                className="flex-1 input-base font-mono"
              />
              <Button variant="ghost" onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </Button>
            </div>
            <div className="text-[11px] text-fg-subtle mt-1">
              No se devuelve por la API una vez guardada · solo se muestran los últimos caracteres como verificación.
              Deja vacío para mantener la actual.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-2xs uppercase tracking-wider text-fg-subtle mb-1.5 block">
                Session ID
              </label>
              <input
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="uuid de la sesión"
                className="w-full input-base font-mono text-xs py-1.5"
              />
            </div>
            <div>
              <label className="text-2xs uppercase tracking-wider text-fg-subtle mb-1.5 block">
                Nombre
              </label>
              <input
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                placeholder="chatbot-wa"
                className="w-full input-base font-mono text-xs py-1.5"
              />
            </div>
            <div>
              <label className="text-2xs uppercase tracking-wider text-fg-subtle mb-1.5 block">
                Teléfono
              </label>
              <input
                value={sessionPhone}
                onChange={(e) => setSessionPhone(e.target.value)}
                placeholder="34670209033"
                className="w-full input-base font-mono text-xs py-1.5"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => saveConfig.mutate()}
              disabled={saveConfig.isPending}
            >
              <Save size={12} /> Guardar credenciales
            </Button>
          </div>
        </div>
      </Card>

      {/* ─── QR scanner ─── */}
      {qrSessionId && (
        <Card
          title={
            <span className="flex items-center gap-2">
              <QrCode size={13} /> QR de la sesión
            </span>
          }
          action={
            <Button variant="ghost" onClick={() => setQrSessionId(null)}>
              Cerrar
            </Button>
          }
        >
          <div className="text-xs text-fg-muted mb-3">
            Escanea este código desde WhatsApp → Dispositivos vinculados → Vincular un dispositivo.
            El código se refresca cada 4 segundos.
          </div>
          {qrQuery.isLoading ? (
            <Skeleton className="h-60 w-60" />
          ) : qrImageDataUrl ? (
            <div className="flex justify-center">
              <img
                src={qrImageDataUrl}
                alt="QR WhatsApp"
                className="w-60 h-60 rounded-md border border-border bg-white p-2"
              />
            </div>
          ) : qrQuery.data?.error ? (
            <div className="text-sm text-danger">{qrQuery.data.error}</div>
          ) : (
            <div className="text-sm text-fg-muted">
              No hay QR disponible. La sesión puede estar ya conectada o necesita arrancarse.
            </div>
          )}
        </Card>
      )}

      {/* ─── Sesiones disponibles ─── */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <Smartphone size={13} /> Sesiones en OpenWA
            {sessions.data && (
              <span className="text-2xs uppercase tracking-wider text-fg-subtle">
                · {Array.isArray(sessions.data) ? sessions.data.length : 0}
              </span>
            )}
          </span>
        }
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => sessions.refetch()}>
              <RefreshCw size={12} className={sessions.isFetching ? 'animate-spin' : ''} />
            </Button>
            <Button variant="primary" onClick={() => setShowCreate(!showCreate)}>
              <Plus size={12} /> Nueva sesión
            </Button>
          </div>
        }
      >
        {showCreate && (
          <div className="mb-4 p-3 rounded-md border border-accent/30 bg-accent/5 space-y-3">
            <div className="text-xs text-fg-muted">
              Crea una sesión en OpenWA y la marca como activa automáticamente.
              Después podrás escanear el QR para vincular un nuevo número.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre de la sesión (ej: chatbot-2)"
                className="input-base font-mono py-1.5"
              />
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Teléfono (opcional, 34670209033)"
                className="input-base font-mono py-1.5"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowCreate(false)}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                onClick={() => createSession.mutate()}
                disabled={!newName.trim() || createSession.isPending}
              >
                <Plus size={12} /> Crear y activar
              </Button>
            </div>
          </div>
        )}

        {sessions.isLoading ? (
          <Skeleton className="h-20" />
        ) : !Array.isArray(sessions.data) || sessions.data.length === 0 ? (
          <div className="text-sm text-fg-muted py-6 text-center">
            No hay sesiones en OpenWA. Crea una con el botón de arriba.
          </div>
        ) : (
          <div className="space-y-2">
            {(sessions.data as any[]).map((s: any) => {
              const isActive = (s.id || s.sessionId) === sessionId;
              return (
                <div
                  key={s.id || s.sessionId}
                  className={cn(
                    'p-3 rounded-md border flex items-center justify-between gap-3',
                    isActive
                      ? 'border-accent bg-accent/10'
                      : 'border-border bg-bg-subtle/40',
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm flex items-center gap-2">
                      <span className="font-medium">{s.name || '·'}</span>
                      {isActive && (
                        <span className="text-2xs uppercase tracking-wider text-accent">
                          activa
                        </span>
                      )}
                      <span className="text-2xs text-fg-muted">{s.status || ''}</span>
                    </div>
                    <div className="text-[11px] text-fg-subtle mt-0.5 flex items-center gap-2 flex-wrap">
                      <span className="font-mono">{s.id || s.sessionId}</span>
                      {s.phone && (
                        <>
                          <span>·</span>
                          <span className="font-mono">{s.phone}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Ver QR"
                      onClick={() => setQrSessionId(s.id || s.sessionId)}
                    >
                      <QrCode size={11} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Arrancar"
                      onClick={() => startSession.mutate(s.id || s.sessionId)}
                    >
                      <Power size={11} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      title="Parar"
                      onClick={() => stopSession.mutate(s.id || s.sessionId)}
                    >
                      <PowerOff size={11} />
                    </Button>
                    {!isActive && (
                      <Button
                        size="sm"
                        variant="primary"
                        title="Activar esta sesión"
                        onClick={() => switchSession.mutate(s.id || s.sessionId)}
                      >
                        <ArrowRightLeft size={11} /> Activar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* ─── Webhooks ─── */}
      <Card
        title="Webhooks registrados en OpenWA"
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
        <div className="text-[11px] text-fg-subtle mt-2">
          Si no ves <code className="text-fg-muted">message.received</code> entre los eventos, pulsa el botón "Registrar este backend" para suscribir el webhook automáticamente.
        </div>
      </Card>
    </motion.div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-2xs uppercase tracking-wider text-fg-subtle">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

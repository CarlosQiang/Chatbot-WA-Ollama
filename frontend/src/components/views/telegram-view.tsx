'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/loading';
import { motion } from 'framer-motion';
import { Save, RefreshCw, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function TelegramView() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ['telegramStatus'],
    queryFn: apiClient.telegramStatus,
    refetchInterval: 15_000,
  });

  const [token, setToken] = useState('');
  const [allowedIds, setAllowedIds] = useState('');
  const [bridgeWa, setBridgeWa] = useState(false);
  const [bridgeChatId, setBridgeChatId] = useState('');
  const [showToken, setShowToken] = useState(false);

  useEffect(() => {
    const c = status.data?.config;
    if (c) {
      setAllowedIds((c.allowedUserIds || []).join(','));
      setBridgeWa(!!c.bridgeWa);
      setBridgeChatId(c.bridgeChatId || '');
    }
  }, [status.data]);

  const save = useMutation({
    mutationFn: () =>
      apiClient.saveTelegramConfig({
        ...(token ? { botToken: token } : {}),
        allowedUserIds: allowedIds,
        bridgeWa,
        bridgeChatId,
      }),
    onSuccess: () => {
      toast.success('Configuracion guardada');
      setToken('');
      qc.invalidateQueries({ queryKey: ['telegramStatus'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const restart = useMutation({
    mutationFn: () => apiClient.restartTelegram(),
    onSuccess: () => {
      toast.success('Bot reiniciado');
      qc.invalidateQueries({ queryKey: ['telegramStatus'] });
    },
  });

  const validChat = !bridgeChatId || /^\d{6,18}@c\.us$/.test(bridgeChatId.trim());

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-4"
    >
      <Card
        title="Bot de Telegram"
        action={<StatusBadge ok={!!status.data?.enabled && !!status.data?.bot} />}
      >
        {status.isLoading ? (
          <Skeleton className="h-20" />
        ) : status.data?.bot ? (
          <div className="space-y-2 text-sm">
            <Row label="Bot" value={<span className="font-mono">@{status.data.bot.username}</span>} />
            <Row label="Nombre" value={status.data.bot.name} />
            <Row label="ID" value={<span className="font-mono">{status.data.bot.id}</span>} />
          </div>
        ) : !status.data?.enabled ? (
          <div className="text-sm text-fg-muted">
            Telegram desactivado. Pega tu token mas abajo y guarda para activarlo.
          </div>
        ) : (
          <div className="text-sm text-danger">
            Error: {status.data?.error || 'No se pudo conectar con Telegram.'}
          </div>
        )}
      </Card>

      <Card title="Credenciales del bot">
        <div className="space-y-4">
          {/* Token */}
          <div>
            <label className="text-2xs uppercase tracking-wider text-fg-subtle mb-1.5 block">
              Bot Token (obtener con @BotFather)
            </label>
            <div className="flex gap-2">
              <input
                type={showToken ? 'text' : 'password'}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={status.data?.config?.hasToken ? `Actual: ${status.data.config.tokenMask}` : 'Ej: 1234567890:AAFxxxxxxx'}
                className="flex-1 input-base font-mono"
              />
              <Button
                variant="ghost"
                onClick={() => setShowToken(!showToken)}
                title={showToken ? 'Ocultar' : 'Mostrar'}
              >
                {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
              </Button>
            </div>
            <div className="text-[11px] text-fg-subtle mt-1.5">
              Deja en blanco si ya esta configurado. Al guardar token nuevo se reinicia el bot.
            </div>
          </div>

          {/* User IDs */}
          <div>
            <label className="text-2xs uppercase tracking-wider text-fg-subtle mb-1.5 block">
              Telegram User IDs autorizados (coma-separados)
            </label>
            <input
              value={allowedIds}
              onChange={(e) => setAllowedIds(e.target.value)}
              placeholder="123456789,987654321"
              className="w-full input-base font-mono"
            />
            <div className="text-[11px] text-fg-subtle mt-1.5">
              Solo estos usuarios pueden hablar con el bot. Para saber tu id, manda /quien al bot
              o consulta <code>https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates</code>.
              Si lo dejas vacio, cualquiera con el username del bot podra usarlo.
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => restart.mutate()} disabled={restart.isPending}>
              <RefreshCw size={12} /> Reiniciar bot
            </Button>
            <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending || !validChat}>
              <Save size={12} /> Guardar
            </Button>
          </div>
        </div>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            Bridge Telegram <ArrowRight size={12} /> WhatsApp
          </span>
        }
        action={
          <span
            className={cn(
              'text-2xs uppercase tracking-wider px-2 py-0.5 rounded-full',
              bridgeWa
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-bg-subtle text-fg-subtle border border-border',
            )}
          >
            {bridgeWa ? 'ACTIVO' : 'INACTIVO'}
          </span>
        }
      >
        <div className="space-y-4">
          <div className="text-sm text-fg-muted leading-relaxed">
            Cuando esta <strong className="text-fg">activo</strong>: cualquier texto que escribas
            al bot de Telegram pasa por Ollama, y la respuesta de Ollama se envia automaticamente
            al WhatsApp configurado. <br />
            Util para "dictarle al bot desde Telegram y que conteste por ti en WhatsApp".
          </div>

          <button
            onClick={() => setBridgeWa(!bridgeWa)}
            className={cn(
              'w-full p-4 rounded-lg border-2 transition-all duration-200 flex items-center justify-between',
              bridgeWa
                ? 'border-accent bg-accent/10'
                : 'border-border bg-bg-subtle/40 hover:border-border-strong',
            )}
          >
            <div className="text-left">
              <div className="text-sm font-medium">
                {bridgeWa ? 'Bridge activo' : 'Bridge desactivado'}
              </div>
              <div className="text-[11px] text-fg-muted mt-0.5">
                Click para {bridgeWa ? 'desactivar' : 'activar'}
              </div>
            </div>
            <div
              className={cn(
                'w-12 h-6 rounded-full transition-colors relative',
                bridgeWa ? 'bg-accent' : 'bg-bg-elevated border border-border',
              )}
            >
              <div
                className={cn(
                  'w-5 h-5 rounded-full bg-bg-card absolute top-0.5 transition-transform',
                  bridgeWa ? 'translate-x-6' : 'translate-x-0.5',
                )}
              />
            </div>
          </button>

          <div>
            <label className="text-2xs uppercase tracking-wider text-fg-subtle mb-1.5 block">
              ChatId WhatsApp destino
            </label>
            <input
              value={bridgeChatId}
              onChange={(e) => setBridgeChatId(e.target.value.trim())}
              placeholder="34670209033@c.us"
              className="w-full input-base font-mono"
            />
            {bridgeChatId && !validChat && (
              <div className="text-[11px] text-danger mt-1">
                Formato invalido. Usa: 34XXXXXXXXX@c.us
              </div>
            )}
            <div className="text-[11px] text-fg-subtle mt-1.5">
              Numero al que se enviara la respuesta cuando escribas por Telegram.
            </div>
          </div>

          <div className="flex justify-end">
            <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending || !validChat}>
              <Save size={12} /> Guardar bridge
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Comandos disponibles">
        <ul className="text-xs font-mono space-y-1.5 text-fg-muted">
          <li><span className="text-accent">&lt;texto&gt;</span> sin comando · chat con Ollama (+ bridge si activo)</li>
          <li><span className="text-accent">/ai</span> &lt;texto&gt; · IA explicita</li>
          <li><span className="text-accent">/wa</span> &lt;texto&gt; · enviar texto literal a WhatsApp</li>
          <li><span className="text-accent">/aiwa</span> &lt;texto&gt; · IA + envio manual a WhatsApp</li>
          <li><span className="text-accent">/recordar</span> hoy a las 18:00 ... · lenguaje natural</li>
          <li><span className="text-accent">/modo</span> &lt;manual|private|ai|silent|maintenance&gt;</li>
          <li><span className="text-accent">/silencio</span> / <span className="text-accent">/resumir</span></li>
          <li><span className="text-accent">/whitelist add 34xxx@c.us</span></li>
          <li><span className="text-accent">/estado /modelos /modelo /quien /uptime /ip /ippub /latencia</span></li>
        </ul>
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

'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton, SkeletonGroup } from '@/components/ui/loading';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { cn, timeAgo } from '@/lib/utils';
import { motion } from 'framer-motion';
import { ArrowRight, Cpu, HardDrive, MessageSquare, Zap, ScrollText } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

// Paleta de colores por nivel de log
const logLevelClass: Record<string, string> = {
  error: 'text-danger',
  warn:  'text-warn',
  info:  'text-fg-subtle',
  debug: 'text-fg-subtle/60',
};

// Paleta de color para barra de progreso según uso
function progressColor(pct?: number) {
  if (!pct) return 'bg-accent/50';
  if (pct > 85) return 'bg-danger/70';
  if (pct > 70) return 'bg-warn/70';
  return 'bg-accent/60';
}

export function DashboardView() {
  const setView = useAppStore((s) => s.setView);
  const selectChat = useAppStore((s) => s.selectChat);

  // Intervalos racionalizados — salud del sistema cada 10s, chats cada 10s, logs cada 8s
  const health = useQuery({ queryKey: ['health'],  queryFn: apiClient.health,        refetchInterval: 10_000 });
  const models = useQuery({ queryKey: ['models'],  queryFn: apiClient.listModels,    refetchInterval: 30_000 });
  const chats  = useQuery({ queryKey: ['chats'],   queryFn: apiClient.listChats,     refetchInterval: 10_000 });
  const system = useQuery({ queryKey: ['system'],  queryFn: apiClient.systemOverview, refetchInterval: 10_000 });
  const logs   = useQuery({ queryKey: ['logs', { limit: 8 }], queryFn: () => apiClient.listLogs({ limit: 8 }), refetchInterval: 8_000 });
  const mode   = useQuery({ queryKey: ['botMode'], queryFn: apiClient.getBotMode,    refetchInterval: 30_000 });

  const modeInfo = mode.data as any;
  const botMode: string = modeInfo?.mode ?? '';
  const modeLabel: Record<string, { label: string; color: string }> = {
    ai:          { label: 'IA activa',     color: 'bg-accent/10 text-accent border-accent/20' },
    private:     { label: 'Privado',       color: 'bg-info/10 text-info border-info/20' },
    manual:      { label: 'Manual',        color: 'bg-fg-subtle/10 text-fg-muted border-border' },
    silent:      { label: 'Silencio',      color: 'bg-warn/10 text-warn border-warn/20' },
    maintenance: { label: 'Mantenimiento', color: 'bg-danger/10 text-danger border-danger/20' },
  };
  const modeStyle = modeLabel[botMode] ?? { label: botMode || '·', color: 'bg-bg-subtle text-fg-muted border-border' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-4"
    >
      {/* ── Fila 1: Estado servicios + Recursos ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card
          title={
            <span className="flex items-center gap-2">
              Estado del sistema
              {/* Bot mode badge inline en el título */}
              {botMode && (
                <span className={cn('text-2xs font-medium px-2 py-0.5 rounded-full border', modeStyle.color)}>
                  {modeStyle.label}
                </span>
              )}
            </span>
          }
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-4">
            <ServiceMetric
              label="Backend"
              ok={health.data?.services.backend.ok ?? null}
              sublabel={health.data?.status === 'ok' ? 'operativo' : 'revisando'}
            />
            <ServiceMetric
              label="OpenWA"
              ok={health.data?.services.openwa.ok ?? null}
              sublabel={health.data?.services.openwa.error ? 'error' : undefined}
            />
            <ServiceMetric
              label="Ollama"
              ok={health.data?.services.ollama.ok ?? null}
              sublabel={health.data?.services.ollama.ok
                ? `${health.data.services.ollama.models ?? 0} modelos`
                : undefined}
            />
            <div>
              <div className="label-caps mb-2">Modelo activo</div>
              {models.isLoading ? (
                <Skeleton className="h-4 w-20" />
              ) : (
                <span className="font-mono text-sm text-fg tracking-tight">
                  {models.data?.active ?? '—'}
                </span>
              )}
            </div>
          </div>
        </Card>

        <Card title="Recursos del servidor">
          {system.isLoading ? (
            <SkeletonGroup className="space-y-3">
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
              <Skeleton className="h-8" />
            </SkeletonGroup>
          ) : system.isError ? (
            <ErrorState compact description="Sin acceso al sistema" onRetry={() => system.refetch()} />
          ) : (
            <div className="space-y-3.5">
              <ResourceBar
                icon={<Cpu size={12} className="text-fg-subtle" />}
                label="CPU"
                value={system.data ? `${system.data.cpu.cores}c · ${system.data.cpu.load1?.toFixed(2)}` : '·'}
              />
              <ResourceBar
                icon={<Zap size={12} className="text-fg-subtle" />}
                label="RAM"
                value={system.data
                  ? `${system.data.memory.usedMB} / ${system.data.memory.totalMB} MB`
                  : '·'}
                percent={system.data?.memory.percent}
              />
              <ResourceBar
                icon={<HardDrive size={12} className="text-fg-subtle" />}
                label="Disco"
                value={system.data?.disk?.size
                  ? `${system.data.disk.used} / ${system.data.disk.size}`
                  : '·'}
              />
            </div>
          )}
        </Card>
      </div>

      {/* ── Fila 2: Chats recientes + Logs ───────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card
          className="lg:col-span-2"
          title="Conversaciones recientes"
          action={
            <button
              onClick={() => setView('chats')}
              className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg transition-colors"
            >
              ver todas <ArrowRight size={11} />
            </button>
          }
          noPadding
        >
          {chats.isLoading ? (
            <SkeletonGroup className="p-4 space-y-2">
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
              <Skeleton className="h-11" />
            </SkeletonGroup>
          ) : chats.isError ? (
            <div className="p-4"><ErrorState compact onRetry={() => chats.refetch()} /></div>
          ) : !chats.data?.length ? (
            <EmptyState
              compact
              icon={<MessageSquare size={18} strokeWidth={1.5} />}
              title="Sin conversaciones aún"
              description="Envía un mensaje al número de tu bot para empezar."
            />
          ) : (
            <div className="divide-y divide-border">
              {chats.data.slice(0, 6).map((c) => (
                <button
                  key={c.id}
                  onClick={() => { selectChat(c.chatId); setView('chats'); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-bg-subtle/60 transition-colors group"
                >
                  {/* Avatar inicial */}
                  <div className="h-8 w-8 rounded-full bg-bg-subtle border border-border flex items-center justify-center shrink-0 text-xs font-medium text-fg-muted group-hover:border-border-strong transition-colors">
                    {(c.displayName || c.phone || c.chatId).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-fg truncate">
                      {c.displayName || c.phone || c.chatId}
                    </div>
                    <div className="text-2xs text-fg-subtle font-mono truncate">
                      {c.chatId}
                    </div>
                  </div>
                  <div className="text-right shrink-0 tabular-nums">
                    <div className="text-xs text-fg-muted">{timeAgo(c.lastMessageAt)}</div>
                    <div className="text-2xs text-fg-subtle">{c.messageCount} msg</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              Logs recientes
              {logs.data?.some((l) => l.level === 'error') && (
                <span className="h-1.5 w-1.5 rounded-full bg-danger" aria-label="Errores recientes" />
              )}
            </span>
          }
          action={
            <button
              onClick={() => setView('logs')}
              className="inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg transition-colors"
            >
              ver todos <ArrowRight size={11} />
            </button>
          }
          noPadding
        >
          {logs.isLoading ? (
            <SkeletonGroup className="p-4 space-y-2">
              <Skeleton className="h-4" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/5" />
            </SkeletonGroup>
          ) : logs.isError ? (
            <div className="p-4"><ErrorState compact onRetry={() => logs.refetch()} /></div>
          ) : !logs.data?.length ? (
            <EmptyState compact icon={<ScrollText size={16} strokeWidth={1.5} />} title="Sin logs" />
          ) : (
            <ul className="divide-y divide-border/50">
              {logs.data.map((l) => (
                <li key={l.id} className="flex items-start gap-2.5 px-4 py-2 text-xs font-mono">
                  <span
                    className={cn(
                      'shrink-0 font-medium text-2xs uppercase tracking-wide mt-0.5',
                      logLevelClass[l.level] ?? 'text-fg-subtle',
                    )}
                  >
                    {l.source}
                  </span>
                  <span className="text-fg-muted truncate leading-relaxed">{l.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </motion.div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────────────────

function ServiceMetric({ label, ok, sublabel }: { label: string; ok: boolean | null; sublabel?: string }) {
  return (
    <div>
      <div className="label-caps mb-2">{label}</div>
      <StatusBadge ok={ok} label={sublabel} />
    </div>
  );
}

function ResourceBar({
  icon, label, value, percent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  percent?: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-fg-muted">
          {icon}
          <span>{label}</span>
        </div>
        <span className="font-mono text-2xs text-fg tabular-nums">{value}</span>
      </div>
      {typeof percent === 'number' && (
        <div className="h-1 w-full rounded-full bg-bg-subtle overflow-hidden">
          <motion.div
            className={cn('h-full rounded-full transition-all', progressColor(percent))}
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, percent)}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
      )}
    </div>
  );
}

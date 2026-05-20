'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/loading';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { timeAgo } from '@/lib/utils';
import { motion } from 'framer-motion';
import { ArrowRight, Cpu, HardDrive, MessageSquare, Zap, ScrollText } from 'lucide-react';
import { useAppStore } from '@/store/app-store';

export function DashboardView() {
  const setView = useAppStore((s) => s.setView);
  const selectChat = useAppStore((s) => s.selectChat);

  const health = useQuery({
    queryKey: ['health'],
    queryFn: apiClient.health,
    refetchInterval: 8000,
  });
  const models = useQuery({
    queryKey: ['models'],
    queryFn: apiClient.listModels,
    refetchInterval: 30_000,
  });
  const chats = useQuery({
    queryKey: ['chats'],
    queryFn: apiClient.listChats,
    refetchInterval: 6_000,
  });
  const system = useQuery({
    queryKey: ['system'],
    queryFn: apiClient.systemOverview,
    refetchInterval: 6_000,
  });
  const logs = useQuery({
    queryKey: ['logs', { limit: 8 }],
    queryFn: () => apiClient.listLogs({ limit: 8 }),
    refetchInterval: 5_000,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-4"
    >
      {/* status grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Sistema" className="lg:col-span-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Metric
              label="Backend"
              value={<StatusBadge ok={health.data?.services.backend.ok ?? null} label={health.data?.status === 'ok' ? 'OK' : 'check'} />}
            />
            <Metric
              label="OpenWA"
              value={<StatusBadge ok={health.data?.services.openwa.ok ?? null} />}
            />
            <Metric
              label="Ollama"
              value={
                <span className="flex items-center gap-2">
                  <StatusBadge ok={health.data?.services.ollama.ok ?? null} />
                  {health.data?.services.ollama.ok ? (
                    <span className="text-fg-muted text-xs">
                      · {health.data.services.ollama.models ?? '—'} mod.
                    </span>
                  ) : null}
                </span>
              }
            />
            <Metric
              label="Modelo activo"
              value={
                <span className="font-mono text-fg text-sm">
                  {models.data?.active ?? <Skeleton className="h-4 w-16" />}
                </span>
              }
            />
          </div>
        </Card>

        <Card title="Recursos">
          {system.isError ? (
            <ErrorState description="No se puede leer info del sistema" onRetry={() => system.refetch()} />
          ) : (
            <div className="space-y-3">
              <ResourceRow
                icon={<Cpu size={13} />}
                label="CPU"
                value={
                  system.data
                    ? `${system.data.cpu.cores} cores · load ${system.data.cpu.load1?.toFixed(2)}`
                    : '—'
                }
              />
              <ResourceRow
                icon={<Zap size={13} />}
                label="Memoria"
                value={
                  system.data
                    ? `${system.data.memory.usedMB} / ${system.data.memory.totalMB} MB (${system.data.memory.percent}%)`
                    : '—'
                }
                progress={system.data?.memory.percent}
              />
              <ResourceRow
                icon={<HardDrive size={13} />}
                label="Disco"
                value={
                  system.data?.disk?.size
                    ? `${system.data.disk.used} / ${system.data.disk.size} (${system.data.disk.percent})`
                    : '—'
                }
              />
            </div>
          )}
        </Card>
      </div>

      {/* chats + logs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card
          title="Conversaciones recientes"
          className="lg:col-span-2"
          action={
            <button
              onClick={() => setView('chats')}
              className="text-xs text-fg-muted hover:text-fg flex items-center gap-1 transition-colors"
            >
              ver todas <ArrowRight size={11} />
            </button>
          }
        >
          {chats.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : chats.isError ? (
            <ErrorState onRetry={() => chats.refetch()} />
          ) : chats.data?.length === 0 ? (
            <EmptyState
              icon={<MessageSquare size={22} strokeWidth={1.5} />}
              title="Sin conversaciones aún"
              description="Envía un mensaje al número de tu bot de WhatsApp para empezar."
            />
          ) : (
            <div className="divide-y divide-border">
              {chats.data!.slice(0, 6).map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    selectChat(c.chatId);
                    setView('chats');
                  }}
                  className="w-full flex items-center justify-between py-2.5 text-left hover:bg-bg-subtle/50 px-2 -mx-2 rounded-md transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">
                      {c.displayName || c.phone || c.chatId}
                    </div>
                    <div className="text-xs text-fg-muted font-mono truncate">
                      {c.chatId}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <div className="text-xs text-fg-muted">{timeAgo(c.lastMessageAt)}</div>
                    <div className="text-[10px] text-fg-subtle">{c.messageCount} msg</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Logs"
          action={
            <button
              onClick={() => setView('logs')}
              className="text-xs text-fg-muted hover:text-fg flex items-center gap-1 transition-colors"
            >
              ver todos <ArrowRight size={11} />
            </button>
          }
        >
          {logs.isLoading ? (
            <Skeleton className="h-32" />
          ) : logs.isError ? (
            <ErrorState onRetry={() => logs.refetch()} />
          ) : logs.data?.length === 0 ? (
            <EmptyState icon={<ScrollText size={22} strokeWidth={1.5} />} title="Sin logs" />
          ) : (
            <ul className="space-y-1.5 text-xs font-mono">
              {logs.data!.map((l) => (
                <li key={l.id} className="flex gap-2">
                  <span
                    className={
                      l.level === 'error'
                        ? 'text-danger'
                        : l.level === 'warn'
                          ? 'text-warn'
                          : 'text-fg-subtle'
                    }
                  >
                    [{l.source}]
                  </span>
                  <span className="text-fg-muted truncate">{l.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </motion.div>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5">
        {label}
      </div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

function ResourceRow({
  icon,
  label,
  value,
  progress,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  progress?: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-fg-muted">
          {icon}
          {label}
        </div>
        <div className="text-fg font-mono text-[11px]">{value}</div>
      </div>
      {typeof progress === 'number' && (
        <div className="mt-1.5 h-1 w-full rounded-full bg-bg-subtle overflow-hidden">
          <div
            className="h-full bg-accent/70 transition-all duration-500"
            style={{ width: `${Math.min(100, progress)}%` }}
          />
        </div>
      )}
    </div>
  );
}

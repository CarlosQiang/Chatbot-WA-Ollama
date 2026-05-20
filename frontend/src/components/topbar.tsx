'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { StatusBadge } from './ui/status-badge';
import { useAppStore } from '@/store/app-store';
import { Menu } from 'lucide-react';

const titles: Record<string, string> = {
  dashboard: 'Dashboard',
  chats: 'Conversaciones',
  commands: 'Comandos',
  telegram: 'Telegram',
  reminders: 'Recordatorios',
  autoreply: 'Auto-respuesta IA',
  models: 'Modelos',
  connections: 'Conexiones',
  logs: 'Logs',
  settings: 'Ajustes',
};

export function Topbar() {
  const view = useAppStore((s) => s.view);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: apiClient.health,
    refetchInterval: 8000,
  });

  return (
    <header className="border-b border-border bg-bg-elevated/40 px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={toggleSidebar}
          className="md:hidden p-1.5 text-fg-muted hover:text-fg rounded-md hover:bg-bg-subtle transition-colors"
          aria-label="Menú"
        >
          <Menu size={18} />
        </button>
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-fg-subtle">
            panel
          </div>
          <h1 className="text-base font-semibold tracking-tight truncate">
            {titles[view] || view}
          </h1>
        </div>
      </div>
      <div className="hidden sm:flex items-center gap-3 lg:gap-4 text-xs shrink-0">
        <StatusBadge ok={data?.services.openwa.ok} label="OpenWA" />
        <StatusBadge ok={data?.services.ollama.ok} label="Ollama" />
        <StatusBadge ok={data?.services.database.ok} label="DB" />
        <StatusBadge ok={data?.services.redis.ok} label="Redis" />
      </div>
      {/* Mobile: solo dot agregado */}
      <div className="sm:hidden flex items-center gap-2">
        <StatusBadge ok={data?.status === 'ok'} label="" />
      </div>
    </header>
  );
}

'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { StatusBadge } from './ui/status-badge';
import { useAppStore } from '@/store/app-store';
import { Menu } from 'lucide-react';
import { cn } from '@/lib/utils';

const viewMeta: Record<string, { title: string; description: string }> = {
  dashboard:   { title: 'Dashboard',           description: 'Estado general del sistema' },
  chats:       { title: 'Conversaciones',       description: 'Mensajes WhatsApp' },
  commands:    { title: 'Comandos',             description: 'Comandos disponibles del bot' },
  whatsapp:    { title: 'WhatsApp',             description: 'Sesión y configuración de OpenWA' },
  telegram:    { title: 'Telegram',             description: 'Bot y configuración de Telegram' },
  reminders:   { title: 'Recordatorios',        description: 'Gestión de recordatorios automáticos' },
  notes:       { title: 'Notas',                description: 'Notas y organización con IA' },
  autoreply:   { title: 'Auto-IA',              description: 'Respuestas automáticas con inteligencia artificial' },
  models:      { title: 'Modelos',              description: 'Servidores y modelos de Ollama' },
  connections: { title: 'Conexiones',           description: 'Test de conexión y diagnósticos' },
  logs:        { title: 'Logs',                 description: 'Registro de eventos del sistema' },
  settings:    { title: 'Ajustes',              description: 'Configuración general' },
};

export function Topbar() {
  const view = useAppStore((s) => s.view);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  // Reutiliza la misma query del Sidebar (React Query dedup — sin request extra)
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: apiClient.health,
    refetchInterval: 8000,
  });

  const meta = viewMeta[view] ?? { title: view, description: '' };
  const systemOk = data?.status === 'ok';

  return (
    <header className="border-b border-border bg-bg-elevated/50 px-4 sm:px-5 py-2.5 flex items-center justify-between gap-4 shrink-0">

      {/* Izquierda: hamburger (móvil) + título de vista */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={toggleSidebar}
          className="md:hidden p-1.5 -ml-0.5 text-fg-muted hover:text-fg rounded-md hover:bg-bg-subtle transition-colors"
          aria-label="Abrir menú"
        >
          <Menu size={17} />
        </button>
        <div className="min-w-0">
          <h1 className="text-sm font-semibold tracking-tight text-fg truncate leading-tight">
            {meta.title}
          </h1>
          <p className="text-2xs text-fg-subtle truncate leading-tight hidden sm:block mt-0.5">
            {meta.description}
          </p>
        </div>
      </div>

      {/* Derecha: badges de servicios */}
      <div className="flex items-center gap-0.5 shrink-0">
        {/* Desktop: badges individuales */}
        <div className="hidden lg:flex items-center gap-1">
          {[
            { label: 'OpenWA', ok: data?.services.openwa.ok },
            { label: 'Ollama', ok: data?.services.ollama.ok },
            { label: 'DB',     ok: data?.services.database.ok },
            { label: 'Redis',  ok: data?.services.redis.ok },
          ].map(({ label, ok }) => (
            <span
              key={label}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors duration-300',
                ok === true
                  ? 'bg-accent/5 border-accent/15 text-fg-muted'
                  : ok === false
                  ? 'bg-danger/8 border-danger/20 text-danger/80'
                  : 'bg-bg-subtle border-border text-fg-subtle',
              )}
            >
              <span className={cn('status-dot shrink-0', ok === true ? 'ok' : ok === false ? 'err' : 'idle')} />
              {label}
            </span>
          ))}
        </div>

        {/* Tablet: badges compactos */}
        <div className="hidden sm:flex lg:hidden items-center gap-2 px-1">
          <StatusBadge ok={data?.services.openwa.ok}  label="OpenWA" />
          <StatusBadge ok={data?.services.ollama.ok}  label="Ollama" />
          <StatusBadge ok={data?.services.database.ok} label="DB" />
        </div>

        {/* Mobile: dot único */}
        <div className="sm:hidden">
          <StatusBadge ok={systemOk} dotOnly />
        </div>
      </div>
    </header>
  );
}

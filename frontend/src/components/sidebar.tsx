'use client';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import {
  LayoutDashboard,
  MessageSquare,
  MessageCircle,
  Cpu,
  ScrollText,
  Settings,
  Plug,
  Terminal,
  Send,
  Bell,
  Sparkles,
  StickyNote,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

// ─── Grupos de navegación ──────────────────────────────────────────────────
const groups = [
  {
    label: null, // sin encabezado — vista principal
    items: [
      { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Conversaciones',
    items: [
      { key: 'chats',    label: 'Chats',    icon: MessageSquare },
      { key: 'commands', label: 'Comandos', icon: Terminal },
    ],
  },
  {
    label: 'Canales',
    items: [
      { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
      { key: 'telegram', label: 'Telegram', icon: Send },
    ],
  },
  {
    label: 'Automatización',
    items: [
      { key: 'reminders', label: 'Recordatorios', icon: Bell },
      { key: 'notes',     label: 'Notas',         icon: StickyNote },
      { key: 'autoreply', label: 'Auto-IA',        icon: Sparkles },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { key: 'models',      label: 'Modelos',    icon: Cpu },
      { key: 'connections', label: 'Conexiones', icon: Plug },
      { key: 'logs',        label: 'Logs',       icon: ScrollText },
      { key: 'settings',    label: 'Ajustes',    icon: Settings },
    ],
  },
] as const;

type ViewKey = typeof groups[number]['items'][number]['key'];

function NavItem({
  itemKey,
  label,
  icon: Icon,
  active,
  errorBadge,
  onNavigate,
}: {
  itemKey: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  errorBadge?: boolean;
  onNavigate: () => void;
}) {
  return (
    <button
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-180',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-bg-elevated',
        active
          ? 'bg-bg-subtle text-fg font-medium'
          : 'text-fg-muted hover:text-fg hover:bg-bg-subtle/60',
      )}
    >
      <Icon
        size={15}
        strokeWidth={active ? 2 : 1.75}
        className={active ? 'text-fg' : 'text-fg-subtle group-hover:text-fg-muted'}
        aria-hidden="true"
      />
      <span className="flex-1 text-left">{label}</span>
      {errorBadge && (
        <span
          className="h-1.5 w-1.5 rounded-full bg-danger shrink-0"
          aria-label="Errores recientes"
        />
      )}
      {active && !errorBadge && (
        <span className="h-1 w-1 rounded-full bg-accent shrink-0" aria-hidden="true" />
      )}
    </button>
  );
}

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { view, setView } = useAppStore();

  // Detectar si hay errores recientes para badge en Logs
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: apiClient.health,
    refetchInterval: 10_000,
  });
  const hasErrors = health?.status !== 'ok';

  return (
    <div className="flex flex-col h-full">
      {/* Logo / wordmark */}
      <div className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-lg bg-accent/15 border border-accent/20 grid place-items-center text-accent text-xs font-mono font-semibold shrink-0">
            ai
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight text-fg leading-tight">
              Local AI Hub
            </div>
            <div className="text-2xs text-fg-subtle leading-tight mt-0.5 truncate">
              WhatsApp · Telegram · Ollama
            </div>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="md:hidden p-1.5 text-fg-muted hover:text-fg rounded-md hover:bg-bg-subtle transition-colors"
            aria-label="Cerrar menú"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Nav groups */}
      <nav className="flex-1 px-2 py-1 overflow-y-auto space-y-0.5" aria-label="Navegación principal">
        {groups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'pt-1' : ''}>
            {group.label && (
              <div className="px-3 py-1.5 text-2xs label-caps text-fg-subtle/70 select-none">
                {group.label}
              </div>
            )}
            {group.items.map((it) => (
              <NavItem
                key={it.key}
                itemKey={it.key}
                label={it.label}
                icon={it.icon}
                active={view === it.key}
                errorBadge={it.key === 'logs' && hasErrors}
                onNavigate={() => setView(it.key as ViewKey)}
              />
            ))}
            {gi < groups.length - 1 && (
              <div className="mx-3 mt-2 mb-1 h-px bg-border/60" aria-hidden="true" />
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex items-center justify-between">
        <span className="text-2xs text-fg-subtle font-mono">v0.2.0 · local</span>
        <div className="flex items-center gap-1.5">
          {/* Estado global compacto */}
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              health?.status === 'ok' ? 'bg-accent' : 'bg-warn',
            )}
            title={health?.status === 'ok' ? 'Todos los servicios OK' : 'Algún servicio con problemas'}
            aria-hidden="true"
          />
          <span className="text-2xs text-fg-subtle">
            {health?.status === 'ok' ? 'operativo' : 'alerta'}
          </span>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useAppStore();
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-56 lg:w-[220px] flex-col border-r border-border bg-bg-elevated/60 shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-[2px] z-40 md:hidden"
              onClick={() => setSidebarOpen(false)}
              aria-hidden="true"
            />
            <motion.aside
              key="drawer"
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="fixed top-0 bottom-0 left-0 w-[220px] z-50 bg-bg-elevated border-r border-border shadow-elevated md:hidden"
              aria-label="Menú de navegación"
            >
              <SidebarContent onClose={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

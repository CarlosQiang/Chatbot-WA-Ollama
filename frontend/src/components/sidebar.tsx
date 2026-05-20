'use client';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/app-store';
import {
  LayoutDashboard,
  MessageSquare,
  Cpu,
  ScrollText,
  Settings,
  Plug,
  Terminal,
  Send,
  Bell,
  Sparkles,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const items = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'chats', label: 'Chats', icon: MessageSquare },
  { key: 'commands', label: 'Comandos', icon: Terminal },
  { key: 'telegram', label: 'Telegram', icon: Send },
  { key: 'reminders', label: 'Recordatorios', icon: Bell },
  { key: 'autoreply', label: 'Auto-IA', icon: Sparkles },
  { key: 'models', label: 'Modelos', icon: Cpu },
  { key: 'connections', label: 'Conexiones', icon: Plug },
  { key: 'logs', label: 'Logs', icon: ScrollText },
  { key: 'settings', label: 'Ajustes', icon: Settings },
] as const;

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { view, setView } = useAppStore();
  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-md bg-accent/20 grid place-items-center text-accent text-xs font-mono">
            ai
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Local AI Hub</div>
            <div className="text-[10px] uppercase tracking-wider text-fg-subtle">
              WhatsApp · Telegram · Ollama
            </div>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="md:hidden p-1 text-fg-muted hover:text-fg" aria-label="Cerrar">
            <X size={16} />
          </button>
        )}
      </div>
      <nav className="flex-1 px-2.5 py-2 overflow-y-auto">
        {items.map((it) => {
          const Icon = it.icon;
          const active = view === it.key;
          return (
            <button
              key={it.key}
              onClick={() => setView(it.key as any)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-all duration-150',
                active ? 'bg-bg-subtle text-fg' : 'text-fg-muted hover:text-fg hover:bg-bg-subtle/50',
              )}
            >
              <Icon size={15} strokeWidth={1.75} />
              {it.label}
              {active && <span className="ml-auto h-1 w-1 rounded-full bg-accent" />}
            </button>
          );
        })}
      </nav>
      <div className="px-5 py-4 border-t border-border text-[10px] text-fg-subtle font-mono">
        v0.2.0 · local
      </div>
    </div>
  );
}

export function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useAppStore();
  return (
    <>
      <aside className="hidden md:flex md:w-56 lg:w-60 flex-col border-r border-border bg-bg-elevated/50">
        <SidebarContent />
      </aside>
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              key="drawer"
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="fixed top-0 bottom-0 left-0 w-60 z-50 bg-bg-elevated border-r border-border md:hidden"
            >
              <SidebarContent onClose={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

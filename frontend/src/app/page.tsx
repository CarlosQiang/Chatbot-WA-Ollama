'use client';
import { Sidebar } from '@/components/sidebar';
import { Topbar } from '@/components/topbar';
import { useAppStore } from '@/store/app-store';
import { DashboardView } from '@/components/views/dashboard-view';
import { ChatsView } from '@/components/views/chats-view';
import { ModelsView } from '@/components/views/models-view';
import { ConnectionsView } from '@/components/views/connections-view';
import { CommandsView } from '@/components/views/commands-view';
import { TelegramView } from '@/components/views/telegram-view';
import { RemindersView } from '@/components/views/reminders-view';
import { AutoReplyView } from '@/components/views/autoreply-view';
import { LogsView } from '@/components/views/logs-view';
import { SettingsView } from '@/components/views/settings-view';
import { AnimatePresence, motion } from 'framer-motion';

export default function HomePage() {
  const view = useAppStore((s) => s.view);

  return (
    <div className="grid-bg min-h-screen flex">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
            >
              {view === 'dashboard' && <DashboardView />}
              {view === 'chats' && <ChatsView />}
              {view === 'models' && <ModelsView />}
              {view === 'connections' && <ConnectionsView />}
              {view === 'commands' && <CommandsView />}
              {view === 'telegram' && <TelegramView />}
              {view === 'reminders' && <RemindersView />}
              {view === 'autoreply' && <AutoReplyView />}
              {view === 'logs' && <LogsView />}
              {view === 'settings' && <SettingsView />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

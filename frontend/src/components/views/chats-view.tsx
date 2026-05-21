'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, Message } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/states';
import { useAppStore } from '@/store/app-store';
import { cn, timeAgo } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { RotateCcw, Send, MessageSquare, ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { getSocket } from '@/lib/socket';

export function ChatsView() {
  const qc = useQueryClient();
  const { selectedChatId, selectChat } = useAppStore();

  const { data: chats, isLoading: chatsLoading } = useQuery({
    queryKey: ['chats'],
    queryFn: apiClient.listChats,
    refetchInterval: 4_000,
  });

  const { data: messages } = useQuery({
    queryKey: ['messages', selectedChatId],
    queryFn: () =>
      selectedChatId ? apiClient.listMessages(selectedChatId) : Promise.resolve([]),
    enabled: !!selectedChatId,
    refetchInterval: 3_000,
  });

  // Realtime: cuando el backend emite `message:new`, invalidamos el listado
  // y los mensajes del chat afectado. El polling sigue activo como fallback
  // si el socket está caído.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = (msg: { chatId?: string }) => {
      qc.invalidateQueries({ queryKey: ['chats'] });
      if (msg?.chatId) {
        qc.invalidateQueries({ queryKey: ['messages', msg.chatId] });
      }
    };
    socket.on('message:new', handler);
    return () => {
      socket.off('message:new', handler);
    };
  }, [qc]);

  const reset = useMutation({
    mutationFn: () => apiClient.resetChat(selectedChatId!),
    onSuccess: () => {
      toast.success('Contexto borrado');
      qc.invalidateQueries({ queryKey: ['messages', selectedChatId] });
      qc.invalidateQueries({ queryKey: ['chats'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const send = useMutation({
    mutationFn: ({ chatId, text }: { chatId: string; text: string }) =>
      apiClient.sendMessage(chatId, text),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['messages', selectedChatId] });
      qc.invalidateQueries({ queryKey: ['chats'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Mobile: si hay chat seleccionado, mostrar solo el panel
  const showListOnMobile = !selectedChatId;

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-9rem)]">
      {/* Lista */}
      <Card
        title="Conversaciones"
        className={cn(
          'overflow-hidden flex flex-col',
          showListOnMobile ? 'block' : 'hidden md:flex',
        )}
      >
        <div className="-m-4 flex-1 overflow-y-auto">
          {chatsLoading ? (
            <div className="p-4 space-y-2">
              <Skeleton className="h-12" />
              <Skeleton className="h-12" />
            </div>
          ) : !chats?.length ? (
            <EmptyState
              icon={<MessageSquare size={20} strokeWidth={1.5} />}
              title="Sin conversaciones"
              description="Espera el primer mensaje en WhatsApp."
            />
          ) : (
            <div className="divide-y divide-border">
              {chats.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectChat(c.chatId)}
                  className={cn(
                    'w-full text-left px-4 py-3 transition-colors hover:bg-bg-subtle/50',
                    selectedChatId === c.chatId && 'bg-bg-subtle',
                  )}
                >
                  <div className="text-sm font-medium truncate">
                    {c.displayName || c.phone}
                  </div>
                  <div className="text-[10px] font-mono text-fg-subtle truncate">
                    {c.chatId}
                  </div>
                  <div className="text-[10px] text-fg-muted mt-1 flex justify-between">
                    <span>{c.messageCount} msg</span>
                    <span>{timeAgo(c.lastMessageAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Panel chat */}
      <Card
        title={
          <div className="flex items-center gap-2">
            {selectedChatId && (
              <button
                onClick={() => selectChat(null)}
                className="md:hidden p-1 -m-1 text-fg-muted hover:text-fg"
                aria-label="Volver"
              >
                <ChevronLeft size={16} />
              </button>
            )}
            <span className="truncate">{selectedChatId || 'Selecciona una conversación'}</span>
          </div>
        }
        action={
          selectedChatId && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => reset.mutate()}
              disabled={reset.isPending}
            >
              <RotateCcw size={12} /> reset
            </Button>
          )
        }
        className={cn(
          'flex flex-col overflow-hidden',
          showListOnMobile ? 'hidden md:flex' : 'block md:flex',
        )}
      >
        {selectedChatId ? (
          <ChatPanel
            chatId={selectedChatId}
            messages={messages || []}
            onSend={(text) => send.mutate({ chatId: selectedChatId, text })}
            sending={send.isPending}
          />
        ) : (
          <div className="h-full grid place-items-center text-fg-muted text-sm">
            Selecciona una conversación
          </div>
        )}
      </Card>
    </div>
  );
}

function ChatPanel({
  messages,
  onSend,
  sending,
}: {
  chatId: string;
  messages: Message[];
  onSend: (text: string) => void;
  sending: boolean;
}) {
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="flex flex-col h-full -m-4">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.length === 0 ? (
          <EmptyState
            icon={<MessageSquare size={20} strokeWidth={1.5} />}
            title="Sin mensajes todavía"
            description="Escribe para empezar la conversación."
          />
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={cn(
                  'max-w-[85%] sm:max-w-[80%] rounded-lg px-3 py-2 text-sm',
                  m.role === 'user'
                    ? 'ml-auto bg-fg text-bg'
                    : m.status === 'error'
                      ? 'bg-danger/10 text-danger border border-danger/30'
                      : 'bg-bg-subtle text-fg',
                )}
              >
                <div className="whitespace-pre-wrap break-words">
                  {m.body || (m.error && `error: ${m.error}`)}
                </div>
                <div
                  className={cn(
                    'mt-1 text-[10px]',
                    m.role === 'user' ? 'text-bg/60' : 'text-fg-subtle',
                  )}
                >
                  {m.model ? `${m.model} · ` : ''}
                  {new Date(m.createdAt).toLocaleTimeString()}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={endRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim()) return;
          onSend(text);
          setText('');
        }}
        className="border-t border-border p-3 flex gap-2"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mensaje (se envía por WhatsApp)…"
          className="flex-1 min-w-0 bg-bg-subtle/60 border border-border rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-border-strong"
        />
        <Button type="submit" variant="primary" size="md" disabled={sending}>
          <Send size={13} />
          <span className="hidden sm:inline">Enviar</span>
        </Button>
      </form>
    </div>
  );
}

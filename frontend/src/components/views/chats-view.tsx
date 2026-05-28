'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, Message } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton, SkeletonGroup, ThinkingDots } from '@/components/ui/loading';
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
    refetchInterval: 10_000,   // reducido: socket invalida en tiempo real
  });

  const { data: messages } = useQuery({
    queryKey: ['messages', selectedChatId],
    queryFn: () =>
      selectedChatId ? apiClient.listMessages(selectedChatId) : Promise.resolve([]),
    enabled: !!selectedChatId,
    refetchInterval: 8_000,    // reducido: socket invalida en tiempo real
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
            <SkeletonGroup className="p-3 space-y-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </SkeletonGroup>
          ) : !chats?.length ? (
            <EmptyState
              compact
              icon={<MessageSquare size={18} strokeWidth={1.5} />}
              title="Sin conversaciones"
              description="Espera el primer mensaje en WhatsApp."
            />
          ) : (
            <div className="divide-y divide-border">
              {chats.map((c) => {
                const name = c.displayName || c.phone || c.chatId;
                const isActive = selectedChatId === c.chatId;
                return (
                  <button
                    key={c.id}
                    onClick={() => selectChat(c.chatId)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors',
                      isActive
                        ? 'bg-bg-subtle'
                        : 'hover:bg-bg-subtle/50',
                    )}
                  >
                    {/* Avatar */}
                    <div className={cn(
                      'h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold border transition-colors',
                      isActive
                        ? 'bg-accent/15 border-accent/30 text-accent'
                        : 'bg-bg-subtle border-border text-fg-muted',
                    )}>
                      {name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-fg truncate">{name}</div>
                      <div className="text-2xs font-mono text-fg-subtle truncate mt-0.5">{c.chatId}</div>
                    </div>
                    <div className="text-right shrink-0 tabular-nums">
                      <div className="text-xs text-fg-muted">{timeAgo(c.lastMessageAt)}</div>
                      <div className="text-2xs text-fg-subtle">{c.messageCount} msg</div>
                    </div>
                  </button>
                );
              })}
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
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll al último mensaje cuando llegan nuevos
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || sending) return;
    onSend(text.trim());
    setText('');
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-full -m-4">
      {/* Área de mensajes */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2" role="log" aria-label="Mensajes">
        {messages.length === 0 && !sending ? (
          <EmptyState
            compact
            icon={<MessageSquare size={18} strokeWidth={1.5} />}
            title="Sin mensajes todavía"
            description="Escribe para empezar la conversación."
          />
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className={cn(
                  'max-w-[85%] sm:max-w-[78%] rounded-xl px-3.5 py-2.5 text-sm shadow-card',
                  m.role === 'user'
                    ? 'ml-auto bg-fg text-bg rounded-br-sm'
                    : m.status === 'error'
                      ? 'bg-danger/10 text-danger border border-danger/30 rounded-bl-sm'
                      : 'bg-bg-subtle text-fg rounded-bl-sm',
                )}
              >
                <div className="whitespace-pre-wrap break-words leading-relaxed">
                  {m.body || (m.error && `⚠ ${m.error}`)}
                </div>
                <div className={cn(
                  'mt-1 text-2xs flex items-center gap-1',
                  m.role === 'user' ? 'text-bg/50 justify-end' : 'text-fg-subtle',
                )}>
                  {m.model && <span className="font-mono">{m.model} ·</span>}
                  <span>{new Date(m.createdAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {/* Indicador "IA pensando" — aparece mientras se espera respuesta */}
        <AnimatePresence>
          {sending && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.18 }}
              className="max-w-[120px] rounded-xl rounded-bl-sm bg-bg-subtle border border-border px-3.5 py-2.5"
              aria-label="La IA está procesando"
            >
              <ThinkingDots />
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={endRef} />
      </div>

      {/* Input de envío */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-border p-3 flex gap-2 items-center"
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) handleSubmit(e as any);
          }}
          placeholder="Mensaje · se envía por WhatsApp…"
          disabled={sending}
          className="input-base flex-1 min-w-0 disabled:opacity-50"
          aria-label="Escribe un mensaje"
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          loading={sending}
          disabled={!text.trim()}
          aria-label="Enviar mensaje"
        >
          <Send size={13} />
          <span className="hidden sm:inline">Enviar</span>
        </Button>
      </form>
    </div>
  );
}

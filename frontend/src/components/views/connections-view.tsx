'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/loading';
import { motion } from 'framer-motion';
import { Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export function ConnectionsView() {
  const [chatId, setChatId] = useState('');

  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: apiClient.settings,
  });
  const health = useQuery({
    queryKey: ['health'],
    queryFn: apiClient.health,
    refetchInterval: 10_000,
  });
  const session = useQuery({
    queryKey: ['session'],
    queryFn: apiClient.openwaSession,
  });
  const ollama = useQuery({
    queryKey: ['ollamaSettings'],
    queryFn: apiClient.getOllamaSettings,
    refetchInterval: 20_000,
  });

  useEffect(() => {
    if (settings.data?.testWhatsappChatId && !chatId) {
      setChatId(settings.data.testWhatsappChatId);
    }
  }, [settings.data, chatId]);

  const testWa = useMutation({
    mutationFn: () => apiClient.testWhatsapp(chatId || undefined),
    onMutate: () => toast.loading('Enviando mensaje de prueba…', { id: 'wa' }),
    onSuccess: (r) => {
      if (r.ok) toast.success('Mensaje de test enviado por WhatsApp.', { id: 'wa' });
      else
        toast.error(
          r.error || 'No se pudo enviar el mensaje. Revisa OpenWA, la sesión o el chatId.',
          { id: 'wa' },
        );
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || e.message, { id: 'wa' }),
  });

  const testOllamaWa = useMutation({
    mutationFn: () => apiClient.testOllamaWhatsapp(chatId || undefined),
    onMutate: () =>
      toast.loading(
        'Consultando Ollama… (la primera vez puede tardar 1-2 min si el modelo es grande)',
        { id: 'owa' },
      ),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success('Ollama respondió y el mensaje fue enviado por WhatsApp.', { id: 'owa' });
      } else if (r.step === 'ollama') {
        toast.error(
          'No se pudo consultar Ollama. Revisa la URL, el modelo o si la máquina está encendida.',
          { id: 'owa' },
        );
      } else if (r.step === 'whatsapp') {
        toast.error('Ollama respondió, pero no se pudo enviar el WhatsApp. Revisa OpenWA.', {
          id: 'owa',
        });
      } else {
        toast.error(r.error || 'Error desconocido', { id: 'owa' });
      }
    },
    onError: (e: any) => {
      if (e?.code === 'ECONNABORTED' || e?.message?.includes('timeout')) {
        toast.error(
          'Timeout. El modelo está tardando en cargar. Espera 1-2 min y vuelve a probar.',
          { id: 'owa' },
        );
      } else {
        toast.error(e?.response?.data?.message || e.message, { id: 'owa' });
      }
    },
  });

  const validChatId = /^\d{6,18}@c\.us$/.test(chatId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-4"
    >
      {/* Campo común chatId */}
      <Card title="WhatsApp de prueba">
        <label className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5 block">
          Número (formato 34670209033@c.us)
        </label>
        <input
          value={chatId}
          onChange={(e) => setChatId(e.target.value.trim())}
          placeholder="34670209033@c.us"
          className="w-full bg-bg-subtle/60 border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-border-strong"
        />
        <div
          className={`mt-2 text-[11px] ${
            chatId && !validChatId ? 'text-danger' : 'text-fg-subtle'
          }`}
        >
          {chatId && !validChatId
            ? '⚠ Formato inválido. Usa solo dígitos + @c.us'
            : 'Se usará para enviar mensajes de prueba desde OpenWA y Ollama.'}
        </div>
      </Card>

      {/* 2 cards: OpenWA y Ollama */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* OpenWA */}
        <Card title="OpenWA">
          <div className="space-y-3">
            <Row label="Estado" value={<StatusBadge ok={health.data?.services.openwa.ok} />} />
            <Row
              label="Sesión"
              value={
                session.isLoading ? (
                  <Skeleton className="h-4 w-32" />
                ) : (
                  <span className="font-mono text-xs">{session.data?.name || '—'}</span>
                )
              }
            />
            <Row
              label="Número"
              value={
                <span className="font-mono text-xs">
                  {session.data?.phone || '—'}
                </span>
              }
            />
            <div className="pt-2">
              <Button
                variant="primary"
                onClick={() => testWa.mutate()}
                disabled={!validChatId || testWa.isPending}
                className="w-full"
              >
                <Send size={13} />
                Enviar test WhatsApp
              </Button>
            </div>
          </div>
        </Card>

        {/* Ollama */}
        <Card title="Ollama">
          <div className="space-y-3">
            <Row
              label="URL activa"
              value={
                ollama.isLoading ? (
                  <Skeleton className="h-4 w-40" />
                ) : (
                  <span className="font-mono text-xs truncate max-w-[200px]" title={ollama.data?.baseUrl}>
                    {ollama.data?.baseUrl || '—'}
                  </span>
                )
              }
            />
            <Row
              label="Modelo activo"
              value={
                <span className="font-mono text-xs text-accent">
                  {ollama.data?.activeModel || '—'}
                </span>
              }
            />
            <Row
              label="Estado"
              value={
                <span className="flex items-center gap-2">
                  <StatusBadge ok={ollama.data?.status === 'online'} />
                  {ollama.data?.latencyMs != null && (
                    <span className="text-xs text-fg-muted">
                      · {ollama.data.latencyMs}ms
                    </span>
                  )}
                </span>
              }
            />
            <div className="pt-2">
              <Button
                variant="primary"
                onClick={() => testOllamaWa.mutate()}
                disabled={
                  !validChatId || testOllamaWa.isPending || ollama.data?.status !== 'online'
                }
                className="w-full"
              >
                <Sparkles size={13} />
                Enviar test Ollama por WhatsApp
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </motion.div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="text-[10px] uppercase tracking-wider text-fg-subtle">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  );
}

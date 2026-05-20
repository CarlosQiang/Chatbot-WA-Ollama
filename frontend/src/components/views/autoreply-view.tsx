'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { motion } from 'framer-motion';
import { Save, Sparkles, Power } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function AutoReplyView() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['autoReply'],
    queryFn: apiClient.getAutoReply,
  });

  const [enabled, setEnabled] = useState(false);
  const [chatId, setChatId] = useState('');

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setChatId(data.chatId || '');
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiClient.saveAutoReply({ enabled, chatId: chatId.trim() }),
    onSuccess: () => {
      toast.success(enabled ? '🤖 Auto-respuesta IA activada' : '🛑 Auto-respuesta IA desactivada');
      qc.invalidateQueries({ queryKey: ['autoReply'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const valid = /^\d{6,18}@c\.us$/.test(chatId.trim());

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-4"
    >
      <Card
        title={
          <span className="flex items-center gap-2">
            <Sparkles size={13} /> Auto-respuesta IA
          </span>
        }
        action={
          <span
            className={cn(
              'text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full',
              enabled
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-bg-subtle text-fg-subtle border border-border',
            )}
          >
            {enabled ? 'ACTIVO' : 'INACTIVO'}
          </span>
        }
      >
        {isLoading ? (
          <Skeleton className="h-24" />
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-fg-muted leading-relaxed">
              <div className="mb-2">
                <strong className="text-fg">Caso de uso típico:</strong> "responder por mí a otra persona".
                Otro contacto te escribe y el bot le contesta automáticamente con Ollama,
                como si fueras tú. Ideal para cuando no puedes contestar pero quieres mantener una conversación viva.
              </div>
              Cuando esté <strong className="text-fg">activo</strong>, el bot responderá
              <strong className="text-accent"> siempre con Ollama</strong> a cualquier mensaje que llegue
              del número indicado, ignorando la whitelist. Cuando esté{' '}
              <strong className="text-fg">inactivo</strong>, ese número se comporta como cualquier otro
              (le aplica la whitelist normal).
            </div>

            {/* Toggle grande */}
            <button
              onClick={() => setEnabled(!enabled)}
              className={cn(
                'w-full p-4 rounded-lg border-2 transition-all duration-200 flex items-center justify-between',
                enabled
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-bg-subtle/40 hover:border-border-strong',
              )}
            >
              <div className="text-left">
                <div className="text-sm font-medium">
                  {enabled ? '🤖 Auto-respuesta activa' : '🛑 Auto-respuesta desactivada'}
                </div>
                <div className="text-[11px] text-fg-muted mt-0.5">
                  Click para {enabled ? 'desactivar' : 'activar'}
                </div>
              </div>
              <div
                className={cn(
                  'w-12 h-6 rounded-full transition-colors relative',
                  enabled ? 'bg-accent' : 'bg-bg-elevated border border-border',
                )}
              >
                <div
                  className={cn(
                    'w-5 h-5 rounded-full bg-bg-card absolute top-0.5 transition-transform',
                    enabled ? 'translate-x-6' : 'translate-x-0.5',
                  )}
                />
              </div>
            </button>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5 block">
                Número WhatsApp al que auto-responder
              </label>
              <input
                value={chatId}
                onChange={(e) => setChatId(e.target.value.trim())}
                placeholder="34670209033@c.us"
                className="w-full bg-bg-subtle/60 border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-border-strong"
              />
              {chatId && !valid && (
                <div className="text-[11px] text-danger mt-1">
                  ⚠ Formato inválido. Usa: 34XXXXXXXXX@c.us
                </div>
              )}
              <div className="text-[11px] text-fg-subtle mt-1.5">
                Formato internacional sin <code>+</code>, terminado en <code>@c.us</code>.
                Ejemplo: <code className="text-fg-muted">34670209033@c.us</code>.
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={() => save.mutate()}
                disabled={save.isPending || !valid}
              >
                <Save size={12} /> Guardar
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card title="¿Cómo funciona?">
        <ol className="text-sm text-fg-muted space-y-2 list-decimal list-inside leading-relaxed">
          <li>El usuario del número indicado te escribe al WhatsApp del bot.</li>
          <li>El backend detecta que es ese número y activa modo IA <strong>siempre</strong>.</li>
          <li>El mensaje va a Ollama (modelo activo) con el system prompt configurado.</li>
          <li>Ollama responde y el bot envía la respuesta por WhatsApp.</li>
          <li>Ni necesitas comandos ni nada — todo automático mientras el toggle esté ON.</li>
        </ol>
        <div className="mt-3 text-[11px] text-fg-subtle">
          ⚠ Si desactivas el toggle, ese número se tratará como cualquier otro (le aplicará la whitelist normal).
        </div>
      </Card>
    </motion.div>
  );
}

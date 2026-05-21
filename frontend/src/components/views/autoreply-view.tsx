'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { motion } from 'framer-motion';
import { Save, Sparkles, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Normalización en el cliente — espejo de `normalizeChatId` del backend.
 * Acepta cualquier formato razonable y devuelve `34XXXXXXXXX@c.us`, o null.
 */
function normalizeChatId(input: string): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;
  const atIdx = raw.indexOf('@');
  const localPart = atIdx >= 0 ? raw.slice(0, atIdx) : raw;
  const digits = localPart.replace(/\D/g, '');
  if (!/^\d{6,18}$/.test(digits)) return null;
  return `${digits}@c.us`;
}

export function AutoReplyView() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['autoReply'],
    queryFn: apiClient.getAutoReply,
  });

  const [enabled, setEnabled] = useState(false);
  const [chatIds, setChatIds] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (data) {
      setEnabled(data.enabled);
      setChatIds(data.chatIds || []);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiClient.saveAutoReply({ enabled, chatIds }),
    onSuccess: () => {
      toast.success(
        enabled
          ? `🤖 Auto-IA activa para ${chatIds.length} número(s)`
          : '🛑 Auto-IA desactivada',
      );
      qc.invalidateQueries({ queryKey: ['autoReply'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const draftPreview = normalizeChatId(draft);
  const draftValid = !!draftPreview;
  const draftDuplicate = !!draftPreview && chatIds.includes(draftPreview);

  const addNumber = () => {
    if (!draftPreview) {
      toast.error('Número inválido. Acepta 612345678, +34612345678, 34 612 345 678...');
      return;
    }
    if (chatIds.includes(draftPreview)) {
      toast.error('Ya está en la lista');
      return;
    }
    setChatIds([...chatIds, draftPreview]);
    setDraft('');
  };

  const removeNumber = (id: string) => {
    setChatIds(chatIds.filter((c) => c !== id));
  };

  const hasChanges =
    enabled !== (data?.enabled ?? false) ||
    JSON.stringify(chatIds) !== JSON.stringify(data?.chatIds ?? []);

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
            {enabled ? `ACTIVO · ${chatIds.length}` : 'INACTIVO'}
          </span>
        }
      >
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-fg-muted leading-relaxed">
              <div className="mb-2">
                <strong className="text-fg">Caso de uso típico:</strong> "responder por mí a otros".
                Otros contactos te escriben y el bot les contesta automáticamente con Ollama,
                como si fueras tú.
              </div>
              Cuando esté <strong className="text-fg">activo</strong>, el bot responderá
              <strong className="text-accent"> siempre con Ollama</strong> a cualquier mensaje que llegue
              de <strong className="text-fg">los números configurados aquí</strong>, ignorando la
              whitelist y el modo manual.
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

            {/* Lista de números */}
            <div>
              <label className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5 block">
                Números autorizados ({chatIds.length})
              </label>
              <div className="space-y-1.5 mb-2">
                {chatIds.length === 0 ? (
                  <div className="text-xs text-fg-muted bg-bg-subtle/40 border border-border rounded-md px-3 py-2">
                    Sin números — añade al menos uno para que Auto-IA funcione.
                  </div>
                ) : (
                  chatIds.map((id) => (
                    <div
                      key={id}
                      className="flex items-center justify-between bg-bg-subtle/40 border border-border rounded-md px-3 py-1.5"
                    >
                      <span className="font-mono text-xs">{id}</span>
                      <button
                        onClick={() => removeNumber(id)}
                        className="text-fg-muted hover:text-danger transition-colors"
                        aria-label="Quitar"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="flex gap-2">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addNumber()}
                  placeholder="612345678  ·  +34612345678  ·  34 612 345 678"
                  className="flex-1 bg-bg-subtle/60 border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-border-strong"
                />
                <Button
                  variant="outline"
                  onClick={addNumber}
                  disabled={!draftValid || draftDuplicate}
                >
                  <Plus size={12} /> Añadir
                </Button>
              </div>

              {draft && draftPreview && (
                <div className="text-[11px] text-fg-subtle mt-1.5">
                  Se guardará como: <code className="text-fg-muted">{draftPreview}</code>
                  {draftDuplicate && <span className="text-warning ml-2">(ya está en la lista)</span>}
                </div>
              )}
              {draft && !draftPreview && (
                <div className="text-[11px] text-danger mt-1.5">
                  ⚠ Número inválido. Necesita entre 6 y 18 dígitos.
                </div>
              )}
              <div className="text-[11px] text-fg-subtle mt-2">
                Pega los números en cualquier formato — el sistema los convierte automáticamente.
                Ejemplos válidos: <code>612345678</code>, <code>+34612345678</code>,
                <code>34 612 345 678</code>, <code>(34) 670-209-033</code>.
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                variant="primary"
                onClick={() => save.mutate()}
                disabled={save.isPending || !hasChanges}
              >
                <Save size={12} /> Guardar
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card title="¿Cómo funciona?">
        <ol className="text-sm text-fg-muted space-y-2 list-decimal list-inside leading-relaxed">
          <li>Un contacto de la lista te escribe al WhatsApp del bot.</li>
          <li>El backend detecta que es uno de esos números y activa modo IA <strong>siempre</strong>.</li>
          <li>El mensaje va a Ollama (modelo activo) con el system prompt configurado.</li>
          <li>Ollama responde y el bot envía la respuesta por WhatsApp.</li>
          <li>Sin comandos — todo automático mientras el toggle esté ON.</li>
        </ol>
        <div className="mt-3 text-[11px] text-fg-subtle">
          ⚠ Si desactivas el toggle, esos números vuelven a comportarse como cualquier otro
          (whitelist normal). Auto-IA prevalece sobre <em>manual</em> pero no sobre
          <em>silent</em> / <em>maintenance</em>.
        </div>
      </Card>
    </motion.div>
  );
}

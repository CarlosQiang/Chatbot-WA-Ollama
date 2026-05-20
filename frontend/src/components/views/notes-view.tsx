'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { motion } from 'framer-motion';
import { StickyNote, Trash2, Sparkles, Plus, Wand2 } from 'lucide-react';
import { toast } from 'sonner';

export function NotesView() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['notes'],
    queryFn: apiClient.listNotes,
    refetchInterval: 30_000,
  });

  const [text, setText] = useState('');
  const [organizeText, setOrganizeText] = useState('');
  const [organizedPreview, setOrganizedPreview] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => apiClient.createNote({ text }),
    onSuccess: () => {
      toast.success('Nota guardada');
      setText('');
      qc.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const organize = useMutation({
    mutationFn: () => apiClient.organizeNote({ text: organizeText }),
    onSuccess: (r) => {
      setOrganizedPreview(r.organized);
      toast.success('Organizado por Ollama');
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const organizeExisting = useMutation({
    mutationFn: (id: string) => apiClient.organizeNote({ id }),
    onSuccess: () => {
      toast.success('Nota organizada');
      qc.invalidateQueries({ queryKey: ['notes'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiClient.deleteNote(id),
    onSuccess: () => {
      toast.success('Nota borrada');
      qc.invalidateQueries({ queryKey: ['notes'] });
    },
  });

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
            <StickyNote size={13} /> Nueva nota
          </span>
        }
      >
        <div className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Escribe aquí tu nota o idea..."
            rows={4}
            className="w-full bg-bg-subtle/60 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-border-strong resize-vertical"
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => create.mutate()}
              disabled={!text.trim() || create.isPending}
            >
              <Plus size={12} /> Guardar nota
            </Button>
          </div>
        </div>
      </Card>

      <Card
        title={
          <span className="flex items-center gap-2">
            <Wand2 size={13} /> Organizar idea con IA
          </span>
        }
      >
        <div className="space-y-2">
          <div className="text-xs text-fg-muted">
            Pega una idea desordenada y la IA te devuelve una versión estructurada y corregida.
            También funciona desde Telegram/WhatsApp con: <code>/organiza ...</code> o
            "organiza esto: ...".
          </div>
          <textarea
            value={organizeText}
            onChange={(e) => setOrganizeText(e.target.value)}
            placeholder="Pega tu idea o conjunto de pensamientos..."
            rows={4}
            className="w-full bg-bg-subtle/60 border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-border-strong resize-vertical"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setOrganizeText('');
                setOrganizedPreview(null);
              }}
            >
              Limpiar
            </Button>
            <Button
              variant="primary"
              onClick={() => organize.mutate()}
              disabled={!organizeText.trim() || organize.isPending}
            >
              <Sparkles size={12} /> Organizar
            </Button>
          </div>
          {organize.isPending && (
            <div className="text-xs text-fg-muted">Procesando con Ollama (puede tardar unos segundos)...</div>
          )}
          {organizedPreview && (
            <div className="mt-3 p-3 rounded border border-accent/30 bg-accent/5 text-sm whitespace-pre-wrap">
              {organizedPreview}
            </div>
          )}
        </div>
      </Card>

      <Card title={`Notas guardadas (${list.data?.length || 0})`}>
        {list.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : !list.data?.length ? (
          <div className="text-fg-muted text-sm py-6 text-center">
            No hay notas guardadas. Usa el campo de arriba o manda <code>/nota &lt;texto&gt;</code> desde
            WhatsApp / Telegram.
          </div>
        ) : (
          <div className="space-y-2">
            {list.data.map((n: any) => (
              <div
                key={n.id}
                className="p-3 rounded border border-border bg-bg-subtle/40 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] text-fg-subtle uppercase tracking-wider mb-1">
                      <span className="font-mono">{n.id.slice(0, 6)}</span>
                      <span>· {n.source}</span>
                      <span>· {new Date(n.createdAt).toLocaleString('es-ES')}</span>
                    </div>
                    <div className="text-sm whitespace-pre-wrap">{n.text}</div>
                    {n.organized && (
                      <div className="mt-2 p-2 rounded bg-accent/5 border border-accent/20 text-sm whitespace-pre-wrap">
                        <div className="text-[10px] uppercase tracking-wider text-accent mb-1">
                          Organizado
                        </div>
                        {n.organized}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => organizeExisting.mutate(n.id)}
                      disabled={organizeExisting.isPending}
                      title="Organizar con IA"
                    >
                      <Sparkles size={11} />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => remove.mutate(n.id)}
                      title="Borrar"
                    >
                      <Trash2 size={11} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { EmptyState } from '@/components/ui/states';
import { motion } from 'framer-motion';
import { Plus, Trash2, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { PromptEditor } from './prompt-editor';

export function RemindersView() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['reminders'],
    queryFn: apiClient.listReminders,
    refetchInterval: 15_000,
  });
  const [input, setInput] = useState('');

  const create = useMutation({
    mutationFn: () => apiClient.createReminder(input),
    onSuccess: () => {
      toast.success('Recordatorio creado');
      setInput('');
      qc.invalidateQueries({ queryKey: ['reminders'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const del = useMutation({
    mutationFn: (id: string) => apiClient.deleteReminder(id),
    onSuccess: () => {
      toast.success('Borrado');
      qc.invalidateQueries({ queryKey: ['reminders'] });
    },
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-4"
    >
      <Card title="Nuevo recordatorio">
        <div className="space-y-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && input.trim() && create.mutate()}
            placeholder='Prueba: "recuérdame mañana a las 9 llamar al médico"'
            disabled={create.isPending}
            className="input-base"
            aria-label="Texto del recordatorio"
          />

          {/* Ejemplos de formatos */}
          <div className="rounded-lg bg-bg-subtle/60 border border-border px-3 py-2.5 space-y-1.5">
            <div className="text-2xs label-caps mb-2">Ejemplos que funcionan</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {[
                'recuérdame en una hora hacer el trabajo',
                'avísame mañana a las 7 llamar al médico',
                'ponme un recordatorio el viernes a las 21:00 backup',
                'no se me olvide el lunes a las 9 reunión',
                '18:30 comprar pan',
                'diario 08:00 revisar email',
              ].map((ex) => (
                <button
                  key={ex}
                  onClick={() => setInput(ex)}
                  className="text-left text-xs text-fg-muted hover:text-fg hover:bg-bg-subtle px-2 py-1 rounded-md transition-colors truncate"
                  title={ex}
                >
                  · {ex}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-fg-subtle leading-relaxed">
              Se envían por <strong className="text-accent font-medium">WhatsApp</strong> al número en{' '}
              <span className="text-fg-muted">Ajustes → Mi WhatsApp personal</span>.
            </p>
            <Button
              variant="primary"
              onClick={() => create.mutate()}
              loading={create.isPending}
              disabled={!input.trim()}
            >
              <Plus size={12} /> Crear
            </Button>
          </div>
        </div>
      </Card>

      <PromptEditor
        field="reminders"
        title="Prompt activo para entender recordatorios en lenguaje natural"
        description="Este prompt enseña a la IA a interpretar tus frases coloquiales y convertirlas en recordatorios. Por defecto entiende cosas como 'esta tarde', 'el finde', 'antes de cenar', 'en un rato', abreviaturas y faltas de ortografía. Edítalo si quieres añadir tus propias expresiones. Si lo vacías, se restaura el prompt por defecto."
        defaultCollapsed={false}
      />

      <Card
        title={
          <span className="flex items-center gap-2">
            Activos
            {data?.list?.length ? (
              <span className="text-2xs font-medium px-1.5 py-0.5 rounded-full bg-bg-subtle border border-border text-fg-muted">
                {data.list.length}
              </span>
            ) : null}
            {data?.tz && (
              <span className="text-2xs text-fg-subtle font-normal font-mono">{data.tz}</span>
            )}
          </span>
        }
        noPadding
      >
        {isLoading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : !data?.list?.length ? (
          <EmptyState
            compact
            icon={<Bell size={18} strokeWidth={1.5} />}
            title="Sin recordatorios activos"
            description="Crea uno arriba o desde Telegram con /recordar"
          />
        ) : (
          <div className="divide-y divide-border">
            {data.list.map((r: any) => {
              const isRecurring = !!r.cronExpression;
              const when = r.fireAt
                ? new Date(r.fireAt).toLocaleString('es-ES', { timeZone: data.tz, dateStyle: 'short', timeStyle: 'short' })
                : r.cronExpression;
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3 group">
                  {/* Ícono tipo */}
                  <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${isRecurring ? 'bg-info/10 text-info' : 'bg-accent/10 text-accent'}`}>
                    <Bell size={13} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-fg leading-snug truncate">{r.text}</div>
                    <div className="text-2xs text-fg-subtle mt-0.5 flex items-center gap-1.5 flex-wrap">
                      {isRecurring && (
                        <span className="text-info text-2xs font-medium">recurrente</span>
                      )}
                      <span className="font-mono">{when}</span>
                      <span>·</span>
                      <span className="font-mono text-fg-subtle/70">{r.id.slice(0, 6)}</span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => del.mutate(r.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-fg-subtle hover:text-danger"
                    aria-label="Borrar recordatorio"
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

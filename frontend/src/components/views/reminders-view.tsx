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
      <Card title="Crear recordatorio">
        <div className="space-y-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && input && create.mutate()}
            placeholder="15:30 Comprar pan"
            className="w-full bg-bg-subtle/60 border border-border rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:border-border-strong"
          />
          <div className="flex justify-between items-end gap-3">
            <div className="text-[11px] text-fg-subtle leading-relaxed flex-1">
              Todos los recordatorios se envían por <strong className="text-accent">WhatsApp</strong> al
              número configurado en Ajustes → "Mi WhatsApp personal".
              <br />
              Formatos:
              <code className="text-fg-muted ml-1">15:30 texto</code> ·
              <code className="text-fg-muted ml-1">25/12 09:00 texto</code> ·
              <code className="text-fg-muted ml-1">+30m texto</code> ·
              <code className="text-fg-muted ml-1">diario HH:MM texto</code>
            </div>
            <Button variant="primary" onClick={() => create.mutate()} disabled={!input || create.isPending}>
              <Plus size={12} /> Crear
            </Button>
          </div>
        </div>
      </Card>

      <PromptEditor
        field="reminders"
        title="Prompt personalizado para entender recordatorios"
        description="Solo se usa como fallback IA cuando el parser estándar (regex) no entiende una frase como 'mañana a las 7 avísame del médico'. El modelo debe devolver JSON estricto con {text, when, type}. Vacío = prompt por defecto."
      />

      <Card title={`Recordatorios activos${data?.tz ? ` (${data.tz})` : ''}`}>
        {isLoading ? (
          <Skeleton className="h-32" />
        ) : !data?.list?.length ? (
          <EmptyState
            icon={<Bell size={20} strokeWidth={1.5} />}
            title="Sin recordatorios"
            description="Crea uno arriba o desde Telegram con /recordar"
          />
        ) : (
          <div className="divide-y divide-border -m-4">
            {data.list.map((r: any) => {
              const when = r.fireAt
                ? new Date(r.fireAt).toLocaleString('es-ES', {
                    timeZone: data.tz,
                  })
                : `cron · ${r.cronExpression}`;
              return (
                <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{r.text}</div>
                    <div className="text-[11px] text-fg-subtle mt-1 flex items-center gap-2 flex-wrap">
                      <span className="font-mono">{r.id.slice(0, 6)}</span>
                      <span>·</span>
                      <span className="text-accent">→ {r.targetChatId}</span>
                      <span>·</span>
                      <span>{when}</span>
                    </div>
                  </div>
                  <Button variant="danger" size="sm" onClick={() => del.mutate(r.id)}>
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

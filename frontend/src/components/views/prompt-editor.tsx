'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Save, Wand2, ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Bloque "Prompt personalizado" reutilizable.
 *
 * Lee y guarda el prompt correspondiente vía `/settings/prompts`. Es
 * colapsable para no saturar la vista cuando no se está editando, y
 * tiene un botón "Restaurar prompt por defecto" que limpia el campo.
 *
 * - field="notes":     edita el prompt de organizar notas
 * - field="reminders": edita el prompt de parsear recordatorios en NL
 */
export function PromptEditor({
  field,
  title,
  description,
  defaultCollapsed = true,
}: {
  field: 'notes' | 'reminders';
  title: string;
  description: string;
  defaultCollapsed?: boolean;
}) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['prompts'],
    queryFn: apiClient.getPrompts,
  });

  const [open, setOpen] = useState(!defaultCollapsed);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (data) setValue(field === 'notes' ? data.notes : data.reminders);
  }, [data, field]);

  const save = useMutation({
    mutationFn: () =>
      apiClient.savePrompts(
        field === 'notes' ? { notes: value } : { reminders: value },
      ),
    onSuccess: () => {
      toast.success(value.trim()
        ? 'Prompt personalizado guardado'
        : 'Prompt por defecto restaurado');
      qc.invalidateQueries({ queryKey: ['prompts'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const placeholder = data?.defaults?.[field] || 'Vacío = usar prompt por defecto';
  const isCustom = !!value.trim();

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Wand2 size={13} /> {title}
          {isCustom && (
            <span className="text-[10px] uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded">
              personalizado
            </span>
          )}
        </span>
      }
      action={
        <button
          onClick={() => setOpen(!open)}
          className="text-fg-muted hover:text-fg flex items-center gap-1 text-xs"
        >
          {open ? (
            <>
              <ChevronUp size={12} /> Ocultar
            </>
          ) : (
            <>
              <ChevronDown size={12} /> Mostrar prompt
            </>
          )}
        </button>
      }
    >
      <div className="text-[11px] text-fg-subtle mb-2">{description}</div>

      <div
        className={cn(
          'transition-all overflow-hidden',
          open ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0',
        )}
      >
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          rows={8}
          className="w-full bg-bg-subtle/60 border border-border rounded-md p-3 text-sm font-mono focus:outline-none focus:border-border-strong"
        />
        <div className="flex justify-between gap-2 mt-2">
          <Button
            variant="ghost"
            onClick={() => setValue('')}
            disabled={!value}
            title="Vaciar para usar el prompt por defecto"
          >
            <RotateCcw size={12} /> Restaurar default
          </Button>
          <div className="flex gap-2">
            {data?.defaults?.[field] && (
              <Button
                variant="ghost"
                onClick={() => setValue(data.defaults[field])}
                title="Cargar el prompt por defecto en el editor para tunearlo"
              >
                Cargar default en editor
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => save.mutate()}
              disabled={save.isPending || isLoading}
            >
              <Save size={12} /> Guardar prompt
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

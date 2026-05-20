'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { formatBytes } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { toast } from 'sonner';

export function ModelsView() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['models'],
    queryFn: apiClient.listModels,
    refetchInterval: 15_000,
  });

  const mut = useMutation({
    mutationFn: (m: string) => apiClient.selectModel(m),
    onSuccess: (r) => {
      toast.success(`Modelo activo: ${r.active}`);
      qc.invalidateQueries({ queryKey: ['models'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      <Card
        title="Modelos Ollama"
        action={
          data?.active && (
            <span className="text-xs text-fg-muted">
              activo: <span className="font-mono text-accent">{data.active}</span>
            </span>
          )
        }
      >
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : !data?.models.length ? (
          <div className="text-fg-muted text-sm py-6 text-center">
            No hay modelos en Ollama. Instala uno con <code className="font-mono text-fg">ollama pull llama3</code>.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.models.map((m) => {
              const active = m.name === data.active;
              return (
                <div
                  key={m.name}
                  className="flex items-center justify-between py-3"
                >
                  <div>
                    <div className="font-mono text-sm flex items-center gap-2">
                      {m.name}
                      {active && (
                        <span className="text-[10px] uppercase tracking-wider text-accent">
                          activo
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-fg-subtle">
                      {formatBytes(m.size)}{' '}
                      {m.modified_at && `· ${new Date(m.modified_at).toLocaleDateString()}`}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant={active ? 'ghost' : 'outline'}
                    disabled={active || mut.isPending}
                    onClick={() => mut.mutate(m.name)}
                  >
                    {active ? <Check size={12} /> : 'usar'}
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

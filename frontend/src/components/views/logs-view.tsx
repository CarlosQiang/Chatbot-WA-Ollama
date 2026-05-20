'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const levels = ['', 'info', 'warn', 'error', 'debug'];
const sources = ['', 'openwa', 'ollama', 'chat', 'webhook', 'system', 'command'];

export function LogsView() {
  const qc = useQueryClient();
  const [level, setLevel] = useState('');
  const [source, setSource] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['logs', { level, source }],
    queryFn: () =>
      apiClient.listLogs({
        limit: 200,
        level: level || undefined,
        source: source || undefined,
      }),
    refetchInterval: 3_000,
  });

  const clear = useMutation({
    mutationFn: apiClient.clearLogs,
    onSuccess: () => {
      toast.success('Logs borrados');
      qc.invalidateQueries({ queryKey: ['logs'] });
    },
  });

  return (
    <Card
      title="Logs del sistema"
      action={
        <div className="flex items-center gap-2">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="bg-bg-subtle border border-border rounded-md text-xs px-2 py-1"
          >
            {levels.map((l) => (
              <option key={l} value={l}>
                {l || 'all levels'}
              </option>
            ))}
          </select>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="bg-bg-subtle border border-border rounded-md text-xs px-2 py-1"
          >
            {sources.map((s) => (
              <option key={s} value={s}>
                {s || 'all sources'}
              </option>
            ))}
          </select>
          <Button size="sm" variant="danger" onClick={() => clear.mutate()}>
            <Trash2 size={12} /> clear
          </Button>
        </div>
      }
    >
      {isLoading ? (
        <Skeleton className="h-48" />
      ) : !data?.length ? (
        <div className="text-center text-fg-muted text-xs py-6">sin logs</div>
      ) : (
        <div className="font-mono text-[11px] divide-y divide-border max-h-[65vh] overflow-y-auto">
          {data.map((l) => (
            <div key={l.id} className="flex gap-3 py-1.5">
              <span className="text-fg-subtle whitespace-nowrap">
                {new Date(l.createdAt).toLocaleTimeString()}
              </span>
              <span
                className={cn(
                  'uppercase w-12',
                  l.level === 'error'
                    ? 'text-danger'
                    : l.level === 'warn'
                      ? 'text-warn'
                      : l.level === 'debug'
                        ? 'text-fg-subtle'
                        : 'text-info',
                )}
              >
                {l.level}
              </span>
              <span className="text-fg-muted w-20">[{l.source}]</span>
              <span className="text-fg flex-1 break-all">{l.message}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

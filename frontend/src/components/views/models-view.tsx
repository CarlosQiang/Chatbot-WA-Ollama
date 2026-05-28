'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Check, Plus, Trash2, Server, Zap, RefreshCw, Cpu } from 'lucide-react';
import { toast } from 'sonner';

export function ModelsView() {
  const qc = useQueryClient();

  // Modelos agrupados por servidor
  const all = useQuery({
    queryKey: ['modelsAll'],
    queryFn: apiClient.listAllModels,
    refetchInterval: 20_000,
  });

  // Servidores Ollama (para mostrar config raw, latencias, etc.)
  const ollama = useQuery({
    queryKey: ['ollamaSettings'],
    queryFn: apiClient.getOllamaSettings,
    refetchInterval: 20_000,
  });

  const [newUrl, setNewUrl] = useState('');
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<
    Record<string, { ok: boolean; latency?: number | null; models?: string[]; error?: string }>
  >({});

  const selectModel = useMutation({
    mutationFn: ({ model, url }: { model: string; url?: string }) =>
      apiClient.selectModel(model, url),
    onSuccess: (r) => {
      toast.success(`Modelo activo: ${r.active} en ${r.primary}`);
      qc.invalidateQueries({ queryKey: ['modelsAll'] });
      qc.invalidateQueries({ queryKey: ['models'] });
      qc.invalidateQueries({ queryKey: ['ollamaSettings'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const saveOllama = useMutation({
    mutationFn: (data: { baseUrl?: string; fallbackUrls?: string[] }) =>
      apiClient.saveOllamaSettings(data as any),
    onSuccess: () => {
      toast.success('Servidores Ollama actualizados');
      qc.invalidateQueries({ queryKey: ['ollamaSettings'] });
      qc.invalidateQueries({ queryKey: ['modelsAll'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const testUrl = async (url: string) => {
    if (!url) return;
    setTesting(url);
    try {
      const r = await apiClient.testOllama(url);
      setTestResult((prev) => ({
        ...prev,
        [url]: { ok: r.ok, latency: r.latencyMs, models: r.models, error: r.error },
      }));
      if (r.ok)
        toast.success(`${url} OK · ${r.latencyMs}ms · ${r.models?.length || 0} modelos`);
      else toast.error(`${url}: ${r.error}`);
    } finally {
      setTesting(null);
    }
  };

  const setAsPrimary = (url: string) => {
    const fallback = (ollama.data?.fallbackUrls || []).filter((u: string) => u !== url);
    const oldPrimary = ollama.data?.baseUrl;
    if (oldPrimary && oldPrimary !== url) fallback.push(oldPrimary);
    saveOllama.mutate({ baseUrl: url, fallbackUrls: fallback });
  };

  const addFallback = () => {
    if (!newUrl || !/^https?:\/\//.test(newUrl)) {
      toast.error('URL invalida. Debe empezar por http:// o https://');
      return;
    }
    const fallback = [...(ollama.data?.fallbackUrls || []), newUrl];
    saveOllama.mutate({ fallbackUrls: fallback });
    setNewUrl('');
  };

  const removeFallback = (url: string) => {
    const fallback = (ollama.data?.fallbackUrls || []).filter((u: string) => u !== url);
    saveOllama.mutate({ fallbackUrls: fallback });
  };

  const allUrls: string[] = ollama.data
    ? [ollama.data.baseUrl, ...((ollama.data as any).fallbackUrls || [])].filter(Boolean)
    : [];

  const totalModels =
    all.data?.servers.reduce((sum, s) => sum + (s.ok ? s.models.length : 0), 0) || 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      {/* Servidores Ollama */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <Server size={13} /> Servidores Ollama
          </span>
        }
        action={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ['ollamaSettings'] });
              qc.invalidateQueries({ queryKey: ['modelsAll'] });
            }}
          >
            <RefreshCw size={12} /> Refrescar
          </Button>
        }
      >
        <div className="text-xs text-fg-muted mb-3 leading-relaxed">
          El primero (<strong>primario</strong>) es el que se usa por defecto. Si cae, el backend
          intenta automaticamente los <strong>fallback</strong> en orden.
        </div>

        {ollama.isLoading ? (
          <Skeleton className="h-20" />
        ) : (
          <div className="space-y-2">
            {allUrls.map((url, idx) => {
              const isPrimary = idx === 0;
              const result = testResult[url];
              const isActive =
                ollama.data?.status === 'online' && url === ollama.data?.baseUrl;
              return (
                <div
                  key={url}
                  className={cn(
                    'flex items-center gap-2 p-2 rounded border',
                    isPrimary ? 'border-accent/40 bg-accent/5' : 'border-border bg-bg-subtle/40',
                  )}
                >
                  <span
                    className={cn(
                      'text-2xs uppercase font-mono px-2 py-0.5 rounded',
                      isPrimary
                        ? 'bg-accent/20 text-accent'
                        : 'bg-bg-elevated text-fg-subtle',
                    )}
                  >
                    {isPrimary ? 'primario' : `fallback ${idx}`}
                  </span>
                  <span className="font-mono text-xs flex-1 truncate">{url}</span>
                  {result && (
                    <span
                      className={cn(
                        'text-2xs font-mono',
                        result.ok ? 'text-accent' : 'text-danger',
                      )}
                    >
                      {result.ok
                        ? `${result.latency}ms · ${result.models?.length || 0} mod`
                        : 'KO'}
                    </span>
                  )}
                  {isActive && <span className="text-2xs text-accent">en uso</span>}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={testing === url}
                    onClick={() => testUrl(url)}
                    title="Probar conexion"
                  >
                    <Zap size={11} />
                  </Button>
                  {!isPrimary && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setAsPrimary(url)}
                        title="Marcar como primario"
                      >
                        <Check size={11} />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFallback(url)}
                        title="Eliminar"
                      >
                        <Trash2 size={11} />
                      </Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Añadir nuevo */}
        <div className="mt-4 pt-3 border-t border-border space-y-2">
          <label className="text-2xs uppercase tracking-wider text-fg-subtle block">
            Añadir servidor Ollama
          </label>
          <div className="flex gap-2">
            <input
              value={newUrl}
              onChange={(e) => setNewUrl(e.target.value.trim())}
              placeholder="http://192.168.8.186:11434"
              className="flex-1 input-base font-mono"
            />
            <Button
              variant="ghost"
              onClick={() => testUrl(newUrl)}
              disabled={!newUrl || testing === newUrl}
            >
              <Zap size={12} /> Probar
            </Button>
            <Button variant="primary" onClick={addFallback} disabled={!newUrl}>
              <Plus size={12} /> Añadir
            </Button>
          </div>
          {testResult[newUrl] && (
            <div
              className={cn(
                'text-[11px] font-mono',
                testResult[newUrl].ok ? 'text-accent' : 'text-danger',
              )}
            >
              {testResult[newUrl].ok
                ? `OK · ${testResult[newUrl].latency}ms · ${testResult[newUrl].models?.length || 0} modelos: ${testResult[newUrl].models?.slice(0, 3).join(', ')}${(testResult[newUrl].models?.length || 0) > 3 ? '...' : ''}`
                : `Error: ${testResult[newUrl].error}`}
            </div>
          )}
          <div className="text-[11px] text-fg-subtle">
            Si tu Ollama remoto da "connection refused", asegurate de que escucha en{' '}
            <code>0.0.0.0</code>:
            <code className="block mt-1 p-1 bg-bg-subtle/60 rounded">
              OLLAMA_HOST=0.0.0.0:11434 ollama serve
            </code>
          </div>
        </div>
      </Card>

      {/* Modelos disponibles - agrupados por servidor */}
      <Card
        title={
          <span className="flex items-center gap-2">
            <Cpu size={13} /> Modelos disponibles · todos los servidores
          </span>
        }
        action={
          all.data?.active && (
            <span className="text-xs text-fg-muted">
              activo: <span className="font-mono text-accent">{all.data.active}</span> ·{' '}
              <span className="font-mono">{totalModels}</span> totales
            </span>
          )
        }
      >
        {all.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : (
          <div className="space-y-4">
            {all.data?.servers.map((srv) => (
              <div key={srv.url} className="space-y-2">
                {/* Cabecera de servidor */}
                <div
                  className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded border',
                    srv.isPrimary
                      ? 'border-accent/40 bg-accent/5'
                      : 'border-border bg-bg-subtle/40',
                  )}
                >
                  <Server size={11} className="text-fg-subtle" />
                  <span className="font-mono text-xs flex-1">{srv.url}</span>
                  {srv.isPrimary && (
                    <span className="text-2xs uppercase font-mono bg-accent/20 text-accent px-2 py-0.5 rounded">
                      primario
                    </span>
                  )}
                  <span
                    className={cn(
                      'text-2xs font-mono',
                      srv.ok ? 'text-accent' : 'text-danger',
                    )}
                  >
                    {srv.ok
                      ? `OK ${srv.latencyMs}ms · ${srv.models.length} mod`
                      : `KO ${srv.error?.slice(0, 30) || ''}`}
                  </span>
                </div>

                {/* Lista de modelos del servidor */}
                {srv.ok && srv.models.length > 0 ? (
                  <div className="pl-6 divide-y divide-border">
                    {srv.models.map((m) => {
                      const isActive = m === all.data?.active && srv.isPrimary;
                      const isActiveModelOnOther =
                        m === all.data?.active && !srv.isPrimary;
                      return (
                        <div key={m} className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm">{m}</span>
                            {isActive && (
                              <span className="text-2xs uppercase tracking-wider text-accent">
                                activo
                              </span>
                            )}
                            {isActiveModelOnOther && (
                              <span className="text-2xs text-fg-subtle">
                                activo en otro servidor
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant={isActive ? 'ghost' : 'outline'}
                            disabled={isActive || selectModel.isPending}
                            onClick={() => selectModel.mutate({ model: m, url: srv.url })}
                            title={
                              srv.isPrimary
                                ? 'Activar modelo'
                                : `Cambiar primario a ${srv.url} y activar ${m}`
                            }
                          >
                            {isActive ? (
                              <Check size={12} />
                            ) : srv.isPrimary ? (
                              'usar'
                            ) : (
                              'usar (cambia primario)'
                            )}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                ) : srv.ok ? (
                  <div className="pl-6 text-[11px] text-fg-subtle py-2">
                    Sin modelos. Instala uno con{' '}
                    <code className="font-mono">ollama pull llama3.2:1b</code> en esta maquina.
                  </div>
                ) : (
                  <div className="pl-6 text-[11px] text-danger py-2">
                    No accesible: {srv.error}
                  </div>
                )}
              </div>
            ))}
            {!all.data?.servers.length && (
              <div className="text-fg-muted text-sm py-6 text-center">
                No hay servidores Ollama configurados.
              </div>
            )}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

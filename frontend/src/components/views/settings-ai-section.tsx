'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { Save, RefreshCw, Eye, EyeOff, Brain, FileEdit } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Sección "Proveedor IA" — permite elegir entre Ollama (local) y OpenAI
 * (o compatibles). Si el usuario tenía Ollama funcionando, NO se toca
 * nada: el default es 'ollama' y los valores existentes siguen iguales.
 */
export function AiProviderSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['aiSettings'],
    queryFn: apiClient.getAiSettings,
  });

  const [provider, setProvider] = useState<'ollama' | 'openai'>('ollama');
  const [temperature, setTemperature] = useState(0.7);
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiBaseUrl, setOpenaiBaseUrl] = useState('');
  const [openaiModel, setOpenaiModel] = useState('');
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (data) {
      setProvider(data.provider);
      setTemperature(data.temperature);
      setOpenaiBaseUrl(data.openaiBaseUrl);
      // openaiKey y openaiModel no llegan en el GET (el key no se devuelve
      // por seguridad). El usuario puede pegar uno nuevo encima.
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiClient.saveAiSettings({
        provider,
        temperature,
        ...(openaiKey ? { openaiApiKey: openaiKey } : {}),
        ...(openaiBaseUrl ? { openaiBaseUrl } : {}),
        ...(openaiModel ? { openaiModel } : {}),
      }),
    onSuccess: () => {
      toast.success('Proveedor IA guardado');
      setOpenaiKey('');
      qc.invalidateQueries({ queryKey: ['aiSettings'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const testOpenAi = useMutation({
    mutationFn: () =>
      apiClient.testOpenAi({
        ...(openaiKey ? { apiKey: openaiKey } : {}),
        ...(openaiBaseUrl ? { baseUrl: openaiBaseUrl } : {}),
      }),
    onMutate: () => toast.loading('Probando OpenAI...', { id: 'oaitest' }),
    onSuccess: (r) => {
      if (r.ok) {
        toast.success(
          `Conexión OpenAI OK. ${r.models?.length ?? 0} modelos disponibles.`,
          { id: 'oaitest' },
        );
        if (r.models?.length && !openaiModel) {
          // Sugiere uno por defecto si no hay nada elegido.
          const suggested = r.models.find((m) => m.startsWith('gpt-4o-mini')) || r.models[0];
          setOpenaiModel(suggested);
        }
      } else {
        toast.error(r.error || 'No se pudo conectar con OpenAI', { id: 'oaitest' });
      }
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message || e.message, { id: 'oaitest' }),
  });

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Brain size={13} /> Proveedor IA
        </span>
      }
    >
      <div className="space-y-4">
        {/* Selector de proveedor */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5 block">
            ¿Qué modelo usa la aplicación?
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setProvider('ollama')}
              className={cn(
                'p-3 rounded-md border-2 text-left transition-colors',
                provider === 'ollama'
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-bg-subtle/40 hover:border-border-strong',
              )}
            >
              <div className="text-sm font-medium">Ollama (local)</div>
              <div className="text-[11px] text-fg-muted mt-0.5">
                Modelos en tu servidor. Privado, sin coste por consulta.
              </div>
            </button>
            <button
              onClick={() => setProvider('openai')}
              className={cn(
                'p-3 rounded-md border-2 text-left transition-colors',
                provider === 'openai'
                  ? 'border-accent bg-accent/10'
                  : 'border-border bg-bg-subtle/40 hover:border-border-strong',
              )}
            >
              <div className="text-sm font-medium">OpenAI / compatible</div>
              <div className="text-[11px] text-fg-muted mt-0.5">
                GPT-4o, GPT-4o mini, etc. Necesitas una API key.
              </div>
            </button>
          </div>
        </div>

        {/* Temperatura */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5 flex items-center justify-between">
            <span>Temperatura</span>
            <span className="text-fg-muted font-mono">{temperature.toFixed(2)}</span>
          </label>
          <input
            type="range"
            min={0}
            max={2}
            step={0.1}
            value={temperature}
            onChange={(e) => setTemperature(parseFloat(e.target.value))}
            className="w-full"
          />
          <div className="text-[11px] text-fg-subtle mt-1">
            0 = respuestas estrictas / 2 = creativas. Solo se aplica a OpenAI.
          </div>
        </div>

        {/* Bloque OpenAI — solo visible si el proveedor activo es openai */}
        {provider === 'openai' && (
          <div className="space-y-3 border-l-2 border-accent/40 pl-3 ml-1">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5 block">
                OpenAI API Key
              </label>
              <div className="flex gap-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder={
                    data?.openaiConfigured
                      ? '(ya hay una clave guardada — escribe para reemplazarla)'
                      : 'sk-...'
                  }
                  className="flex-1 bg-bg-subtle/60 border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-border-strong"
                />
                <Button variant="ghost" onClick={() => setShowKey(!showKey)}>
                  {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                </Button>
              </div>
              <div className="text-[11px] text-fg-subtle mt-1">
                Sácala en{' '}
                <code className="text-fg-muted">platform.openai.com/api-keys</code>. La clave se guarda en la base de datos del backend, no se devuelve por la API.
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5 block">
                Base URL (cambia solo si usas un proveedor compatible)
              </label>
              <input
                value={openaiBaseUrl}
                onChange={(e) => setOpenaiBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full bg-bg-subtle/60 border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-border-strong"
              />
              <div className="text-[11px] text-fg-subtle mt-1">
                Funcionan también: OpenRouter (<code>https://openrouter.ai/api/v1</code>), Groq, Together AI, etc.
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase tracking-wider text-fg-subtle mb-1.5 block">
                Modelo OpenAI
              </label>
              <input
                value={openaiModel}
                onChange={(e) => setOpenaiModel(e.target.value)}
                placeholder={data?.provider === 'openai' ? data?.model || 'gpt-4o-mini' : 'gpt-4o-mini'}
                className="w-full bg-bg-subtle/60 border border-border rounded-md px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-border-strong"
              />
              <div className="text-[11px] text-fg-subtle mt-1">
                Ejemplos: <code>gpt-4o-mini</code>, <code>gpt-4o</code>, <code>gpt-3.5-turbo</code>.
              </div>
            </div>

            <div className="flex justify-between items-center pt-1">
              <Button
                variant="outline"
                onClick={() => testOpenAi.mutate()}
                disabled={testOpenAi.isPending}
              >
                <RefreshCw size={12} className={testOpenAi.isPending ? 'animate-spin' : ''} />
                Probar conexión OpenAI
              </Button>
            </div>
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button
            variant="primary"
            onClick={() => save.mutate()}
            disabled={save.isPending}
          >
            <Save size={12} /> Guardar
          </Button>
        </div>

        {isLoading && <Skeleton className="h-4 w-32" />}
      </div>
    </Card>
  );
}

/**
 * Sección "Prompts personalizados" — permite al usuario sobrescribir
 * el prompt que usa la IA para organizar notas y para parsear
 * recordatorios. Si los campos están vacíos, se usan los defaults
 * (que ya tocan poco el contenido original).
 */
export function CustomPromptsSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['prompts'],
    queryFn: apiClient.getPrompts,
  });

  const [notes, setNotes] = useState('');
  const [reminders, setReminders] = useState('');
  const [aiFallback, setAiFallback] = useState(true);

  useEffect(() => {
    if (data) {
      setNotes(data.notes || '');
      setReminders(data.reminders || '');
      setAiFallback(!!data.remindersAiFallback);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      apiClient.savePrompts({
        notes,
        reminders,
        remindersAiFallback: aiFallback,
      }),
    onSuccess: () => {
      toast.success('Prompts guardados');
      qc.invalidateQueries({ queryKey: ['prompts'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <FileEdit size={13} /> Prompts personalizados (IA)
        </span>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] uppercase tracking-wider text-fg-subtle">
              Prompt para organizar notas
            </label>
            {data?.notes && (
              <button
                onClick={() => setNotes('')}
                className="text-[10px] text-fg-muted hover:text-fg underline"
              >
                Usar prompt por defecto
              </button>
            )}
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={
              data?.defaults?.notes ||
              'Vacío = se usa el prompt por defecto (corrección suave, sin reinterpretar).'
            }
            rows={6}
            className="w-full bg-bg-subtle/60 border border-border rounded-md p-3 text-sm font-mono focus:outline-none focus:border-border-strong"
          />
          <div className="text-[11px] text-fg-subtle mt-1">
            Vacío = corrección ortográfica + formato suave, sin reinterpretar el contenido.
            Si lo personalizas, recuerda decirle al modelo que use negritas WhatsApp con <code>*así*</code>, no Markdown.
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] uppercase tracking-wider text-fg-subtle">
              Prompt para entender recordatorios en lenguaje natural
            </label>
            {data?.reminders && (
              <button
                onClick={() => setReminders('')}
                className="text-[10px] text-fg-muted hover:text-fg underline"
              >
                Usar prompt por defecto
              </button>
            )}
          </div>
          <textarea
            value={reminders}
            onChange={(e) => setReminders(e.target.value)}
            placeholder={
              data?.defaults?.reminders ||
              'Vacío = prompt por defecto. Solo se usa como fallback cuando el parser estándar no entiende la frase.'
            }
            rows={6}
            className="w-full bg-bg-subtle/60 border border-border rounded-md p-3 text-sm font-mono focus:outline-none focus:border-border-strong"
          />
          <div className="text-[11px] text-fg-subtle mt-1">
            Este prompt SOLO se usa cuando el parser estándar (regex) no entiende la frase.
            El modelo debe devolver JSON <code>{'{ text, when, type }'}</code>.
          </div>
        </div>

        <button
          onClick={() => setAiFallback(!aiFallback)}
          className={cn(
            'w-full p-3 rounded-md border-2 transition-colors flex items-center justify-between',
            aiFallback
              ? 'border-accent bg-accent/10'
              : 'border-border bg-bg-subtle/40',
          )}
        >
          <div className="text-left">
            <div className="text-sm font-medium">
              Fallback IA para recordatorios
            </div>
            <div className="text-[11px] text-fg-muted mt-0.5">
              {aiFallback
                ? 'Activo — frases como "mañana a las 7 avísame del médico" sí funcionarán.'
                : 'Desactivado — solo se aceptan los formatos del parser estándar.'}
            </div>
          </div>
          <div
            className={cn(
              'w-10 h-5 rounded-full relative transition-colors',
              aiFallback ? 'bg-accent' : 'bg-bg-elevated border border-border',
            )}
          >
            <div
              className={cn(
                'w-4 h-4 rounded-full bg-bg-card absolute top-0.5 transition-transform',
                aiFallback ? 'translate-x-5' : 'translate-x-0.5',
              )}
            />
          </div>
        </button>

        <div className="flex justify-end">
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save size={12} /> Guardar prompts
          </Button>
        </div>

        {isLoading && <Skeleton className="h-4 w-32" />}
      </div>
    </Card>
  );
}

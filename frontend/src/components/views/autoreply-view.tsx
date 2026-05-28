'use client';
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/loading';
import { motion } from 'framer-motion';
import { Save, Sparkles, Plus, X, Wand2, User, Stethoscope, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/**
 * Normalización en el cliente · espejo de `normalizeChatId` del backend.
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
  // Cargamos también el modo del bot y el teléfono propio para avisar al usuario
  // si el modo actual hace que Auto-IA no funcione o si añadió el propio bot.
  const { data: modeData } = useQuery({
    queryKey: ['botMode'],
    queryFn: apiClient.getBotMode,
  });
  const { data: allowedData } = useQuery({
    queryKey: ['allowedChats'],
    queryFn: apiClient.getAllowedChats,
  });
  const botPhone = allowedData?.botPhone || '';
  const botChatId = botPhone ? `${botPhone.replace(/\D/g, '')}@c.us` : '';
  const mode = (modeData as any)?.mode || '';
  const modeBlocksAll = mode === 'silent' || mode === 'maintenance';

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

  const botInList = !!botChatId && chatIds.includes(botChatId);

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
              'text-2xs uppercase tracking-wider px-2 py-0.5 rounded-full',
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

            {/* Avisos de configuración que pueden bloquear Auto-IA */}
            {enabled && modeBlocksAll && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-warning/40 bg-warning/10 text-warning text-xs">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div>
                  El modo del bot es <strong className="uppercase">{mode}</strong>.
                  Auto-IA <strong>no funcionará</strong> mientras el bot esté en este
                  modo · silent y maintenance bloquean cualquier respuesta. Cámbialo
                  a <code>private</code>, <code>ai</code> o <code>manual</code> en
                  Ajustes → Modo.
                </div>
              </div>
            )}
            {enabled && botInList && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-warning/40 bg-warning/10 text-warning text-xs">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div>
                  Tienes el <strong>propio número del bot</strong>{' '}
                  (<code>{botChatId}</code>) en la lista. El bot ignora sus propios
                  mensajes para evitar bucles, así que ese número NUNCA recibirá
                  respuesta. Quítalo de la lista.
                </div>
              </div>
            )}
            {enabled && chatIds.length === 0 && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-warning/40 bg-warning/10 text-warning text-xs">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div>
                  Toggle activo pero la lista está vacía. Añade abajo los números a
                  los que quieres que el bot responda automáticamente con Ollama.
                </div>
              </div>
            )}

            {/* Lista de números */}
            <div>
              <label className="text-2xs uppercase tracking-wider text-fg-subtle mb-1.5 block">
                Números autorizados ({chatIds.length})
              </label>
              <div className="space-y-1.5 mb-2">
                {chatIds.length === 0 ? (
                  <div className="text-xs text-fg-muted bg-bg-subtle/40 border border-border rounded-md px-3 py-2">
                    Sin números · añade al menos uno para que Auto-IA funcione.
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
                  className="flex-1 input-base font-mono"
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
                Pega los números en cualquier formato · el sistema los convierte automáticamente.
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

      <AutoReplyDiagnoseSection botChatId={botChatId} />

      <AutoReplyPromptSection />

      <Card title="¿Cómo funciona?">
        <ol className="text-sm text-fg-muted space-y-2 list-decimal list-inside leading-relaxed">
          <li>Un contacto de la lista te escribe al WhatsApp del bot.</li>
          <li>El backend detecta que es uno de esos números y activa modo IA <strong>siempre</strong>.</li>
          <li>El mensaje va a Ollama (modelo activo) con el system prompt configurado.</li>
          <li>Ollama responde y el bot envía la respuesta por WhatsApp.</li>
          <li>Sin comandos · todo automático mientras el toggle esté ON.</li>
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

/**
 * Configuración del prompt + persona usados por Auto-IA cuando responde
 * a contactos autorizados. El prompt define el COMPORTAMIENTO (tono,
 * abreviaturas), la persona da CONTEXTO PERSONAL (forma de hablar,
 * gustos, datos relevantes).
 */
function AutoReplyPromptSection() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['autoReplyPrompt'],
    queryFn: apiClient.getAutoReplyPrompt,
  });

  const [prompt, setPrompt] = useState('');
  const [persona, setPersona] = useState('');

  useEffect(() => {
    if (data) {
      setPrompt(data.prompt || '');
      setPersona(data.persona || '');
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiClient.saveAutoReplyPrompt({ prompt, persona }),
    onSuccess: () => {
      toast.success('Prompt y persona de Auto-IA guardados');
      qc.invalidateQueries({ queryKey: ['autoReplyPrompt'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message || e.message),
  });

  const isCustomPrompt = !!prompt.trim();

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Wand2 size={13} /> Cómo debe responder Auto-IA
          {isCustomPrompt && (
            <span className="text-2xs uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded">
              personalizado
            </span>
          )}
        </span>
      }
    >
      <div className="space-y-5">
        {/* Persona del usuario */}
        <div>
          <label className="text-2xs uppercase tracking-wider text-fg-subtle mb-1.5 flex items-center gap-1.5">
            <User size={11} /> Sobre ti · info para que la IA responda como tú
          </label>
          <textarea
            value={persona}
            onChange={(e) => setPersona(e.target.value)}
            rows={5}
            placeholder={`Ej:\nMe llamo Carlos. Trabajo en informática. Vivo en Madrid.\nHablo en plan corto, uso "q" en vez de "que", "x" por "por", "tb" por "también".\nNo uso mayúsculas en frases normales.\nMi novia se llama Florence. Tengo un proyecto con un servidor llamado Local AI Hub.\nSi me preguntan algo personal, contesta como si fuera yo, sin inventar datos.`}
            className="w-full input-base font-mono"
          />
          <div className="text-[11px] text-fg-subtle mt-1">
            Toda la información que pongas aquí se inyecta en cada respuesta de Auto-IA
            para que la IA hable contigo encima y sepa quién eres. Cuanta más info útil,
            mejor responde por ti.
          </div>
        </div>

        {/* Prompt de comportamiento */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-2xs uppercase tracking-wider text-fg-subtle">
              Prompt de comportamiento (avanzado, opcional)
            </label>
            {isCustomPrompt && (
              <button
                onClick={() => setPrompt('')}
                className="text-2xs text-fg-muted hover:text-fg underline"
              >
                Volver al prompt por defecto
              </button>
            )}
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={6}
            placeholder={data?.default || 'Vacío = se usa el prompt por defecto'}
            className="w-full input-base font-mono"
          />
          <div className="text-[11px] text-fg-subtle mt-1">
            Vacío = se usa el prompt por defecto (tono natural, frases cortas, sin saludo).
            Si lo personalizas, recuerda que la "info sobre ti" se añade automáticamente debajo.
          </div>
          {data?.default && !isCustomPrompt && (
            <button
              onClick={() => setPrompt(data.default)}
              className="text-[11px] text-accent hover:underline mt-1"
            >
              Cargar prompt por defecto en el editor para modificarlo
            </button>
          )}
        </div>

        <div className="flex justify-end">
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
            <Save size={12} /> Guardar prompt + persona
          </Button>
        </div>

        {isLoading && <Skeleton className="h-4 w-32" />}
      </div>
    </Card>
  );
}

/**
 * Bloque de diagnóstico · escribe un número y dime EXACTAMENTE qué pasaría
 * si ese contacto escribiera al bot. Llama a `/settings/auto-reply/diagnose`
 * y pinta el resultado de forma legible. Es la forma rápida de saber por qué
 * "no me responde a X" sin tener que mirar logs.
 */
function AutoReplyDiagnoseSection({ botChatId }: { botChatId: string }) {
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof apiClient.diagnoseAutoReply>
  > | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!draft.trim()) {
      toast.error('Escribe un número primero.');
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await apiClient.diagnoseAutoReply(draft.trim());
      setResult(r);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Stethoscope size={13} /> Probar un número
        </span>
      }
    >
      <div className="space-y-3">
        <div className="text-xs text-fg-muted leading-relaxed">
          Si Auto-IA no responde a alguien, pega aquí su número y te digo
          exactamente por qué (modo bot, normalización, listas, etc).
        </div>
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder="612345678 · +34612345678 · 34 612 345 678"
            className="flex-1 input-base font-mono"
          />
          <Button variant="outline" onClick={run} disabled={busy || !draft.trim()}>
            <Stethoscope size={12} /> Diagnosticar
          </Button>
        </div>
        {result && (
          <div
            className={cn(
              'rounded-md border p-3 text-xs space-y-2',
              result.willReply
                ? 'border-accent/40 bg-accent/10'
                : 'border-warning/40 bg-warning/10',
            )}
          >
            <div className="flex items-start gap-2">
              {result.willReply ? (
                <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-accent" />
              ) : (
                <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
              )}
              <div>
                <div className="font-medium text-fg">
                  {result.willReply
                    ? result.willUseAutoIaPrompt
                      ? 'Sí responderá · con prompt + persona de Auto-IA'
                      : 'Sí responderá · pero con system prompt genérico'
                    : 'NO responderá'}
                </div>
                <div className="text-fg-muted mt-1">{result.reason}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono pt-2 border-t border-border">
              <div className="text-fg-subtle">input</div>
              <div className="text-fg">{result.input}</div>
              <div className="text-fg-subtle">normalizado</div>
              <div className="text-fg">{result.normalized || '(no válido)'}</div>
              <div className="text-fg-subtle">modo bot</div>
              <div className="text-fg uppercase">{result.mode}</div>
              <div className="text-fg-subtle">Auto-IA toggle</div>
              <div className={result.autoReplyEnabled ? 'text-accent' : 'text-warning'}>
                {result.autoReplyEnabled ? 'ON' : 'OFF'} ({result.autoReplyListSize}{' '}
                números)
              </div>
              <div className="text-fg-subtle">en lista Auto-IA</div>
              <div className={result.isAutoTarget ? 'text-accent' : 'text-fg-muted'}>
                {result.isAutoTarget ? 'sí' : 'no'}
              </div>
              <div className="text-fg-subtle">en whitelist</div>
              <div className={result.isInWhitelist ? 'text-accent' : 'text-fg-muted'}>
                {result.isInWhitelist ? 'sí' : 'no'}
              </div>
              <div className="text-fg-subtle">es admin</div>
              <div className={result.isAdmin ? 'text-accent' : 'text-fg-muted'}>
                {result.isAdmin ? 'sí' : 'no'}
              </div>
              {botChatId && (
                <>
                  <div className="text-fg-subtle">chatId del bot</div>
                  <div className="text-fg-muted">{botChatId}</div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

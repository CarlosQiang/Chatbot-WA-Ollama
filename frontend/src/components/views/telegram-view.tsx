'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Skeleton } from '@/components/ui/loading';
import { motion } from 'framer-motion';
import { Send } from 'lucide-react';

export function TelegramView() {
  const { data, isLoading } = useQuery({
    queryKey: ['telegramStatus'],
    queryFn: apiClient.telegramStatus,
    refetchInterval: 15_000,
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-4"
    >
      <Card title="Bot de Telegram" action={<StatusBadge ok={data?.enabled && data?.bot != null} />}>
        {isLoading ? (
          <Skeleton className="h-20" />
        ) : !data?.enabled ? (
          <div className="text-sm text-fg-muted">
            Telegram desactivado. Configura <code className="text-fg">TELEGRAM_BOT_TOKEN</code> y{' '}
            <code className="text-fg">TELEGRAM_ALLOWED_USER_IDS</code> en el <code>.env</code> y reinicia el backend.
          </div>
        ) : data?.bot ? (
          <div className="space-y-2 text-sm">
            <Row label="Bot" value={<span className="font-mono">@{data.bot.username}</span>} />
            <Row label="Nombre" value={data.bot.name} />
            <Row label="ID" value={<span className="font-mono">{data.bot.id}</span>} />
            <div className="mt-4 p-3 bg-bg-subtle/40 border border-border rounded-md text-xs space-y-2">
              <div className="font-medium text-fg">📲 Cómo usarlo:</div>
              <div className="text-fg-muted">
                1. Abre Telegram → busca <code className="text-fg">@{data.bot.username}</code>
              </div>
              <div className="text-fg-muted">
                2. Envíale <code className="text-fg">/start</code> o <code className="text-fg">/ayuda</code>
              </div>
              <div className="text-fg-muted">
                3. Cualquier texto → Ollama te responde. Comandos: <code>/wa</code>, <code>/recordar</code>, <code>/modelos</code>...
              </div>
            </div>
          </div>
        ) : (
          <div className="text-sm text-danger">
            ❌ {data?.error || 'No se pudo conectar con la API de Telegram.'}
          </div>
        )}
      </Card>

      <Card title="Comandos disponibles">
        <ul className="text-xs font-mono space-y-1.5 text-fg-muted">
          <li><span className="text-accent">/ai</span> &lt;texto&gt; — habla con Ollama</li>
          <li><span className="text-accent">/wa</span> &lt;texto&gt; — enviar a WhatsApp</li>
          <li><span className="text-accent">/aiwa</span> &lt;texto&gt; — IA responde y reenvía al WhatsApp</li>
          <li><span className="text-accent">/recordar</span> HH:MM &lt;texto&gt;</li>
          <li><span className="text-accent">/recordar</span> +30m &lt;texto&gt;</li>
          <li><span className="text-accent">/recordar</span> diario HH:MM &lt;texto&gt;</li>
          <li><span className="text-accent">/recordar</span> wa HH:MM &lt;texto&gt; — envía a WhatsApp</li>
          <li><span className="text-accent">/recordatorios</span> — lista activos</li>
          <li><span className="text-accent">/borrar</span> &lt;id&gt;</li>
          <li><span className="text-accent">/estado /modelos /modelo /ping /quien /ayuda</span></li>
        </ul>
      </Card>
    </motion.div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[10px] uppercase tracking-wider text-fg-subtle">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

'use client';
import { Card } from '@/components/ui/card';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { toast } from 'sonner';
import { Copy, Sparkles, Terminal, Bell, Shield, Code, Wrench } from 'lucide-react';

type Cmd = { cmd: string; desc: string; example?: string; args?: string };

const IA: Cmd[] = [
  { cmd: '<texto>', desc: 'Cualquier mensaje sin / va directo a Ollama', example: 'Hola, cuéntame un chiste' },
  { cmd: '/ai', args: '<texto>', desc: 'Chat IA explícito', example: '/ai Explica TCP/IP en 3 líneas' },
  { cmd: '/codigo', args: '<lang> <desc>', desc: 'Genera código', example: '/codigo python función que invierte una lista' },
  { cmd: '/explica', args: '<texto>', desc: 'Explica concepto/código', example: '/explica qué hace map() en JS' },
  { cmd: '/sec', args: '<descripción>', desc: 'Análisis de seguridad (OWASP/CIS)', example: '/sec login con MD5 y sin rate limit' },
  { cmd: '/regexgen', args: '<descripción>', desc: 'Genera regex', example: '/regexgen IPv4 válido' },
  { cmd: '/sqlgen', args: '<descripción>', desc: 'Genera SQL', example: '/sqlgen usuarios activos del último mes' },
  { cmd: '/modelos', desc: 'Lista modelos Ollama' },
  { cmd: '/modelo', args: '<nombre>', desc: 'Cambia modelo activo' },
];

const WA: Cmd[] = [
  { cmd: '/wa', args: '<texto>', desc: 'Envía al WhatsApp por defecto', example: '/wa Hola desde Telegram' },
  { cmd: '/wa', args: '<34xxx@c.us> <texto>', desc: 'A un número específico' },
  { cmd: '/aiwa', args: '<texto>', desc: 'IA responde + reenvía a WhatsApp' },
];

const REM: Cmd[] = [
  { cmd: '/recordar', args: 'HH:MM <texto>', desc: 'Hoy si no ha pasado, mañana si sí', example: '/recordar 15:30 Comprar pan' },
  { cmd: '/recordar', args: 'hoy HH:MM <texto>', desc: 'Forzar hoy', example: '/recordar hoy 23:30 Cerrar puerta' },
  { cmd: '/recordar', args: 'mañana HH:MM <texto>', desc: 'Mañana', example: '/recordar mañana 09:00 Reunión' },
  { cmd: '/recordar', args: 'lunes HH:MM <texto>', desc: 'Próximo lunes (todos los días)', example: '/recordar viernes 18:00 Cerveza' },
  { cmd: '/recordar', args: 'DD/MM/YYYY HH:MM <texto>', desc: 'Fecha exacta', example: '/recordar 25/12/2026 09:00 Felicitar' },
  { cmd: '/recordar', args: '+30m <texto>', desc: 'Relativo (m/h/d)', example: '/recordar +2h Sacar bizcocho' },
  { cmd: '/recordar', args: 'diario HH:MM <texto>', desc: 'Todos los días', example: '/recordar diario 09:00 Pastilla' },
  { cmd: '/recordar', args: 'semanal lunes HH:MM <texto>', desc: 'Todos los lunes', example: '/recordar semanal lunes 08:00 Basura' },
  { cmd: '/recordar', args: 'wa HH:MM <texto>', desc: 'Envía al WhatsApp en vez de Telegram' },
  { cmd: '/recordatorios', desc: 'Lista activos' },
  { cmd: '/borrar', args: '<id>', desc: 'Borrar (6 primeros chars del id)' },
];

const DEV: Cmd[] = [
  { cmd: '/hash', args: '<algo> <texto>', desc: 'md5/sha1/sha256/sha512', example: '/hash sha256 hola' },
  { cmd: '/hashes', args: '<texto>', desc: 'Todos los hashes a la vez' },
  { cmd: '/b64', args: 'enc|dec <texto>', desc: 'Base64', example: '/b64 enc hola mundo' },
  { cmd: '/url', args: 'enc|dec <texto>', desc: 'URL encode/decode' },
  { cmd: '/jwt', args: '<token>', desc: 'Decodifica payload JWT (sin verificar)' },
  { cmd: '/uuid', desc: 'Genera UUID v4' },
  { cmd: '/pass', args: '[length]', desc: 'Password seguro (default 16)', example: '/pass 24' },
  { cmd: '/timestamp', args: '[unix|iso]', desc: 'Convierte timestamps', example: '/timestamp 1735689600' },
  { cmd: '/regex', args: '<patrón> <texto>', desc: 'Test regex', example: '/regex \\d+ abc123def456' },
];

const SEC: Cmd[] = [
  { cmd: '/dns', args: '<dominio>', desc: 'A/AAAA/MX/NS/TXT', example: '/dns google.com' },
  { cmd: '/headers', args: '<url>', desc: 'HTTP headers', example: '/headers https://example.com' },
  { cmd: '/ssl', args: '<dominio>', desc: 'Info certificado SSL/TLS', example: '/ssl github.com' },
  { cmd: '/cve', args: '<CVE-XXXX-YYYY>', desc: 'Info de CVE desde NVD', example: '/cve CVE-2024-3094' },
];

const SYS: Cmd[] = [
  { cmd: '/ping', desc: 'pong' },
  { cmd: '/estado', desc: 'Estado backend/openwa/ollama' },
  { cmd: '/ayuda', desc: 'Ayuda completa' },
  { cmd: '/quien', desc: 'Tu user id Telegram' },
];

export function CommandsView() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="space-y-4"
    >
      <Card title="Funcionan en Telegram y WhatsApp">
        <div className="text-sm text-fg-muted space-y-2 leading-relaxed">
          <p>
            Envía estos comandos a <strong>@Checklistqiangnet_bot</strong> (Telegram) o al número del bot de
            WhatsApp. Cualquier mensaje sin <code className="text-fg">/</code> se envía como chat a Ollama.
          </p>
          <p className="text-xs text-fg-subtle">
            Click en cualquier comando para copiarlo.
          </p>
        </div>
      </Card>

      <Section title="IA & Generación" icon={<Sparkles size={13} />} list={IA} />
      <Section title="WhatsApp desde Telegram" icon={<Terminal size={13} />} list={WA} />
      <Section title="Recordatorios" icon={<Bell size={13} />} list={REM} />
      <Section title="DevTools" icon={<Wrench size={13} />} list={DEV} />
      <Section title="Ciberseguridad" icon={<Shield size={13} />} list={SEC} />
      <Section title="Sistema" icon={<Code size={13} />} list={SYS} />
    </motion.div>
  );
}

function Section({ title, icon, list }: { title: string; icon: React.ReactNode; list: Cmd[] }) {
  return (
    <Card title={<span className="flex items-center gap-2">{icon} {title}</span>}>
      <div className="divide-y divide-border -m-4">
        {list.map((c, i) => <Row key={`${c.cmd}-${i}`} cmd={c} />)}
      </div>
    </Card>
  );
}

function Row({ cmd }: { cmd: Cmd }) {
  const [copied, setCopied] = useState(false);
  const display = cmd.args ? `${cmd.cmd} ${cmd.args}` : cmd.cmd;
  const copy = () => {
    navigator.clipboard.writeText(cmd.example || display);
    setCopied(true);
    toast.success(`Copiado: ${cmd.example || display}`, { duration: 1500 });
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="w-full text-left px-4 py-3 flex items-start justify-between gap-3 hover:bg-bg-subtle/40 transition-colors group"
    >
      <div className="min-w-0 flex-1">
        <div className="font-mono text-sm">
          <span className="text-accent">{cmd.cmd}</span>
          {cmd.args && <span className="text-fg-subtle"> {cmd.args}</span>}
        </div>
        <div className="text-xs text-fg-muted mt-0.5">{cmd.desc}</div>
        {cmd.example && (
          <div className="text-[11px] font-mono text-fg-subtle mt-1">↪ {cmd.example}</div>
        )}
      </div>
      <Copy
        size={13}
        className={`shrink-0 mt-1 transition-colors ${copied ? 'text-accent' : 'text-fg-subtle group-hover:text-fg-muted'}`}
      />
    </button>
  );
}

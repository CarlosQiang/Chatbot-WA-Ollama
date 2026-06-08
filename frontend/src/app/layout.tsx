import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: {
    default: 'Local AI Hub',
    template: '%s · Local AI Hub',
  },
  description: 'WhatsApp ↔ Ollama local hub · panel de control',
  applicationName: 'Local AI Hub',
  robots: { index: false, follow: false },
  formatDetection: { telephone: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

// Script anti-FOUC inline — evita flash de tema incorrecto en el primer render.
// Inlineado directamente (sin import) para máxima compatibilidad con Next.js App Router.
// Se ejecuta síncronamente al inicio del <body>, antes del primer paint.
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-fg antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

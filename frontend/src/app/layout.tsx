import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { ANTI_FOUC_SCRIPT } from '@/lib/theme-script';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen bg-bg text-fg antialiased">
        {/*
          Script inline anti-FOUC: va en <body> (antes de Providers) porque
          Next.js App Router gestiona <head> internamente y no acepta <head>
          manual en el layout. El script se ejecuta síncronamente antes del
          primer paint gracias a su posición al inicio del body.
        */}
        <script dangerouslySetInnerHTML={{ __html: ANTI_FOUC_SCRIPT }} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

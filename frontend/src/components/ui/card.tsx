import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

/**
 * Card — superficie elevada base del design system.
 *
 * Props:
 *  - interactive: hover border + cursor pointer (solo para cards clicables)
 *  - noPadding:   sin padding interno (para contenido full-bleed como listas)
 *  - ghost:       sin borde ni fondo (contenido embebido en otro contenedor)
 */
export function Card({
  children,
  className,
  title,
  action,
  interactive = false,
  noPadding = false,
  ghost = false,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
  interactive?: boolean;
  noPadding?: boolean;
  ghost?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-xl',
        !ghost && 'border border-border bg-bg-card shadow-card',
        'transition-all duration-180 motion-reduce:transition-none',
        interactive && 'hover:border-border-strong hover:shadow-card-hover cursor-pointer',
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-border px-4 py-3 gap-3">
          <div className="text-sm font-medium text-fg leading-none">{title}</div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={noPadding ? '' : 'p-4'}>{children}</div>
    </div>
  );
}

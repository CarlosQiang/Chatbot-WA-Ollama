import { cn } from '@/lib/utils';

/** Skeleton con shimmer gradient — más premium que animate-pulse */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-md', className)}
      aria-hidden="true"
    />
  );
}

/** Grupo de skeletons con aria-busy para screen readers */
export function SkeletonGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-busy="true" aria-label="Cargando..." className={className}>
      {children}
    </div>
  );
}

/** Spinner minimal de una línea */
export function Spinner({ className, size = 'sm' }: { className?: string; size?: 'xs' | 'sm' | 'md' }) {
  const sz = size === 'xs' ? 'h-2.5 w-2.5' : size === 'md' ? 'h-4 w-4' : 'h-3 w-3';
  return (
    <div
      aria-hidden="true"
      className={cn(
        'inline-block rounded-full border-2 border-fg-subtle/30 border-t-fg-muted animate-spin-slow',
        sz,
        className,
      )}
    />
  );
}

/** Indicador "IA pensando" — tres puntos animados */
export function ThinkingDots({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1', className)} aria-label="Procesando...">
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <span className="thinking-dot" />
    </span>
  );
}

/** Loading overlay para reemplazar contenido mientras carga */
export function LoadingRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-8', className)}>
      <Spinner size="md" />
    </div>
  );
}

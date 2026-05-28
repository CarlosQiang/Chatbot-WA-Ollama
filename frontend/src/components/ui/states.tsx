'use client';
import { cn } from '@/lib/utils';
import { AlertCircle, Inbox, RefreshCw } from 'lucide-react';
import { ReactNode } from 'react';
import { Button } from './button';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  /** Versión más pequeña para listas embebidas */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-4',
        compact ? 'py-6' : 'py-12',
        className,
      )}
    >
      {/* Icono con halo sutil */}
      <div
        className={cn(
          'flex items-center justify-center rounded-xl bg-bg-subtle border border-border mb-4',
          compact ? 'h-9 w-9' : 'h-12 w-12',
        )}
        aria-hidden="true"
      >
        <span className="text-fg-subtle">
          {icon ?? <Inbox size={compact ? 16 : 20} strokeWidth={1.5} />}
        </span>
      </div>
      <div className={cn('font-medium text-fg', compact ? 'text-xs' : 'text-sm')}>{title}</div>
      {description && (
        <div className={cn('mt-1.5 max-w-xs leading-relaxed text-fg-muted', compact ? 'text-xs' : 'text-xs')}>
          {description}
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Algo salió mal',
  description,
  onRetry,
  className,
  compact = false,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-4',
        compact ? 'py-6' : 'py-12',
        className,
      )}
      role="alert"
    >
      <div
        className={cn(
          'flex items-center justify-center rounded-xl bg-danger/8 border border-danger/20 mb-4',
          compact ? 'h-9 w-9' : 'h-12 w-12',
        )}
        aria-hidden="true"
      >
        <AlertCircle size={compact ? 16 : 20} strokeWidth={1.5} className="text-danger" />
      </div>
      <div className={cn('font-medium text-fg', compact ? 'text-xs' : 'text-sm')}>{title}</div>
      {description && (
        <div className={cn('mt-1.5 max-w-xs leading-relaxed text-fg-muted', compact ? 'text-xs' : 'text-xs')}>
          {description}
        </div>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={onRetry}>
          <RefreshCw size={11} />
          Reintentar
        </Button>
      )}
    </div>
  );
}

/** Inline error chip — para errores dentro de formularios o filas */
export function InlineError({ message, className }: { message: string; className?: string }) {
  return (
    <span
      role="alert"
      className={cn('inline-flex items-center gap-1 text-xs text-danger', className)}
    >
      <AlertCircle size={11} aria-hidden="true" />
      {message}
    </span>
  );
}

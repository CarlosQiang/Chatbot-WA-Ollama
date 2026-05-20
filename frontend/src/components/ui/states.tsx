'use client';
import { cn } from '@/lib/utils';
import { AlertCircle, Inbox } from 'lucide-react';
import { ReactNode } from 'react';
import { Button } from './button';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-10 px-4 text-fg-muted',
        className,
      )}
    >
      <div className="mb-3 text-fg-subtle">{icon ?? <Inbox size={22} strokeWidth={1.5} />}</div>
      <div className="text-sm font-medium text-fg">{title}</div>
      {description && (
        <div className="mt-1 text-xs max-w-xs leading-relaxed">{description}</div>
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
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center py-10 px-4 text-fg-muted',
        className,
      )}
    >
      <div className="mb-3 text-danger">
        <AlertCircle size={22} strokeWidth={1.5} />
      </div>
      <div className="text-sm font-medium text-fg">{title}</div>
      {description && (
        <div className="mt-1 text-xs max-w-xs leading-relaxed">{description}</div>
      )}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

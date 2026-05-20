import { cn } from '@/lib/utils';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded-md bg-bg-subtle', className)} />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'inline-block h-3 w-3 animate-spin rounded-full border-2 border-fg-subtle border-t-fg',
        className,
      )}
    />
  );
}

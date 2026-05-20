import { cn } from '@/lib/utils';
import { ReactNode } from 'react';

export function Card({
  children,
  className,
  title,
  action,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-bg-card/60 backdrop-blur-sm',
        'transition-colors hover:border-border-strong',
        className,
      )}
    >
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="text-sm font-medium text-fg">{title}</div>
          <div>{action}</div>
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}

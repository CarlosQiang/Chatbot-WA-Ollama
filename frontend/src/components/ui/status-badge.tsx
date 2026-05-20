'use client';
import { cn } from '@/lib/utils';

type Props = {
  ok?: boolean | null;
  label?: string;
  className?: string;
};

export function StatusBadge({ ok, label, className }: Props) {
  const state = ok === true ? 'ok' : ok === false ? 'err' : 'idle';
  const text = label ?? (ok === true ? 'Operativo' : ok === false ? 'Caído' : '—');
  return (
    <span className={cn('inline-flex items-center gap-2 text-xs text-fg-muted', className)}>
      <span className={cn('status-dot', state)} />
      {text}
    </span>
  );
}

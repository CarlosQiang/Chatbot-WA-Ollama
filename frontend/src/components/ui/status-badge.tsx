'use client';
import { cn } from '@/lib/utils';

type Props = {
  ok?: boolean | null;
  label?: string;
  className?: string;
  /** Muestra solo el dot sin texto (para móvil / topbar compacto) */
  dotOnly?: boolean;
};

export function StatusBadge({ ok, label, className, dotOnly = false }: Props) {
  const state = ok === true ? 'ok' : ok === false ? 'err' : 'idle';
  const text = label ?? (ok === true ? 'Operativo' : ok === false ? 'Caído' : '·');
  const labelColor =
    ok === true ? 'text-fg-muted' : ok === false ? 'text-danger/80' : 'text-fg-subtle';

  return (
    <span
      className={cn('inline-flex items-center gap-1.5', className)}
      aria-label={`${text}: ${ok === true ? 'operativo' : ok === false ? 'caído' : 'desconocido'}`}
    >
      <span className={cn('status-dot', state)} aria-hidden="true" />
      {!dotOnly && (
        <span className={cn('text-xs font-medium tabular-nums', labelColor)}>{text}</span>
      )}
    </span>
  );
}

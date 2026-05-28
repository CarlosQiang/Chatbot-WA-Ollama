import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';
import { Spinner } from './loading';

type Variant = 'primary' | 'ghost' | 'danger' | 'outline' | 'accent-outline';
type Size = 'xs' | 'sm' | 'md';

const variants: Record<Variant, string> = {
  // Primario: accent verde — semánticamente correcto, visualmente destacado
  primary:
    'bg-accent text-bg font-semibold hover:bg-accent/90 shadow-glow-sm hover:shadow-glow-accent',
  ghost:
    'text-fg-muted hover:text-fg hover:bg-bg-subtle',
  danger:
    'bg-danger/10 text-danger hover:bg-danger/20 border border-danger/20 hover:border-danger/40',
  outline:
    'border border-border text-fg-muted hover:text-fg hover:border-border-strong hover:bg-bg-subtle',
  'accent-outline':
    'border border-accent/30 text-accent hover:bg-accent/10 hover:border-accent/50',
};

const sizes: Record<Size, string> = {
  xs: 'h-6 px-2 text-2xs rounded',
  sm: 'h-7 px-2.5 text-xs rounded-md',
  md: 'h-8 px-3.5 text-sm rounded-md',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = 'outline', size = 'md', loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-medium whitespace-nowrap',
        'transition-all duration-180 motion-reduce:transition-none',
        'focus:outline-none focus-visible:outline-none',
        'focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:opacity-40 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="shrink-0" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

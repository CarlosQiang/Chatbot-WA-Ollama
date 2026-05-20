import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, forwardRef } from 'react';

type Variant = 'primary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-fg text-bg hover:bg-fg/90',
  ghost: 'text-fg-muted hover:text-fg hover:bg-bg-subtle',
  danger: 'bg-danger/10 text-danger hover:bg-danger/20 border border-danger/30',
  outline: 'border border-border text-fg hover:border-border-strong hover:bg-bg-subtle',
};

const sizes: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-xs rounded-md',
  md: 'h-9 px-3.5 text-sm rounded-md',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = 'outline', size = 'md', ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-medium transition-all duration-150',
        'disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

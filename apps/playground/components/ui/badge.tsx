import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', {
  variants: {
    tone: {
      neutral: 'border-line bg-surface-muted text-ink-muted',
      cobalt: 'border-cobalt/20 bg-cobalt-soft text-cobalt-dark',
      ok: 'border-ok/20 bg-ok-soft text-ok',
      warn: 'border-warn/20 bg-warn-soft text-warn',
      bad: 'border-bad/20 bg-bad-soft text-bad',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

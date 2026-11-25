import type { InputHTMLAttributes, SelectHTMLAttributes, LabelHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const field =
  'h-9 w-full rounded-md border border-line-strong bg-white px-3 text-sm text-ink placeholder:text-ink-subtle focus:border-cobalt focus:outline-none focus:ring-2 focus:ring-cobalt/20 disabled:opacity-50';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(field, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(field, 'pr-8', className)} {...props} />;
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('mb-1 block text-xs font-medium text-ink-muted', className)} {...props} />;
}

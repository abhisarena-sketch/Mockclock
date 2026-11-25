'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export function CodeBlock({ code, className, title = 'TypeScript' }: { code: string; className?: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className={cn('overflow-hidden rounded-md border border-line bg-surface-muted', className)}>
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="text-xs font-medium text-ink-subtle">{title}</span>
        <button type="button" onClick={copy} className="text-xs font-medium text-cobalt hover:text-cobalt-dark">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12.5px] leading-relaxed text-ink">
        <code>{code}</code>
      </pre>
    </div>
  );
}

'use client';

import { CodeBlock } from '@/components/ui/code-block';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { usePlayground } from '@/lib/clock-context';

export function CodePanel() {
  const { code } = usePlayground();
  const latest = code[code.length - 1]!;
  const script = code.map((c) => `// ${c.title}\n${c.code}`).join('\n\n');
  return (
    <Card>
      <CardHeader title="Code" description="The TypeScript equivalent of what you just did, using the same API the playground calls." />
      <CardBody className="space-y-3">
        <div>
          <div className="mb-1.5 text-xs font-medium text-ink-muted">Last action: {latest.title}</div>
          <CodeBlock code={latest.code} />
        </div>
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-cobalt hover:text-cobalt-dark">
            Full session ({code.length} steps)
          </summary>
          <CodeBlock code={script} className="mt-2 max-h-96 overflow-y-auto" />
        </details>
      </CardBody>
    </Card>
  );
}

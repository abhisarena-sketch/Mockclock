'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { usePlayground } from '@/lib/clock-context';
import { signedDuration } from '@/lib/format';

export function Timeline() {
  const { clock, act } = usePlayground();
  const history = [...clock.history].reverse();
  const scenario = clock.scenario;
  const now = clock.nowMs();

  let track: React.ReactNode = null;
  if (scenario && scenario.events.length > 0) {
    const points = [scenario.startMs, ...scenario.events.map((e) => e.atMs), now];
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = Math.max(max - min, 1);
    const pos = (ms: number) => `${((ms - min) / span) * 100}%`;
    track = (
      <div className="mb-5">
        <div className="mb-2 text-xs font-medium text-ink-muted">
          {scenario.title}: events and the current simulated time
        </div>
        <div className="relative mx-8 h-16">
          <div className="absolute left-0 right-0 top-6 h-px bg-line-strong" />
          {scenario.events.map((e, i) => (
            <div key={e.id} className="absolute top-0 -translate-x-1/2" style={{ left: pos(e.atMs) }} title={`${e.label}\n${e.local}`}>
              <div className={`mx-auto mt-[19px] h-3 w-3 rounded-full border-2 ${e.atMs <= now ? 'border-cobalt bg-cobalt' : 'border-line-strong bg-white'}`} />
              <div className={`mt-1 max-w-24 truncate text-center text-[10px] text-ink-subtle ${i % 2 ? 'translate-y-3' : ''}`}>{e.id}</div>
            </div>
          ))}
          <div className="absolute top-1 h-10 w-0.5 -translate-x-1/2 bg-ink" style={{ left: pos(now) }} title="Simulated now" />
        </div>
        <div className="mt-2 flex justify-end gap-2">
          {(() => {
            const next = scenario.events.find((e) => e.atMs > now);
            return next ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => act(`Advance to ${next.id}`, `clock.advanceTo(${JSON.stringify(next.at).replace(/"/g, "'")}, '${next.id}');`, (c) => c.advanceTo(next.atMs, next.id))}
              >
                Advance to next event: {next.label}
              </Button>
            ) : (
              <Badge tone="ok">All events reached</Badge>
            );
          })()}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Event timeline"
        description="Every change the clock made, newest first, from clock.history. Load a scenario to see its events on a track."
        action={
          history.length ? (
            <Button size="xs" variant="ghost" onClick={() => act('Clear history', 'clock.clearHistory();', (c) => c.clearHistory())}>
              Clear
            </Button>
          ) : null
        }
      />
      <CardBody>
        {track}
        {history.length === 0 ? (
          <p className="text-sm text-ink-muted">No changes yet. Freeze, advance or load a scenario.</p>
        ) : (
          <ol className="space-y-0">
            {history.map((h) => (
              <li key={h.sequence} className="grid grid-cols-[18px_96px_1fr] items-start gap-3 border-l border-line pb-3 pl-0 last:pb-0">
                <span className={`-ml-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ${h.deltaMs < 0 ? 'bg-warn' : h.action === 'reset' ? 'bg-ink-subtle' : 'bg-cobalt'}`} />
                <span className="text-sm font-medium capitalize">{h.action}</span>
                <span className="min-w-0 text-xs text-ink-muted">
                  <span className="tabular font-mono">
                    {new Date(h.fromMs).toISOString()} → {new Date(h.toMs).toISOString()}
                  </span>
                  <span className={`ml-2 font-mono ${h.deltaMs < 0 ? 'text-warn' : 'text-cobalt'}`}>{h.deltaMs ? signedDuration(h.deltaMs) : '±0'}</span>
                  {h.label ? <span className="ml-2 text-ink-subtle">“{h.label}”</span> : null}
                  <span className="ml-2 text-ink-subtle">({h.mode})</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

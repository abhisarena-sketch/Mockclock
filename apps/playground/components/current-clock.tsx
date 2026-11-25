'use client';

import { Badge } from '@/components/ui/badge';
import { usePlayground } from '@/lib/clock-context';
import { offsetOf, signedDuration, wall } from '@/lib/format';

export function CurrentClock() {
  const { clock } = usePlayground();
  const state = clock.state();
  const tz = state.timeZone;
  const modeTone = state.mode === 'frozen' ? 'cobalt' : state.mode === 'running' ? 'warn' : 'neutral';
  const modeLabel = state.mode === 'frozen' ? 'Frozen' : state.mode === 'running' ? 'Simulated · running' : 'Real time';

  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-2">
      <div className="min-w-0 bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Actual time</span>
          <Badge>Your computer · never changed</Badge>
        </div>
        <div className="tabular mt-2 font-mono text-lg text-ink-muted sm:text-xl">{wall(state.realNowMs, tz)}</div>
        <div className="tabular mt-1 font-mono text-xs text-ink-subtle">{state.realNow}</div>
      </div>
      <div className="min-w-0 bg-white px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-cobalt">Simulated time</span>
          <Badge tone={modeTone}>{modeLabel}</Badge>
        </div>
        <div className="tabular mt-2 font-mono text-lg font-semibold sm:text-xl text-ink">{wall(state.nowMs, tz)}</div>
        <div className="tabular mt-1 flex flex-wrap gap-x-3 font-mono text-xs text-ink-subtle">
          <span>{state.now}</span>
          <span>
            {tz} {offsetOf(state.nowMs, tz)}
          </span>
          <span className={state.offsetFromRealMs ? 'text-cobalt' : ''}>
            {state.simulated ? `${signedDuration(state.offsetFromRealMs)} from real` : 'not simulated'}
          </span>
        </div>
      </div>
    </div>
  );
}

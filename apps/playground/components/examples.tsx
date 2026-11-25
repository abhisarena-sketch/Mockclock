'use client';

import { MockClock, formatPlainDate, type ResolvedScenario, type ScenarioId } from '@workfonic/mockclock';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { CodeBlock } from '@/components/ui/code-block';
import { usePlayground } from '@/lib/clock-context';
import { wall } from '@/lib/format';

type Tone = 'ok' | 'warn' | 'bad' | 'cobalt' | 'neutral';

interface Example {
  id: string;
  title: string;
  scenario: ScenarioId;
  summary: string;
  /** The business rule under test, evaluated against the example's own MockClock. */
  evaluate: (now: number, s: ResolvedScenario) => { tone: Tone; status: string; detail: string };
  code: string;
}

const at = (s: ResolvedScenario, id: string) => s.events.find((e) => e.id === id)!.atMs;

const EXAMPLES: Example[] = [
  {
    id: 'billing',
    title: 'Billing renewal',
    scenario: 'subscription-renewal',
    summary: 'A subscription anchored on January 31 renews on the last day of shorter months.',
    evaluate: (now, s) => {
      const renewals = s.events.filter((e) => e.id.startsWith('renewal-'));
      const charged = renewals.filter((e) => e.atMs <= now).length;
      const next = renewals.find((e) => e.atMs > now);
      return {
        tone: charged ? 'ok' : 'neutral',
        status: `${charged} of ${renewals.length} renewals charged`,
        detail: next ? `Next charge: ${next.local}` : 'All generated renewals charged',
      };
    },
    code: `import { MockClock, addMonths, parsePlainDate } from '@workfonic/mockclock';

it('renews on Feb 28 for a Jan 31 anchor', () => {
  const clock = MockClock.scenario('subscription-renewal');
  const billing = new BillingService(clock);           // inject the clock
  clock.advance({ minutes: 1 });                         // 2026-02-28T09:00Z
  expect(billing.chargesDue()).toHaveLength(1);
  expect(addMonths(parsePlainDate('2026-01-31'), 1)).toEqual(parsePlainDate('2026-02-28'));
});`,
  },
  {
    id: 'trial',
    title: 'Subscription expiry',
    scenario: 'trial-expiry',
    summary: 'A 14-day trial that must lock features at exactly the expiry instant.',
    evaluate: (now, s) => {
      const end = at(s, 'trial-ends');
      const left = end - now;
      return left > 0
        ? { tone: 'ok', status: 'Trial active', detail: `${Math.ceil(left / 60_000)} minute(s) left` }
        : { tone: 'bad', status: 'Trial expired', detail: 'Paid features locked' };
    },
    code: `const isTrialActive = (clock: ClockLike, endsAt: number) => clock.nowMs() < endsAt;

it('locks the account when the trial ends', () => {
  const clock = MockClock.scenario('trial-expiry', { trialDays: 14 });
  const ends = clock.scenario!.events.find((e) => e.id === 'trial-ends')!.atMs;
  expect(isTrialActive(clock, ends)).toBe(true);
  clock.advanceTo(ends);
  expect(isTrialActive(clock, ends)).toBe(false);
});`,
  },
  {
    id: 'payroll',
    title: 'Payroll cut-off',
    scenario: 'payroll',
    summary: 'Payroll inputs lock three business days before pay day (the last business day of the month).',
    evaluate: (now, s) => {
      const cutoff = at(s, 'cutoff');
      const pay = at(s, 'pay-day');
      if (now < cutoff) return { tone: 'ok', status: 'Open for changes', detail: `Locks at ${s.events[0]!.local}` };
      if (now < pay) return { tone: 'warn', status: 'Locked for processing', detail: `Pay day ${s.events[1]!.local.slice(0, 10)}` };
      return { tone: 'cobalt', status: 'Paid', detail: 'Payslips released' };
    },
    code: `it('rejects edits after the cut-off', () => {
  const clock = MockClock.scenario('payroll', { year: 2026, month: 11, cutoffBusinessDays: 3 });
  const payroll = new PayrollService(clock);
  expect(payroll.canEdit()).toBe(true);   // 16:59 on Wed 25 Nov
  clock.advance({ minutes: 1 });
  expect(payroll.canEdit()).toBe(false);  // 17:00 cut-off
});`,
  },
  {
    id: 'token',
    title: 'Token expiration',
    scenario: 'token-expiry',
    summary: 'An access token with a one-hour lifetime and a 30-second verifier leeway.',
    evaluate: (now, s) => {
      const exp = at(s, 'expires');
      const leeway = at(s, 'skew-limit');
      if (now < exp) return { tone: 'ok', status: 'Valid', detail: `${Math.ceil((exp - now) / 1000)} s until exp` };
      if (now < leeway) return { tone: 'warn', status: 'Expired, inside leeway', detail: 'Accepted by a lenient verifier' };
      return { tone: 'bad', status: 'Rejected', detail: 'Expired beyond the leeway' };
    },
    code: `it('rejects a token after exp + leeway', () => {
  const clock = MockClock.scenario('token-expiry', { ttlSeconds: 3600, clockSkewSeconds: 30 });
  const verify = createVerifier({ now: () => clock.nowMs(), leewaySeconds: 30 });
  expect(verify(token).ok).toBe(true);
  clock.advance({ seconds: 31 });
  expect(verify(token).ok).toBe(false);
});`,
  },
];

function ExampleCard({ example }: { example: Example }) {
  usePlayground(); // re-render with the global ticker
  const [clock, setClock] = useState(() => MockClock.scenario(example.scenario));
  const [, force] = useState(0);
  const s = clock.scenario!;
  const now = clock.nowMs();
  const result = example.evaluate(now, s);
  const next = s.events.find((e) => e.atMs > now);
  const step = (fn: () => void) => {
    fn();
    force((n) => n + 1);
  };

  return (
    <Card className="flex flex-col">
      <CardHeader title={example.title} description={example.summary} />
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-surface-muted px-3 py-2">
          <div className="min-w-0">
            <div className="tabular font-mono text-xs text-ink-muted">{wall(now, s.timeZone)} · {s.timeZone}</div>
            <div className="text-xs text-ink-subtle">{result.detail}</div>
          </div>
          <Badge tone={result.tone}>{result.status}</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="primary" disabled={!next} onClick={() => next && step(() => clock.advanceTo(next.atMs, next.id))}>
            {next ? `Advance to ${next.id}` : 'Done'}
          </Button>
          <Button size="sm" onClick={() => step(() => clock.advance({ seconds: 1 }))}>
            +1 s
          </Button>
          <Button size="sm" onClick={() => step(() => clock.advance({ minutes: 1 }))}>
            +1 min
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setClock(MockClock.scenario(example.scenario))}>
            Restart
          </Button>
        </div>
        <details>
          <summary className="cursor-pointer text-xs font-medium text-cobalt">Test code</summary>
          <CodeBlock code={example.code} className="mt-2" />
        </details>
        <p className="mt-auto text-[11px] text-ink-subtle">
          Own isolated clock · scenario <span className="font-mono">{example.scenario}</span> · simulated date {formatPlainDate(clock.today())}
        </p>
      </CardBody>
    </Card>
  );
}

export function Examples() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {EXAMPLES.map((e) => (
        <ExampleCard key={e.id} example={e} />
      ))}
    </div>
  );
}

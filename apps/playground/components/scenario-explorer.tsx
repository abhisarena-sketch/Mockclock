'use client';

import { MockClock, listScenarios, type ScenarioParamSpec, type ScenarioId } from '@workfonic/mockclock';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { q, usePlayground } from '@/lib/clock-context';

const SCENARIOS = listScenarios();

function toText(v: ScenarioParamSpec['default']): string {
  return Array.isArray(v) ? v.join(',') : String(v);
}

export function ScenarioExplorer() {
  const { clock, replace, act } = usePlayground();
  const [selected, setSelected] = useState<ScenarioId>('month-end');
  const summary = SCENARIOS.find((s) => s.id === selected)!;
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});
  const values = useMemo(() => overrides[selected] ?? {}, [overrides, selected]);

  const changed = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(values).filter(([k, v]) => v !== toText(summary.params[k]!.default)),
      ),
    [values, summary],
  );

  const load = () => {
    const paramsCode = Object.keys(changed).length
      ? `, { ${Object.entries(changed)
          .map(([k, v]) => `${k}: ${q(v)}`)
          .join(', ')} }`
      : '';
    replace(
      `Load scenario ${selected}`,
      `const clock = MockClock.scenario(${q(selected)}${paramsCode});\nclock.scenario?.events; // key instants to step through`,
      () => MockClock.scenario(selected, changed, { historyLimit: 200 }),
    );
  };

  const active = clock.scenario;

  return (
    <Card>
      <CardHeader
        title="Scenario explorer"
        description="Fifteen configurable scenarios from a single registry. Loading one replaces the clock with a frozen clock at the scenario start."
      />
      <CardBody className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <ul className="max-h-[420px] space-y-1 overflow-y-auto pr-1" aria-label="Scenarios">
          {SCENARIOS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => setSelected(s.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  s.id === selected ? 'bg-cobalt-soft text-cobalt-dark' : 'text-ink hover:bg-surface-muted'
                }`}
              >
                <div className="font-medium">{s.title}</div>
                <div className="font-mono text-[11px] text-ink-subtle">{s.id}</div>
              </button>
            </li>
          ))}
        </ul>

        <div className="min-w-0 space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="font-semibold">{summary.title}</h4>
              <Badge>{summary.category}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-muted">{summary.description}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.entries(summary.params).map(([key, spec]) => (
              <div key={key}>
                <Label htmlFor={`p-${key}`}>
                  {key} <span className="font-normal text-ink-subtle">({spec.type})</span>
                </Label>
                {spec.type === 'enum' ? (
                  <select
                    id={`p-${key}`}
                    className="h-9 w-full rounded-md border border-line-strong bg-white px-3 text-sm"
                    value={values[key] ?? toText(spec.default)}
                    onChange={(e) => setOverrides({ ...overrides, [selected]: { ...values, [key]: e.target.value } })}
                  >
                    {spec.values?.map((v) => <option key={v}>{v}</option>)}
                  </select>
                ) : (
                  <Input
                    id={`p-${key}`}
                    className="font-mono"
                    value={values[key] ?? toText(spec.default)}
                    onChange={(e) => setOverrides({ ...overrides, [selected]: { ...values, [key]: e.target.value } })}
                  />
                )}
                <p className="mt-1 text-[11px] leading-snug text-ink-subtle">{spec.description}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="primary" onClick={load}>
              Load scenario
            </Button>
            <Button variant="ghost" onClick={() => setOverrides({ ...overrides, [selected]: {} })}>
              Restore defaults
            </Button>
          </div>

          {active ? (
            <div className="rounded-md border border-line">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-muted px-3 py-2">
                <span className="text-sm font-medium">
                  Loaded: {active.title} <span className="font-mono text-xs text-ink-subtle">{active.timeZone}</span>
                </span>
                <span className="font-mono text-xs text-ink-muted">start {active.startLocal}</span>
              </div>
              <ol className="divide-y divide-line">
                {active.events.map((e) => {
                  const past = e.atMs <= clock.nowMs();
                  return (
                    <li key={e.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${past ? 'bg-cobalt' : 'border border-line-strong'}`} />
                      <span className="tabular w-56 font-mono text-xs text-ink-muted">{e.local}</span>
                      <span className="min-w-0 flex-1">
                        {e.label}
                        {e.description ? <span className="block text-xs text-ink-subtle">{e.description}</span> : null}
                      </span>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() =>
                          act(`Travel to ${e.id}`, `clock.travel(${q(e.at)}, ${q(e.id)});`, (c) => c.travel(e.atMs, e.id))
                        }
                      >
                        Go to
                      </Button>
                    </li>
                  );
                })}
              </ol>
              {active.notes.length ? (
                <div className="border-t border-line px-3 py-2 text-xs text-ink-muted">{active.notes.join(' ')}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardBody>
    </Card>
  );
}

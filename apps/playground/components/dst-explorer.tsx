'use client';

import { fromLocal, hoursInLocalDay, resolveLocal, toZonedDateTime, transitionsInYear, type Disambiguation } from '@workfonic/mockclock';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { q, usePlayground } from '@/lib/clock-context';

const DST_ZONES = ['America/New_York', 'Europe/London', 'Australia/Sydney', 'Australia/Lord_Howe', 'America/Santiago', 'Europe/Berlin', 'Pacific/Auckland'];
const MODES: Disambiguation[] = ['compatible', 'earlier', 'later', 'reject'];

export function DstExplorer() {
  const { act } = usePlayground();
  const [zone, setZone] = useState('America/New_York');
  const [year, setYear] = useState(2026);
  const [probe, setProbe] = useState('2026-03-08T02:30');

  const transitions = useMemo(() => {
    try {
      return transitionsInYear(zone, year);
    } catch {
      return [];
    }
  }, [zone, year]);

  let resolution: ReturnType<typeof resolveLocal> | null = null;
  let probeError: string | null = null;
  try {
    resolution = resolveLocal(probe, zone);
  } catch (e) {
    probeError = (e as Error).message;
  }

  return (
    <Card>
      <CardHeader
        title="DST explorer"
        description="Find transitions, then probe local times inside spring-forward gaps and fall-back overlaps."
      />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="dst-zone">Time zone</Label>
            <Select id="dst-zone" className="w-56" value={zone} onChange={(e) => setZone(e.target.value)}>
              {DST_ZONES.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="dst-year">Year</Label>
            <Input id="dst-year" type="number" className="w-28" value={year} min={1970} max={2100} onChange={(e) => setYear(Number(e.target.value) || 2026)} />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {transitions.length === 0 ? <p className="text-sm text-ink-muted">No transitions in {year}.</p> : null}
          {transitions.map((t) => {
            const localDay = t.localAfter.slice(0, 10);
            return (
              <div key={t.epochMs} className="rounded-md border border-line p-4">
                <div className="flex items-center justify-between">
                  <Badge tone={t.kind === 'gap' ? 'warn' : 'cobalt'}>{t.kind === 'gap' ? 'Spring forward (gap)' : 'Fall back (overlap)'}</Badge>
                  <span className="font-mono text-xs text-ink-subtle">{t.iso}</span>
                </div>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                  <dt className="text-ink-subtle">Before</dt>
                  <dd className="tabular font-mono text-xs">
                    {t.localBefore.slice(0, 19).replace('T', ' ')} ({t.offsetBefore})
                  </dd>
                  <dt className="text-ink-subtle">After</dt>
                  <dd className="tabular font-mono text-xs">
                    {t.localAfter.slice(0, 19).replace('T', ' ')} ({t.offsetAfter})
                  </dd>
                  <dt className="text-ink-subtle">Day length</dt>
                  <dd className="text-xs">{hoursInLocalDay(localDay, zone)} hours on {localDay}</dd>
                </dl>
                <Button
                  size="xs"
                  className="mt-3"
                  onClick={() => {
                    const at = new Date(t.epochMs - 60_000).toISOString();
                    act(
                      'Freeze before DST transition',
                      `clock.setTimeZone(${q(zone)});\nclock.freeze(${q(at)}); // one minute before the transition\nclock.advance({ minutes: 1 });`,
                      (c) => c.setTimeZone(zone).freeze(at),
                    );
                  }}
                >
                  Freeze clock 1 min before
                </Button>
              </div>
            );
          })}
        </div>

        <div className="rounded-md border border-line">
          <div className="flex flex-wrap items-end gap-3 border-b border-line bg-surface-muted px-4 py-3">
            <div className="grow">
              <Label htmlFor="probe">Probe a local time in {zone}</Label>
              <Input id="probe" className="font-mono" value={probe} onChange={(e) => setProbe(e.target.value)} />
            </div>
            {transitions.map((t) => (
              <Button key={t.epochMs} size="sm" variant="ghost" onClick={() => setProbe(probeFor(t.localBefore, t.kind))}>
                Try {t.kind}
              </Button>
            ))}
          </div>
          <div className="px-4 py-3 text-sm">
            {probeError ? <p className="text-bad">{probeError}</p> : null}
            {resolution ? (
              <>
                <p className="mb-3">
                  {resolution.kind === 'unique' && <Badge tone="ok">Exists exactly once</Badge>}
                  {resolution.kind === 'ambiguous' && <Badge tone="cobalt">Ambiguous: happens twice</Badge>}
                  {resolution.kind === 'gap' && <Badge tone="warn">Does not exist: skipped by the gap</Badge>}
                </p>
                <table className="w-full text-xs">
                  <tbody className="divide-y divide-line">
                    {MODES.map((m) => {
                      let out: string;
                      try {
                        const ms = fromLocal(probe, zone, m);
                        out = `${toZonedDateTime(ms, zone).iso}  =  ${new Date(ms).toISOString()}`;
                      } catch (e) {
                        out = `throws ${(e as Error).name}`;
                      }
                      return (
                        <tr key={m}>
                          <td className="w-32 py-1.5 font-mono text-cobalt-dark">{m}</td>
                          <td className="tabular py-1.5 font-mono">{out}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            ) : null}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

/** Pick a local time inside the gap/overlap next to a transition (the half-hour mark of the hour before). */
function probeFor(localBefore: string, kind: 'gap' | 'overlap'): string {
  const base = localBefore.slice(0, 13); // YYYY-MM-DDTHH
  if (kind === 'overlap') return `${base}:30`;
  // 15 minutes past the start of the skipped period, which begins one second after localBefore.
  const t = new Date(`${localBefore.slice(0, 19)}Z`).getTime() + 1000 + 15 * 60_000;
  return new Date(t).toISOString().slice(0, 16);
}

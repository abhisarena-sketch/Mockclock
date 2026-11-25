'use client';

import { DURATION_UNITS, type DurationLike, type DurationUnit } from '@workfonic/mockclock';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { q, usePlayground } from '@/lib/clock-context';
import { ZONE_CHOICES } from '@/lib/format';

const UNIT_LABEL: Record<DurationUnit, string> = {
  years: 'Years',
  months: 'Months',
  weeks: 'Weeks',
  days: 'Days',
  hours: 'Hours',
  minutes: 'Min',
  seconds: 'Sec',
  milliseconds: 'Ms',
};

function durationCode(d: DurationLike): string {
  const parts = DURATION_UNITS.filter((u) => d[u]).map((u) => `${u}: ${d[u]}`);
  return `{ ${parts.join(', ')} }`;
}

export function Controls() {
  const { clock, act, error, clearError } = usePlayground();
  const [instant, setInstant] = useState('2026-11-30T23:59:00Z');
  const [local, setLocal] = useState('2027-01-01T09:00');
  const [amounts, setAmounts] = useState<Record<DurationUnit, string>>({
    years: '',
    months: '',
    weeks: '',
    days: '2',
    hours: '3',
    minutes: '30',
    seconds: '',
    milliseconds: '',
  });

  const duration = (): DurationLike => {
    const d: DurationLike = {};
    for (const u of DURATION_UNITS) {
      const raw = amounts[u].trim();
      if (raw !== '') d[u] = Number(raw);
    }
    return d;
  };

  const tz = clock.timeZone;

  return (
    <Card>
      <CardHeader
        title="Simulation controls"
        description="Every button calls the real @workfonic/mockclock API. Invalid input is rejected by the library, not the UI."
      />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => act('Freeze', 'clock.freeze();', (c) => c.freeze())}>
            Freeze
          </Button>
          <Button onClick={() => act('Resume', 'clock.resume();', (c) => c.resume())} disabled={!clock.isFrozen()}>
            Resume
          </Button>
          <Button variant="danger" onClick={() => act('Reset to real time', 'clock.reset();', (c) => c.reset())}>
            Reset
          </Button>
          <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
            <Label className="mb-0" htmlFor="clock-tz">
              Clock time zone
            </Label>
            <Select
              id="clock-tz"
              className="min-w-0 flex-1 sm:w-48 sm:flex-none"
              value={tz}
              onChange={(e) => {
                const zone = e.target.value;
                act('Change time zone', `clock.setTimeZone(${q(zone)});`, (c) => c.setTimeZone(zone));
              }}
            >
              {(ZONE_CHOICES.includes(tz) ? ZONE_CHOICES : [tz, ...ZONE_CHOICES]).map((z) => (
                <option key={z}>{z}</option>
              ))}
            </Select>
          </div>
        </div>

        <div>
          <Label>Duration</Label>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {DURATION_UNITS.map((u) => (
              <div key={u}>
                <Input
                  aria-label={u}
                  inputMode="numeric"
                  placeholder="0"
                  value={amounts[u]}
                  onChange={(e) => setAmounts({ ...amounts, [u]: e.target.value })}
                  className="tabular px-2 text-center"
                />
                <div className="mt-1 text-center text-[11px] text-ink-subtle">{UNIT_LABEL[u]}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                const d = duration();
                act('Advance', `clock.advance(${durationCode(d)});`, (c) => c.advance(d));
              }}
            >
              Advance →
            </Button>
            <Button
              onClick={() => {
                const d = duration();
                act('Rewind', `clock.rewind(${durationCode(d)});`, (c) => c.rewind(d));
              }}
            >
              ← Rewind
            </Button>
            <span className="self-center text-xs text-ink-subtle">
              Days, weeks, months and years are calendar units in {tz}. Jan 31 + 1 month = Feb 28/29.
            </span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="instant">Set or freeze at an instant (needs Z or an offset)</Label>
            <Input id="instant" value={instant} onChange={(e) => setInstant(e.target.value)} className="font-mono" />
            <div className="mt-2 flex gap-2">
              <Button size="sm" onClick={() => act('Set', `clock.set(${q(instant)});`, (c) => c.set(instant))}>
                Set
              </Button>
              <Button size="sm" onClick={() => act('Freeze at', `clock.freeze(${q(instant)});`, (c) => c.freeze(instant))}>
                Freeze at
              </Button>
            </div>
          </div>
          <div>
            <Label htmlFor="local">Travel to a local wall-clock time in {tz}</Label>
            <Input id="local" value={local} onChange={(e) => setLocal(e.target.value)} className="font-mono" />
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  act(
                    'Travel to local time',
                    `clock.travel({ local: ${q(local)}, timeZone: ${q(tz)} });`,
                    (c) => c.travel({ local, timeZone: tz }),
                  )
                }
              >
                Travel
              </Button>
            </div>
          </div>
        </div>

        {error ? (
          <div role="alert" className="flex items-start justify-between gap-3 rounded-md border border-bad/25 bg-bad-soft px-3 py-2 text-sm text-bad">
            <span className="font-mono text-xs leading-relaxed">{error}</span>
            <button type="button" className="text-xs font-medium underline" onClick={clearError}>
              Dismiss
            </button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

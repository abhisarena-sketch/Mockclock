'use client';

import { compareAcrossTimeZones, isDaylightSavingTime, listTimeZones, timeZoneAbbreviation } from '@workfonic/mockclock';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { usePlayground } from '@/lib/clock-context';
import { ZONE_CHOICES } from '@/lib/format';

const DEFAULT = ['Asia/Kolkata', 'America/New_York', 'Europe/London', 'Asia/Tokyo', 'Australia/Sydney', 'Asia/Kathmandu'];

export function TimezoneExplorer() {
  const { clock } = usePlayground();
  const [zones, setZones] = useState(DEFAULT);
  const [adding, setAdding] = useState('America/Los_Angeles');
  const all = useMemo(() => {
    const list = listTimeZones();
    return list.length ? list : ZONE_CHOICES;
  }, []);

  const now = clock.nowMs();
  const rows = compareAcrossTimeZones(now, zones);
  const reference = clock.timeZone;

  return (
    <Card>
      <CardHeader
        title="Time zone explorer"
        description="The same simulated instant in several IANA zones. Offsets are read from Intl, never invented."
        action={
          <div className="flex items-center gap-2">
            <Select aria-label="Add a time zone" className="w-56" value={adding} onChange={(e) => setAdding(e.target.value)}>
              {all.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </Select>
            <Button size="sm" onClick={() => !zones.includes(adding) && setZones([...zones, adding])}>
              Add
            </Button>
          </div>
        }
      />
      <CardBody className="overflow-x-auto p-0">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-subtle">
              <th className="px-5 py-2 font-medium">Zone</th>
              <th className="px-3 py-2 font-medium">Local date-time</th>
              <th className="px-3 py-2 font-medium">Offset</th>
              <th className="px-3 py-2 font-medium">State</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((z) => {
              const otherDay = !sameDay(z.date, clock.today(reference));
              return (
                <tr key={z.timeZone}>
                  <td className="px-5 py-2.5 font-medium">{z.timeZone}</td>
                  <td className="tabular px-3 py-2.5 font-mono text-xs">
                    {z.iso.slice(0, 19).replace('T', ' ')}
                    {otherDay ? (
                      <Badge tone="warn" className="ml-2">
                        different date than {reference}
                      </Badge>
                    ) : null}
                  </td>
                  <td className="tabular px-3 py-2.5 font-mono text-xs">
                    {z.offset} <span className="text-ink-subtle">{timeZoneAbbreviation(now, z.timeZone)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    {isDaylightSavingTime(now, z.timeZone) ? <Badge tone="cobalt">DST</Badge> : <Badge>standard</Badge>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Button size="xs" variant="ghost" onClick={() => setZones(zones.filter((x) => x !== z.timeZone))}>
                      Remove
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="border-t border-line px-5 py-2.5 text-xs text-ink-muted">
          All rows are one instant: <span className="font-mono">{new Date(now).toISOString()}</span>. Comparing local dates is how
          “today” bugs happen; use <span className="font-mono">isSameLocalDate(a, b, zone)</span> instead of comparing UTC dates.
        </p>
      </CardBody>
    </Card>
  );
}

function sameDay(a: { year: number; month: number; day: number }, b: { year: number; month: number; day: number }) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

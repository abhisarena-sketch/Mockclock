import { formatOffset, getOffsetMs } from '@workfonic/mockclock';

const cache = new Map<string, Intl.DateTimeFormat>();

/** Human-readable wall-clock time in a zone, e.g. "Mon, 30 Nov 2026, 23:59:00". */
export function wall(ms: number, timeZone: string): string {
  let f = cache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    cache.set(timeZone, f);
  }
  return f.format(new Date(ms));
}

export function offsetOf(ms: number, timeZone: string): string {
  return formatOffset(getOffsetMs(ms, timeZone));
}

export function signedDuration(ms: number): string {
  const sign = ms < 0 ? '−' : '+';
  let rest = Math.abs(ms);
  const d = Math.floor(rest / 86_400_000);
  rest -= d * 86_400_000;
  const h = Math.floor(rest / 3_600_000);
  rest -= h * 3_600_000;
  const m = Math.floor(rest / 60_000);
  rest -= m * 60_000;
  const s = Math.floor(rest / 1000);
  const parts = [d ? `${d}d` : '', h ? `${h}h` : '', m ? `${m}m` : '', s || (!d && !h && !m) ? `${s}s` : ''].filter(Boolean);
  return `${sign}${parts.join(' ')}`;
}

export const ZONE_CHOICES = [
  'UTC',
  'Asia/Kolkata',
  'America/New_York',
  'Europe/London',
  'Asia/Tokyo',
  'Australia/Sydney',
  'America/Los_Angeles',
  'Europe/Berlin',
  'Asia/Kathmandu',
  'Australia/Lord_Howe',
  'America/Sao_Paulo',
  'Pacific/Auckland',
];

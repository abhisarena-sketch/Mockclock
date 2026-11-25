/** Fire setTimeout/setInterval callbacks by advancing a MockClock (via @sinonjs/fake-timers). */
import assert from 'node:assert/strict';
import * as FakeTimers from '@sinonjs/fake-timers';
import { MockClock } from '@workfonic/mockclock';
import { installFakeTimers } from '@workfonic/mockclock-node';

const clock = MockClock.scenario('token-expiry', { ttlSeconds: 300, leadSeconds: 60 });
const handle = installFakeTimers(clock, { implementation: FakeTimers });
try {
  const log: string[] = [];
  // Refresh the token 30 seconds before it expires.
  setTimeout(() => log.push(`refresh at ${new Date().toISOString()}`), 30_000);
  const poll = setInterval(() => log.push(`poll at ${new Date().toISOString()}`), 20_000);

  clock.advance({ minutes: 1 });
  clearInterval(poll);
  console.log(log.join('\n'));
  assert.deepEqual(log, [
    'poll at 2026-11-25T12:04:20.000Z',
    'refresh at 2026-11-25T12:04:30.000Z',
    'poll at 2026-11-25T12:04:40.000Z',
    'poll at 2026-11-25T12:05:00.000Z',
  ]);
} finally {
  handle.uninstall();
}

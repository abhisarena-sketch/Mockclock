'use client';

import { MockClock, MockClockError, type ClockChangeEvent } from '@workfonic/mockclock';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export interface CodeEntry {
  id: number;
  title: string;
  code: string;
}

interface PlaygroundState {
  /** The single MockClock instance that drives the playground. Real package, no UI-side simulation. */
  clock: MockClock;
  /** Changes whenever the clock changes or the display ticks. */
  version: number;
  /** Run an operation on the clock and record the equivalent TypeScript. */
  act: (title: string, code: string, fn: (clock: MockClock) => void) => boolean;
  /** Replace the clock (for example with MockClock.scenario(...)). */
  replace: (title: string, code: string, make: () => MockClock) => boolean;
  code: CodeEntry[];
  error: string | null;
  clearError: () => void;
}

const Ctx = createContext<PlaygroundState | null>(null);

function describeError(e: unknown): string {
  if (e instanceof MockClockError) return `${e.name} (${e.code}): ${e.message}`;
  return e instanceof Error ? e.message : String(e);
}

export function ClockProvider({ children }: { children: ReactNode }) {
  const [clock, setClock] = useState(() => new MockClock({ timeZone: 'UTC', historyLimit: 200 }));
  const [version, setVersion] = useState(0);
  const [code, setCode] = useState<CodeEntry[]>([
    { id: 0, title: 'Create a clock', code: "import { MockClock } from '@workfonic/mockclock';\n\nconst clock = new MockClock({ timeZone: 'UTC' });" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(1);

  useEffect(() => clock.subscribe((_e: ClockChangeEvent) => setVersion((v) => v + 1)), [clock]);

  // Re-render twice a second so real time (and a running simulation) visibly moves.
  useEffect(() => {
    const id = setInterval(() => setVersion((v) => v + 1), 500);
    return () => clearInterval(id);
  }, []);

  const record = useCallback((title: string, snippet: string) => {
    setCode((prev) => [...prev.slice(-11), { id: nextId.current++, title, code: snippet }]);
  }, []);

  const act = useCallback(
    (title: string, snippet: string, fn: (c: MockClock) => void) => {
      try {
        fn(clock);
        setError(null);
        record(title, snippet);
        return true;
      } catch (e) {
        setError(describeError(e));
        return false;
      }
    },
    [clock, record],
  );

  const replace = useCallback(
    (title: string, snippet: string, make: () => MockClock) => {
      try {
        const next = make();
        setClock(next);
        setError(null);
        record(title, snippet);
        return true;
      } catch (e) {
        setError(describeError(e));
        return false;
      }
    },
    [record],
  );

  const value = useMemo<PlaygroundState>(
    () => ({ clock, version, act, replace, code, error, clearError: () => setError(null) }),
    [clock, version, act, replace, code, error],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePlayground(): PlaygroundState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePlayground must be used inside <ClockProvider>');
  return ctx;
}

/** Re-render every 500 ms for components that show live time outside the provider's clock. */
export function useTicker(intervalMs = 500): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return n;
}

export const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

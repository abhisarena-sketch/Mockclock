'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { CodePanel } from '@/components/code-panel';
import { Controls } from '@/components/controls';
import { CurrentClock } from '@/components/current-clock';
import { DstExplorer } from '@/components/dst-explorer';
import { Examples } from '@/components/examples';
import { ScenarioExplorer } from '@/components/scenario-explorer';
import { Timeline } from '@/components/timeline';
import { TimezoneExplorer } from '@/components/timezone-explorer';
import { ClockProvider } from '@/lib/clock-context';

const SECTIONS = [
  ['clock', 'Clock'],
  ['scenarios', 'Scenarios'],
  ['timezones', 'Time zones'],
  ['dst', 'DST'],
  ['timeline', 'Timeline'],
  ['examples', 'Examples'],
] as const;

function Section({ id, title, intro, children }: { id: string; title: string; intro: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="mb-3">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-ink-muted">{intro}</p>
      </div>
      {children}
    </section>
  );
}

export function Playground() {
  // Times differ between the static build and the browser, so render clock UI only after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-cobalt font-mono text-sm font-bold text-white" aria-hidden>
              MC
            </div>
            <div>
              <div className="text-[15px] font-semibold leading-tight">MockClock</div>
              <div className="text-xs leading-tight text-ink-subtle">Workfonic Labs · Control time. Test anything.</div>
            </div>
          </div>
          <nav className="flex flex-wrap gap-1 text-sm" aria-label="Sections">
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="rounded-md px-2.5 py-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink">
                {label}
              </a>
            ))}
            <a
              href="https://github.com/abhisarena-sketch/mockclock"
              className="rounded-md px-2.5 py-1.5 font-medium text-cobalt hover:bg-cobalt-soft"
            >
              GitHub
            </a>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-10 px-4 py-8 sm:px-5">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight">Playground</h1>
          <p className="mt-1.5 text-ink-muted">
            Everything on this page runs the published <span className="font-mono text-ink">@workfonic/mockclock</span> package in your
            browser. Your computer&apos;s clock is never changed; only the MockClock instance moves. Nothing is sent anywhere.
          </p>
        </div>

        {!mounted ? (
          <p className="text-sm text-ink-muted">Loading clock…</p>
        ) : (
          <ClockProvider>
            <Section id="clock" title="Current clock" intro="Real time and simulated time, side by side.">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0 space-y-4">
                  <CurrentClock />
                  <Controls />
                </div>
                <CodePanel />
              </div>
            </Section>
            <Section id="scenarios" title="Scenarios" intro="Ready-made starting points for time-sensitive tests.">
              <ScenarioExplorer />
            </Section>
            <Section id="timezones" title="Time zones" intro="One instant, many wall clocks.">
              <TimezoneExplorer />
            </Section>
            <Section id="dst" title="Daylight saving" intro="Gaps, overlaps and days that are not 24 hours long.">
              <DstExplorer />
            </Section>
            <Section id="timeline" title="Timeline" intro="How simulated time has moved.">
              <Timeline />
            </Section>
            <Section id="examples" title="Real-world testing examples" intro="Business rules evaluated against their own isolated clocks.">
              <Examples />
            </Section>
          </ClockProvider>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-5 py-6 text-xs text-ink-subtle">
          <span>MockClock · MIT licensed · Workfonic Labs</span>
          <span>No tracking, no cookies, no network requests.</span>
        </div>
      </footer>
    </div>
  );
}

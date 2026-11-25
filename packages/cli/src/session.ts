import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { MockClock, type ClockSnapshot } from '@workfonic/mockclock';

/**
 * A session file is the only way MockClock CLI state survives between
 * invocations. Without one, every command starts from real time (or --from).
 */
export interface SessionFile {
  readonly tool: 'mockclock';
  readonly version: 1;
  readonly clock: ClockSnapshot;
  readonly updatedAt: string;
}

export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionError';
  }
}

const MAX_SESSION_BYTES = 64 * 1024;

export function resolveSessionPath(value: string, cwd: string): string {
  if (value.trim() === '') throw new SessionError('Session path must not be empty');
  if (value.includes('\0')) throw new SessionError('Session path contains a NUL byte');
  return path.resolve(cwd, value);
}

/** Load a session clock, or return `undefined` if the file does not exist yet. */
export async function loadSession(file: string, realTime?: () => number): Promise<MockClock | undefined> {
  let raw: string;
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) throw new SessionError(`Session path ${file} is not a file`);
    if (stat.size > MAX_SESSION_BYTES) throw new SessionError(`Session file ${file} is too large to be a MockClock session`);
    raw = await fs.readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    if (error instanceof SessionError) throw error;
    throw new SessionError(`Cannot read session file ${file}: ${(error as Error).message}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new SessionError(`Session file ${file} is not valid JSON. Delete it or pass a different --session path.`);
  }
  const s = data as Partial<SessionFile>;
  if (!s || s.tool !== 'mockclock' || s.version !== 1) {
    throw new SessionError(`${file} is not a MockClock session file (expected "tool": "mockclock", "version": 1)`);
  }
  try {
    return MockClock.fromSnapshot(s.clock, realTime ? { realTime } : {});
  } catch (error) {
    throw new SessionError(`Session file ${file} is invalid: ${(error as Error).message}`);
  }
}

/** Write the session atomically (temp file + rename) so a crash never leaves half a file. */
export async function saveSession(file: string, clock: MockClock, nowIso: string): Promise<void> {
  const body: SessionFile = { tool: 'mockclock', version: 1, clock: clock.toJSON(), updatedAt: nowIso };
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await fs.writeFile(tmp, `${JSON.stringify(body, null, 2)}\n`, { encoding: 'utf8', mode: 0o644 });
    await fs.rename(tmp, file);
  } catch (error) {
    await fs.rm(tmp, { force: true });
    throw new SessionError(`Cannot write session file ${file}: ${(error as Error).message}`);
  }
}

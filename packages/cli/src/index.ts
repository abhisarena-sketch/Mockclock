/** Programmatic entry point for the mockclock CLI (useful for testing and embedding). */
export { EXIT_ERROR, EXIT_OK, EXIT_USAGE, HELP, run, type CliIO } from './run.js';
export { SessionError, loadSession, saveSession, type SessionFile } from './session.js';
export { VERSION } from './version.js';

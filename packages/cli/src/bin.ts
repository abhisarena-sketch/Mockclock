#!/usr/bin/env node
import { run } from './run.js';

run(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  env: process.env,
  cwd: process.cwd(),
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`mockclock: unexpected error: ${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  },
);

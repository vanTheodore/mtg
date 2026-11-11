#!/usr/bin/env bun
/**
 * Turns a cargo log into check-run annotations.
 *
 * Cargo's failures arrive as «exit code 101» plus a 15 MB job log that lives
 * behind the Actions artifact/blob download; on some networks that download is
 * unreachable (`EOF` from blob storage), so the failing step tells you nothing.
 * Annotations are plain JSON on `api.github.com` instead, so this script repeats
 * every `error[...]`/`error:` line with the source location cargo printed next
 * to it as `-> file:line:col`.
 *
 * Usage (inside a workflow, after the cargo step ran with `2>&1 | tee`):
 *
 *   set -o pipefail
 *   cargo build 2>&1 | tee /tmp/rust.log
 *   ...
 *   bun scripts/rust-annotations.ts /tmp/rust.log
 *
 * The script never fails the step: it runs under `if: failure()` and exits 0.
 */
import { existsSync, readFileSync } from 'node:fs';

const MESSAGE_LIMIT = 400;
const MAX_ANNOTATIONS = 25;

function escape(value: string): string {
  return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function annotation(file: string, line: number, title: string, message: string) {
  const safeTitle = escape(title).replace(/,/g, '%2C').replace(/:/g, '%3A');
  const safeFile = escape(file).replace(/,/g, '%2C');
  console.log(`::error file=${safeFile},line=${line},title=${safeTitle}::${escape(message.slice(0, MESSAGE_LIMIT))}`);
}

const path = process.argv[2] ?? '/tmp/rust.log';
if (!existsSync(path)) {
  console.log(`::warning title=Sin registro de cargo::No existe ${path}.`);
  process.exit(0);
}

const lines = readFileSync(path, 'utf8').split('\n');
let emitted = 0;

for (let index = 0; index < lines.length && emitted < MAX_ANNOTATIONS; index += 1) {
  const line = lines[index];
  if (!/^error(\[E\d+\])?:/.test(line)) continue;

  // Cargo prints the source location a couple of lines below the heading:
  //   `  --> src/foo.rs:12:5`
  let file = '';
  let lineNumber = 1;
  for (let look = index + 1; look < Math.min(index + 12, lines.length); look += 1) {
    const match = /^\s*-->\s+(\S+?):(\d+):(\d+)/.exec(lines[look]);
    if (match) {
      file = match[1];
      lineNumber = Number(match[2]);
      break;
    }
  }

  // The message is the heading plus the first indented detail line, which is
  // where the actually-useful sentence usually lives.
  const detail = lines
    .slice(index + 1, index + 12)
    .find((candidate) => candidate.trim() && !candidate.trim().startsWith('-->') && !candidate.trim().startsWith('|'));
  const message = [line.trim(), detail?.trim()].filter(Boolean).join(' · ');

  annotation(file || 'Cargo.toml', lineNumber, 'Rust', message);
  emitted += 1;
}

if (!emitted) {
  const tail = lines.filter((line) => line.trim()).slice(-4).join(' · ');
  annotation('Cargo.toml', 1, 'Rust', tail || 'cargo falló sin líneas de error reconocibles');
  emitted = 1;
}

console.log(`::notice title=Anotaciones::${emitted} error(es) de Rust anotados desde ${path}.`);
process.exit(0);

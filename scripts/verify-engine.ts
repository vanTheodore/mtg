#!/usr/bin/env bun
/** Verify the vendored Phase engine source tree matches the pinned upstream hash. */
const EXPECTED = '7ca901b32a2ae92ab8d760b32ff65c9ea174f35c374260874968148397cc8aa5';
const root = process.argv[2] ?? 'crates/phase-engine/src';
const enc = new TextEncoder();

const glob = new Bun.Glob('**/*');
const files: string[] = [];
for await (const path of glob.scan({ cwd: root, onlyFiles: true, absolute: false })) files.push(path);
files.sort();

const chunks: Uint8Array[] = [];
let total = 0;
for (const rel of files) {
  const relBytes = enc.encode(rel);
  const nul = enc.encode('\0');
  const fileHasher = new Bun.CryptoHasher('sha256');
  fileHasher.update(new Uint8Array(await Bun.file(`${root}/${rel}`).arrayBuffer()));
  const digest = fileHasher.digest();
  chunks.push(relBytes, nul, digest);
  total += relBytes.length + nul.length + digest.length;
}
const merged = new Uint8Array(total);
let offset = 0;
for (const chunk of chunks) { merged.set(chunk, offset); offset += chunk.length; }
const tree = new Bun.CryptoHasher('sha256');
tree.update(merged);
const actual = tree.digest('hex');
console.log(JSON.stringify({ root, files: files.length, sha256: actual, expected: EXPECTED, ok: actual === EXPECTED }, null, 2));
if (actual !== EXPECTED) process.exit(1);

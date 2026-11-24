#!/usr/bin/env bun
/** Verify the vendored Phase engine source tree matches the pinned upstream hash. */
import { readFileSync } from 'node:fs';

// The manifest is the single source of truth for the upstream pin and the
// hash of crates/phase-engine/src. Never duplicate the digest in this script.
const pin = JSON.parse(readFileSync(new URL('../docs/PHASE-UPSTREAM-PIN.json', import.meta.url), 'utf8')) as {
  origin: string;
  commit: string;
  version: string;
  sourceSha256: string;
  trees?: { local: string; upstream: string; files: number; sha256: string }[];
};
if (!/^https:\/\/github\.com\/phase-rs\/phase$/.test(pin.origin)
  || !/^[a-f0-9]{40}$/.test(pin.commit)
  || !/^[a-f0-9]{64}$/.test(pin.sourceSha256)) {
  throw new Error('Invalid docs/PHASE-UPSTREAM-PIN.json; refusing unverifiable Phase engine provenance');
}
const enc = new TextEncoder();

/**
 * Tree hash of one vendored directory: `sha256` over the sorted sequence of
 * `path \0 sha256(file)`. Same shape as the historical single-tree digest, so
 * `sourceSha256` stays valid for `crates/phase-engine/src` and every other tree
 * uses the same function instead of a second definition that could drift.
 */
async function treeDigest(root: string) {
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
  return { files: files.length, sha256: tree.digest('hex') };
}

// `bun run engine:verify -- <dir>` keeps verifying a single ad-hoc tree; with no
// argument every tree declared in the manifest is checked. AST, parser and their
// data files are imported just as literally as the engine, so leaving them out of
// the guard meant a corrupted parser tree could pass provenance.
const only = process.argv[2];
const targets = only
  ? [{ local: only, upstream: only.replace('crates/phase-', 'crates/'), files: 0, sha256: pin.sourceSha256 }]
  : (pin.trees ?? [{ local: 'crates/phase-engine/src', upstream: 'crates/engine/src', files: 0, sha256: pin.sourceSha256 }]);
const results = [];
let ok = true;
for (const target of targets) {
  const actual = await treeDigest(target.local);
  const match = actual.sha256 === target.sha256;
  ok = ok && match;
  results.push({ root: target.local, upstream: target.upstream, files: actual.files, sha256: actual.sha256, expected: target.sha256, ok: match });
}
const headline = results[0];
const report = targets.length === 1
  ? { root: headline.root, files: headline.files, upstream: pin.origin, commit: pin.commit, sha256: headline.sha256, expected: headline.expected, ok }
  : { upstream: pin.origin, commit: pin.commit, trees: results, ok };
console.log(JSON.stringify(report, null, 2));
if (!ok) process.exit(1);

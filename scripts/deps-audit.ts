/**
 * Dependency audit for Mesa (Bun-only, no npm/Node tooling in the app).
 *
 * Reads every package pinned in `bun.lock`, asks the npm registry for its
 * published dist-tags and reports drift against the highest channel version.
 * Direct dependencies are the ones listed in `package.json`; transitive updates
 * normally belong to their parent range and are shown only as context.
 *
 * Usage: bun run deps:audit
 */
import { readFileSync } from 'node:fs';

type Entry = { key: string; name: string; pinned: string; latest?: string; direct: boolean };

const REGISTRY = 'https://registry.npmjs.org';
const CONCURRENCY = 8;

/** bun.lock is JSONC: strip trailing commas before parsing. */
function readLock(file = 'bun.lock'): Record<string, unknown[]> {
  return JSON.parse(readFileSync(file, 'utf8').replace(/,(\s*[}\]])/g, '$1')).packages as Record<string, unknown[]>;
}

/** `["magic-string@0.30.21", …]` may be stored under a nested key such as `svelte/magic-string`. */
function specOf(value: unknown[] | undefined): { name: string; version: string } | undefined {
  const spec = typeof value?.[0] === 'string' ? value[0].slice(0, value[0].lastIndexOf('@')) : '';
  const version = typeof value?.[0] === 'string' ? value[0].slice(value[0].lastIndexOf('@') + 1) : '';
  return spec && version ? { name: spec, version } : undefined;
}

function parse(version: string): { core: number[]; pre: string[] } {
  const [core = '', pre] = version.split('-', 2) as [string, string?];
  return { core: core.split('.').map((part) => Number.parseInt(part, 10) || 0), pre: pre ? pre.split('.') : [] };
}

/** Semver-ish ordering: prereleases sort below their release, numeric ids numerically. */
export function compareVersions(a: string, b: string): number {
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.core.length, right.core.length); i += 1) {
    const diff = (left.core[i] ?? 0) - (right.core[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (!left.pre.length || !right.pre.length) return right.pre.length - left.pre.length;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i += 1) {
    const l = left.pre[i];
    const r = right.pre[i];
    if (l === undefined) return -1;
    if (r === undefined) return 1;
    const ln = Number(l);
    const rn = Number(r);
    if (!Number.isNaN(ln) && !Number.isNaN(rn)) { if (ln !== rn) return ln - rn; }
    else if (l !== r) return l < r ? -1 : 1;
  }
  return 0;
}

/** The `latest` dist-tag: stable channel, the one a normal install resolves. */
async function latestVersion(name: string): Promise<string | undefined> {
  const encoded = name.replace('/', '%2F');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${REGISTRY}/${encoded}`, {
        headers: { accept: 'application/vnd.npm.install-v1+json' }
      });
      if (!response.ok) return undefined;
      const tags = ((await response.json()) as { 'dist-tags'?: Record<string, string> })['dist-tags'] ?? {};
      return tags.latest;
    } catch {
      await Bun.sleep(250);
    }
  }
  return undefined;
}

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]!);
    }
  }));
  return results;
}

export async function audit(): Promise<{ entries: Entry[]; outdated: Entry[] }> {
  const lock = readLock();
  const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
    devDependencies?: Record<string, string>; dependencies?: Record<string, string>;
  };
  const direct = new Set(Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }));
  const entries: Entry[] = Object.entries(lock).flatMap(([key, value]) => {
    const spec = specOf(value);
    if (!spec) return [];
    return [{ key, name: spec.name, pinned: spec.version, direct: direct.has(key) }];
  });
  await mapLimit(entries, CONCURRENCY, async (entry) => {
    entry.latest = await latestVersion(entry.name);
    return entry;
  });
  // Nested keys ("svelte/magic-string") are pinned by their parent's range, and a
  // pinned prerelease ahead of `latest` belongs to a later channel: neither is drift.
  const outdated = entries
    .filter((entry) => entry.key === entry.name && entry.latest
      && compareVersions(entry.latest, entry.pinned) > 0
      && !(entry.pinned.includes('-') && compareVersions(entry.pinned, entry.latest) >= 0))
    .sort((a, b) => Number(b.direct) - Number(a.direct) || a.key.localeCompare(b.key));
  return { entries, outdated };
}

if (import.meta.main) {
  const { entries, outdated } = await audit();
  const direct = outdated.filter((entry) => entry.direct);
  const missing = entries.filter((entry) => !entry.latest);
  console.log(`${entries.length} paquetes en bun.lock · ${entries.filter((entry) => entry.direct).length} directos`);
  console.log(`desactualizados: ${outdated.length} (${direct.length} directos)`);
  for (const entry of outdated) console.log(`  ${entry.direct ? '*' : ' '} ${entry.key} ${entry.pinned} → ${entry.latest}`);
  if (missing.length) console.log(`sin respuesta del registro: ${missing.map((entry) => entry.key).join(', ')}`);
  console.log(direct.length
    ? '\n* directo: revisar antes de actualizar; el resto depende del rango de su padre.'
    : '\nNingún dependiente directo está por detrás del registro.');
}

#!/usr/bin/env bun
/**
 * Preflight for browser verification.
 *
 * Playwright needs two things this environment cannot always give it: a browser
 * binary and the engine artifact the app loads. Both are checked here, out loud,
 * with the exact command that fixes each one — instead of letting an E2E run die
 * with "Executable doesn't exist" twenty minutes later.
 *
 * Usage:
 *   bun scripts/preflight.ts            # human-readable report
 *   bun scripts/preflight.ts --json     # machine-readable
 *
 * Exit code: 0 when a browser **and** the engine artifact are available,
 * 1 otherwise, so it can gate a CI job.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const json = process.argv.includes('--json');
const root = new URL('..', import.meta.url).pathname;

interface Check {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  fix?: string;
}

const checks: Check[] = [];

const push = (check: Check) => { checks.push(check); };

// ── engine artifact ──────────────────────────────────────────────────────────

const wasmPath = join(root, 'static/wasm/mtg_engine_wasm.wasm');
if (existsSync(wasmPath)) {
  const size = statSync(wasmPath).size;
  const magic = readFileSync(wasmPath).subarray(0, 4);
  const isWasm = magic[0] === 0x00 && magic[1] === 0x61 && magic[2] === 0x73 && magic[3] === 0x6d;
  push({
    id: 'engine',
    label: 'Motor WASM publicado',
    ok: isWasm && size > 1_000_000,
    detail: isWasm
      ? `${(size / 1024 / 1024).toFixed(1)} MiB en static/wasm/mtg_engine_wasm.wasm`
      : 'el archivo no empieza con la firma \\0asm',
    fix: 'bun run engine:build   (requiere Rust 1.87.0-nightly + target wasm32-unknown-unknown)'
  });
} else {
  push({
    id: 'engine',
    label: 'Motor WASM publicado',
    ok: false,
    detail: 'falta static/wasm/mtg_engine_wasm.wasm (artifact generado, no versionado)',
    fix: 'bun run engine:build   (ver docs/BROWSER-RUNBOOK.md §3)'
  });
}

// ── catalog and app data ─────────────────────────────────────────────────────

for (const [id, label, path] of [
  ['catalog-index', 'Índice de catálogo', 'static/data/catalog/index.json'],
  ['catalog-pack', 'Pack 10E', 'static/data/catalog/packs/10e.json'],
  ['coverage', 'Cobertura por carta', 'static/data/catalog/coverage']
] as const) {
  const full = join(root, path);
  const ok = existsSync(full) && (statSync(full).isDirectory() ? readdirSync(full).length > 0 : statSync(full).size > 1000);
  push({
    id,
    label,
    ok,
    detail: ok ? path : `${path} falta o está vacío`,
    fix: ok ? undefined : 'bun run catalog:packs && bun run coverage:build (ver docs/VERIFICATION-0.4.3.md)'
  });
}

// ── browsers ─────────────────────────────────────────────────────────────────

const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
const playwrightCache = process.env.PLAYWRIGHT_BROWSERS_PATH
  ?? (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'ms-playwright') : join(home, '.cache/ms-playwright'));

const bundled = existsSync(playwrightCache)
  ? readdirSync(playwrightCache).filter((name) => /^(chromium|firefox|webkit)/.test(name))
  : [];
push({
  id: 'playwright-browsers',
  label: 'Navegadores de Playwright',
  ok: bundled.some((name) => name.startsWith('chromium')),
  detail: bundled.length ? `${playwrightCache}: ${bundled.join(', ')}` : `${playwrightCache}: vacío o inexistente`,
  fix: 'bunx playwright install chromium   (descarga desde cdn.playwright.dev)'
});

const candidates: { label: string; paths: string[] }[] = [
  {
    label: 'Microsoft Edge',
    paths: [
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable'
    ]
  },
  {
    label: 'Google Chrome',
    paths: [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable'
    ]
  }
];

for (const candidate of candidates) {
  const found = candidate.paths.find((path) => existsSync(path));
  push({
    id: candidate.label === 'Microsoft Edge' ? 'msedge' : 'chrome',
    label: `${candidate.label} instalado`,
    ok: Boolean(found),
    detail: found ?? 'no se encontró en las rutas habituales',
    fix: found ? `MESA_BROWSER=${candidate.label === 'Microsoft Edge' ? 'msedge' : 'chrome'} bun run test:e2e` : undefined
  });
}

// ── egress to the browser CDN ────────────────────────────────────────────────

const cdn = await fetch('https://cdn.playwright.dev/', { method: 'HEAD' })
  .then((response) => ({ ok: response.ok, detail: `HTTP ${response.status}` }))
  .catch((error: unknown) => ({ ok: false, detail: String((error as Error).message ?? error) }));
push({
  id: 'cdn',
  label: 'CDN de navegadores accesible',
  ok: cdn.ok,
  detail: cdn.ok ? cdn.detail : `${cdn.detail} — sin egress no se puede descargar un navegador`,
  fix: 'usar un navegador ya instalado: MESA_BROWSER=msedge (Edge) o MESA_BROWSER=chrome'
});

// ── report ───────────────────────────────────────────────────────────────────

const browserReady = checks.some((check) => (check.id === 'msedge' || check.id === 'chrome') && check.ok)
  || checks.some((check) => check.id === 'playwright-browsers' && check.ok);
const engineReady = checks.some((check) => check.id === 'engine' && check.ok);
const ready = browserReady && engineReady;

if (json) {
  console.log(JSON.stringify({ ready, browserReady, engineReady, checks }, null, 2));
} else {
  console.log('Mesa · preflight de verificación en navegador\n');
  for (const check of checks) {
    console.log(`  ${check.ok ? '✔' : '✘'} ${check.label.padEnd(32)} ${check.detail}`);
    if (!check.ok && check.fix) console.log(`      → ${check.fix}`);
  }
  console.log('');
  if (ready) {
    console.log('Listo: `bun run test:e2e` puede ejecutarse.');
    if (!process.env.MESA_BROWSER) console.log('Sugerencia: usa un navegador ya instalado, MESA_BROWSER=msedge (Windows/Edge) o MESA_BROWSER=chrome.');
  } else {
    console.log('No listo para E2E. Bloqueos:');
    if (!browserReady) console.log('  · no hay navegador: instala uno o ejecuta en una máquina con Edge/Chrome (MESA_BROWSER=msedge).');
    if (!engineReady) console.log('  · falta el artefacto WASM: `bun run engine:build` (no se versiona, ver docs/BROWSER-RUNBOOK.md).');
  }
}

process.exit(ready ? 0 : 1);

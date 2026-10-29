#!/usr/bin/env bun
/** Run the native parity harness across deterministic seeds and save a report. */
const cargo = process.env.CARGO ?? 'cargo';
const seeds = (process.env.PARITY_SEEDS ?? '42,7,123').split(',').map(Number);
const steps = process.env.PARITY_STEPS ?? '80';
const args = [cargo, 'run', '-p', 'mtg-engine-wasm', '--bin', 'parity', '-j', '1'];
if (process.env.CARGO_OFFLINE === '1') args.push('--offline', '--config', '.cargo/offline.toml');
args.push('--', 'data/mtgjson/test_fixture.json', 'static/data/decks.json');

const env = {
  ...process.env,
  CARGO_BUILD_JOBS: '1',
  CARGO_INCREMENTAL: '0',
  RUSTFLAGS: [
    process.env.RUSTFLAGS,
    '-Zcrate-attr=feature(if_let_guard)',
    '-Zcrate-attr=feature(let_chains)',
    '-Zthreads=1',
    '-Zshare-generics',
    '-Zmir-opt-level=0'
  ].filter(Boolean).join(' ')
};

const reports: unknown[] = [];
for (const seed of seeds) {
  const result = Bun.spawnSync([...args, String(seed), steps], { stdout: 'pipe', stderr: 'inherit', env });
  if (result.exitCode !== 0) process.exit(result.exitCode ?? 1);
  reports.push(JSON.parse(result.stdout.toString()));
}
const report = { harness: 'direct Phase API vs raw wrapper ABI', reports };
await Bun.write('docs/parity-report.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));

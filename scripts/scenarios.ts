#!/usr/bin/env bun
/** Explicit mechanics parity scenarios (mana/casting/combat/targets/triggers/replacement/endgame). */
const cargo = process.env.CARGO ?? 'cargo';
const seed = process.env.SCENARIO_SEED ?? '42';
const args = [cargo, 'run', '-p', 'mtg-engine-wasm', '--bin', 'scenarios', '-j', '1'];
if (process.env.CARGO_OFFLINE === '1') args.push('--offline', '--config', '.cargo/offline.toml');
args.push('--', 'static/data/cards.json', seed);
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
const result = Bun.spawnSync(args, { stdout: 'pipe', stderr: 'inherit', env });
const text = result.stdout.toString();
try {
  const report = JSON.parse(text);
  await Bun.write('docs/scenarios-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch { console.error(text); }
if (result.exitCode !== 0) process.exit(result.exitCode ?? 1);

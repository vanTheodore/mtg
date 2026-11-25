#!/usr/bin/env bun
/** Generate isolated E2E states from Phase GameScenario; never builds a game in the UI. */
const cargo = process.env.CARGO ?? 'cargo';
const targetDir = process.env.CARGO_TARGET_DIR;
const args = [cargo, 'run', '-p', 'mtg-engine-wasm', '--bin', 'e2e_scenarios', '-j', '1'];
if (process.env.CARGO_OFFLINE === '1') args.push('--offline', '--config', '.cargo/offline.toml');
if (process.env.CARGO_LOCKED === '1') args.push('--locked');
args.push('--', 'static/data/cards.json', process.env.MESA_E2E_SCENARIOS_DIR ?? 'static/e2e-scenarios');
const env = {
  ...process.env,
  ...(targetDir ? { CARGO_TARGET_DIR: targetDir } : {}),
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
const result = Bun.spawnSync(args, { stdout: 'inherit', stderr: 'inherit', env });
if (result.exitCode !== 0) process.exit(result.exitCode ?? 1);

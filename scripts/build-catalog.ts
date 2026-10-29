#!/usr/bin/env bun
/** Export the minimal Phase card catalog + UI metadata from the pinned fixture. */
const cargo = process.env.CARGO ?? 'cargo';
const input = process.argv[2] ?? 'data/mtgjson/test_fixture.json';
const out = process.argv[3] ?? 'static/data';

const args = [cargo, 'run', '-p', 'mtg-engine-wasm', '--bin', 'catalog', '-j', '1'];
if (process.env.CARGO_OFFLINE === '1') args.push('--offline', '--config', '.cargo/offline.toml');
args.push('--', input, out);

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

const result = Bun.spawnSync(args, { stdout: 'inherit', stderr: 'inherit', env });
process.exit(result.exitCode ?? 1);

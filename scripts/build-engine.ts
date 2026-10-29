#!/usr/bin/env bun
/**
 * Build the Phase WASM bridge without wasm-bindgen.
 *
 * The upstream engine uses nightly-only `if let` guards. We inject the feature
 * gates through RUSTFLAGS instead of rewriting rules code. A nightly toolchain
 * with rust-src is required when prebuilt wasm32 std is unavailable;
 * `-Z build-std` compiles it from source.
 */
const cargo = process.env.CARGO ?? 'cargo';
const profile = process.env.ENGINE_PROFILE ?? 'release';
const target = 'wasm32-unknown-unknown';
const targetDir = process.env.CARGO_TARGET_DIR ?? 'target';

const featureFlags = [
  '-Zcrate-attr=feature(if_let_guard)',
  '-Zcrate-attr=feature(let_chains)',
  '-Zthreads=1',
  '-Zshare-generics',
  '-Zmir-opt-level=0'
];
const wasmFlags = [
  '-C', 'link-arg=-z',
  '-C', 'link-arg=stack-size=16777216',
  '--cfg', 'getrandom_backend="custom"'
];

const args = [
  cargo, 'build',
  '--target', target,
  '-p', 'mtg-engine-wasm',
  '--lib',
  '--profile', profile,
  '-j', '1',
  '-Z', 'build-std=core,alloc,std,panic_abort'
];
if (process.env.CARGO_OFFLINE === '1') args.push('--offline', '--config', '.cargo/offline.toml');
if (process.env.CARGO_LOCKED === '1') args.push('--locked');

const env = {
  ...process.env,
  CARGO_BUILD_JOBS: '1',
  CARGO_INCREMENTAL: '0',
  RUSTFLAGS: [process.env.RUSTFLAGS, ...featureFlags, ...wasmFlags].filter(Boolean).join(' ')
};

console.log(`Building mtg-engine-wasm (${profile}, ${target})…`);
const result = Bun.spawnSync(args, { stdout: 'inherit', stderr: 'inherit', env });
if (result.exitCode !== 0) process.exit(result.exitCode ?? 1);

const src = `${targetDir}/${target}/${profile}/mtg_engine_wasm.wasm`;
const out = 'static/wasm/mtg_engine_wasm.wasm';
await Bun.write(out, Bun.file(src));
const bytes = Bun.file(out).size;
console.log(`Wrote ${out} (${(bytes / 1024 / 1024).toFixed(2)} MiB)`);

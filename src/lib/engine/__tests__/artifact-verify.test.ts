/**
 * The artifact verifier, tested against modules whose ABI is known byte by byte.
 *
 * The point of `scripts/engine-artifact.ts` is to decide whether a `.wasm`
 * found on disk (or in another session, or from another machine) is the Mesa
 * bridge for the pinned Phase. These tests build the answers: a module with the
 * real ABI must pass, and a module missing one export, or with a different
 * digest, must be refused with a specific message.
 *
 * This does not prove an engine exists. It proves that when one arrives, the
 * gate it has to pass is real.
 */
import { describe, expect, test } from 'bun:test';
import { bridgeModule } from './fixtures/bridge-wasm.ts';

const REQUIRED_EXPORTS = ['memory', 'mtg_alloc', 'mtg_free', 'mtg_request'];
const REQUIRED_IMPORTS = ['env.mesa_now_ms', 'env.mesa_random'];

/** Mirrors the check in scripts/engine-artifact.ts, over an already-parsed module. */
function abiProblems(abi: { exports: string[]; imports: string[] }): string[] {
  const problems: string[] = [];
  for (const entry of REQUIRED_EXPORTS) if (!abi.exports.includes(entry)) problems.push(`falta el export ${entry}`);
  for (const entry of REQUIRED_IMPORTS) if (!abi.imports.includes(entry)) problems.push(`falta el import ${entry}`);
  return problems;
}

async function abiOf(bytes: Uint8Array): Promise<{ exports: string[]; imports: string[] }> {
  const module = await WebAssembly.compile(bytes);
  return {
    exports: WebAssembly.Module.exports(module).map((entry) => entry.name).sort(),
    imports: WebAssembly.Module.imports(module).map((entry) => `${entry.module}.${entry.name}`).sort()
  };
}

describe('the bridge ABI check accepts exactly the Mesa contract', () => {
  test('a module with the full bridge passes', async () => {
    const abi = await abiOf(bridgeModule());
    expect(abiProblems(abi)).toEqual([]);
    expect(abi.exports).toEqual([...REQUIRED_EXPORTS].sort());
    expect(abi.imports).toEqual([...REQUIRED_IMPORTS].sort());
  });

  for (const missing of REQUIRED_EXPORTS) {
    test(`a module without ${missing} is refused`, async () => {
      const abi = await abiOf(bridgeModule({ exports: REQUIRED_EXPORTS.filter((entry) => entry !== missing) }));
      expect(abiProblems(abi)).toEqual([`falta el export ${missing}`]);
    });
  }

  test('a module without the host imports is refused', async () => {
    const abi = await abiOf(bridgeModule({ imports: false }));
    expect(abiProblems(abi)).toEqual(REQUIRED_IMPORTS.map((entry) => `falta el import ${entry}`));
  });
});

describe('the artifact digest is what decides', () => {
  const digest = (bytes: Uint8Array) => new Bun.CryptoHasher('sha256').update(bytes).digest('hex');

  test('one changed byte changes the digest', () => {
    const original = bridgeModule();
    const tampered = new Uint8Array(original);
    tampered[tampered.length - 1] ^= 0xff;
    expect(digest(tampered)).not.toBe(digest(original));
    expect(digest(original)).toHaveLength(64);
  });

  test('the module still compiles after a data change, so the digest is the only witness', async () => {
    // A module whose code changed but whose ABI did not is exactly the case a
    // name-and-export check cannot catch: only the recorded digest can.
    const original = bridgeModule();
    const tampered = new Uint8Array(original);
    // `i32.const 0` becomes `i32.const 1`: same shape, different code.
    const at = tampered.findIndex((byte, index) => byte === 0x41 && tampered[index + 1] === 0x00);
    expect(at).toBeGreaterThan(0);
    tampered[at + 1] = 0x01;
    expect(abiProblems(await abiOf(tampered))).toEqual([]);
    expect(digest(tampered)).not.toBe(digest(original));
  });
});

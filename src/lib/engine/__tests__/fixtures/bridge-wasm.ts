/**
 * A minimal WASM module with *exactly* the Mesa bridge ABI, built by hand.
 *
 * It exists so the artifact verifier can be tested without a 46 MB engine: the
 * checks under test are "does this module export `mtg_request` and import
 * `env.mesa_random`", not "does this module play Magic". Every byte below is
 * the WebAssembly binary format, written by hand so the test needs no toolchain.
 *
 * Never install this as the engine: `docs/wasm-artifact.json` records the digest
 * of a real build, and this module cannot answer a single request.
 */

/** LEB128 unsigned. */
function uleb(value: number): number[] {
  const out: number[] = [];
  let rest = value;
  do {
    let byte = rest & 0x7f;
    rest >>>= 7;
    if (rest !== 0) byte |= 0x80;
    out.push(byte);
  } while (rest !== 0);
  return out;
}

function section(id: number, payload: number[]): number[] {
  return [id, ...uleb(payload.length), ...payload];
}

function vector(items: number[][]): number[] {
  return [...uleb(items.length), ...items.flat()];
}

function name(text: string): number[] {
  const bytes = [...new TextEncoder().encode(text)];
  return [...uleb(bytes.length), ...bytes];
}

export const I32 = 0x7f;
export const I64 = 0x7e;

/**
 * @param exports Which exports to emit. Defaults to the full bridge; passing a
 *   subset is how a test builds an "almost right" module the verifier must refuse.
 */
export function bridgeModule(options: { exports?: string[]; imports?: boolean } = {}): Uint8Array {
  const exported = options.exports ?? ['memory', 'mtg_alloc', 'mtg_free', 'mtg_request'];
  const withImports = options.imports ?? true;

  // Types: (i32)->i32, (i32,i32)->(), (i32,i32,i32)->i64, ()->i32, (i32,i32)->i32
  const types = vector([
    [0x60, 1, I32, 1, I32],
    [0x60, 2, I32, I32, 0],
    [0x60, 3, I32, I32, I32, 1, I64],
    [0x60, 0, 1, I32],
    [0x60, 2, I32, I32, 1, I32]
  ]);

  const imports = withImports
    ? vector([
        [...name('env'), ...name('mesa_now_ms'), 0x00, 3],
        [...name('env'), ...name('mesa_random'), 0x00, 4]
      ])
    : [0];

  // Two local functions: one per allocator export, so the export table is real.
  // Index space: two imports first (0, 1), then these three (2, 3, 4).
  const functions = vector([[0], [1], [2]]);

  const memory = [0x01, 0x00, 0x01]; // vector: one memory, flags 0, min 1 page

  // Without imports the local functions start at index 0, so the export table
  // has to move with them.
  const base = withImports ? 2 : 0;
  const kinds: Record<string, [number, number]> = {
    memory: [0x02, 0],
    mtg_alloc: [0x00, base],
    mtg_free: [0x00, base + 1],
    mtg_request: [0x00, base + 2]
  };
  const exports = vector(
    exported.map((entry) => {
      const [kind, index] = kinds[entry] ?? [0x00, 0];
      return [...name(entry), kind, ...uleb(index)];
    })
  );

  // Each body starts with its local declaration count (none here).
  const bodies = [
    [0x00, 0x41, 0x00, 0x0b], // i32.const 0; end
    [0x00, 0x0b], // end
    [0x00, 0x42, 0x00, 0x0b] // i64.const 0; end
  ];
  const code = vector(bodies.map((body) => [...uleb(body.length), ...body]));

  return new Uint8Array([
    0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
    ...section(1, types),
    ...(withImports ? section(2, imports) : []),
    ...section(3, functions),
    ...section(5, memory),
    ...section(7, exports),
    ...section(10, code)
  ]);
}

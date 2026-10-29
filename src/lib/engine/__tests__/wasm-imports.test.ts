import { describe, expect, test } from 'bun:test';
import { buildImports, type ImportDescriptor } from '../wasm-imports';

const host = () => {
  const memory = new ArrayBuffer(256);
  return { now: () => 1234.5, random: (dest: Uint8Array) => { dest.fill(7); return 0; }, memory: () => memory, buffer: memory };
};
const fn = (module: string, name: string): ImportDescriptor => ({ module, name, kind: 'function' });

describe('strict WASM imports', () => {
  test('unknown imports fail at boot instead of returning zero', () => {
    expect(() => buildImports([fn('env', 'unknown_host_call')], host())).toThrow(/desconocido/);
    expect(() => buildImports([fn('__wbindgen_placeholder__', '__wbg_future_feature_abcd')], host())).toThrow(/desconocido/);
    expect(() => buildImports([fn('other', 'anything')], host())).toThrow(/Módulo WASM desconocido/);
  });

  test('host entropy fills the requested slice and reports success', () => {
    const h = host();
    const imports = buildImports([fn('env', 'mesa_random'), fn('env', 'mesa_now_ms')], h);
    const env = imports.env as Record<string, (...args: number[]) => number>;
    expect(env.mesa_random(8, 16)).toBe(0);
    expect([...new Uint8Array(h.buffer, 8, 16)]).toEqual(Array(16).fill(7));
    expect(env.mesa_random(250, 16)).toBe(1);
    expect(env.mesa_now_ms()).toBe(1234.5);
  });

  test('externref clone/drop reuses freed slots', () => {
    const imports = buildImports([
      fn('__wbindgen_placeholder__', '__wbg_performance_123abc'),
      fn('__wbindgen_placeholder__', '__wbindgen_object_clone_ref'),
      fn('__wbindgen_placeholder__', '__wbindgen_object_drop_ref'),
      fn('__wbindgen_externref_xform__', '__wbindgen_externref_table_grow'),
      fn('__wbindgen_placeholder__', '__wbg___wbindgen_is_undefined_35bb9f4c7fd651d5'),
      fn('__wbindgen_placeholder__', '__wbg___wbindgen_throw_9c31b086c2b26051')
    ], host());
    const p = imports.__wbindgen_placeholder__ as Record<string, (...args: number[]) => number>;
    const x = imports.__wbindgen_externref_xform__ as Record<string, (...args: number[]) => number>;
    const idx = p.__wbg_performance_123abc();
    const clone = p.__wbindgen_object_clone_ref(idx);
    expect(clone).not.toBe(idx);
    p.__wbindgen_object_drop_ref(clone);
    expect(p.__wbindgen_object_clone_ref(idx)).toBe(clone);
    expect(x.__wbindgen_externref_table_grow__(2)).toBeGreaterThan(0);
  });
});

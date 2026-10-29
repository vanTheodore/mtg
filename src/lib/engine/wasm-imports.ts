export interface ImportDescriptor { module: string; name: string; kind: string }
export interface ImportHost {
  now(): number;
  /** Fill dest[0..len] with OS entropy. Return 0 on success, nonzero on failure. */
  random(dest: Uint8Array): number;
  memory(): ArrayBuffer;
}

type Handler = (...args: number[]) => number | void;
const MAX_REF_TABLE = 1 << 20;

function matches(name: string, base: string): boolean {
  return name === base || (name.startsWith(base + '_') && /^[A-Za-z0-9]+$/.test(name.slice(base.length + 1)));
}

/**
 * Raw wasm-bindgen placeholders for web-time plus Mesa host imports. Unknown
 * imports are a boot error, never a silent zero. The externref table is a small
 * host-side reference table because we intentionally do not ship bindgen glue.
 */
export function buildImports(descriptors: ImportDescriptor[], host: ImportHost): WebAssembly.Imports {
  const heap: unknown[] = [undefined];
  const free: number[] = [];
  const ref = (value: unknown) => {
    const idx = free.pop();
    if (idx !== undefined) { heap[idx] = value; return idx; }
    if (heap.length >= MAX_REF_TABLE) throw new Error('Tabla de referencias WASM agotada');
    heap.push(value); return heap.length - 1;
  };
  const get = (idx: number) => {
    if (!Number.isInteger(idx) || idx < 0 || idx >= heap.length) throw new Error(`Referencia WASM inválida: ${idx}`);
    return heap[idx];
  };
  const drop = (idx: number) => { get(idx); heap[idx] = undefined; free.push(idx); };
  const env: Record<string, Handler> = {
    mesa_now_ms: () => host.now(),
    mesa_random: (ptr, len) => {
      if (!Number.isInteger(ptr) || !Number.isInteger(len) || ptr < 0 || len < 0 || ptr + len > host.memory().byteLength) return 1;
      try { return host.random(new Uint8Array(host.memory(), ptr, len)); } catch { return 1; }
    }
  };
  const placeholder: Record<string, Handler> = {
    __wbindgen_describe: () => {},
    __wbindgen_object_drop_ref: drop,
    __wbindgen_object_clone_ref: (idx) => ref(get(idx)),
    __wbindgen_throw: (ptr, len) => {
      if (ptr < 0 || len < 0 || ptr + len > host.memory().byteLength) throw new Error('Throw WASM fuera de memoria');
      throw new Error(new TextDecoder().decode(new Uint8Array(host.memory(), ptr, len)));
    }
  };
  const xform: Record<string, Handler> = {
    __wbindgen_externref_table_grow__: (delta) => {
      if (!Number.isInteger(delta) || delta < 0 || heap.length + delta > MAX_REF_TABLE) throw new Error('Crecimiento de tabla WASM inválido');
      const old = heap.length; for (let i = 0; i < delta; i++) heap.push(undefined); return old;
    },
    __wbindgen_externref_table_set_null__: (idx) => { heap[idx] = undefined; }
  };
  const dynamic: [string, Handler][] = [
    ['__wbg_performance', () => ref(performance)],
    ['__wbg_now', (idx) => { const p = get(idx); if (typeof p !== 'object' || p === null || typeof (p as Performance).now !== 'function') throw new Error('performance.now WASM inválido'); return (p as Performance).now(); }],
    ['__wbg_static_accessor_GLOBAL_THIS', () => ref(globalThis)],
    ['__wbg_static_accessor_GLOBAL', () => ref(globalThis)],
    ['__wbg_static_accessor_SELF', () => ref(globalThis)],
    ['__wbg_static_accessor_WINDOW', () => ref(undefined)],
    ['__wbg_is_undefined', (idx) => get(idx) === undefined ? 1 : 0],
    ['__wbg___wbindgen_is_undefined', (idx) => get(idx) === undefined ? 1 : 0],
    ['__wbg___wbindgen_throw', (ptr, len) => {
      if (ptr < 0 || len < 0 || ptr + len > host.memory().byteLength) throw new Error('Throw WASM fuera de memoria');
      throw new Error(new TextDecoder().decode(new Uint8Array(host.memory(), ptr, len)));
    }]
  ];
  for (const d of descriptors) {
    if (d.kind !== 'function') throw new Error(`Import WASM no soportado: ${d.module}.${d.name} (${d.kind})`);
    if (d.module === 'env') {
      if (!env[d.name]) throw new Error(`Import env desconocido: ${d.name}`);
      continue;
    }
    if (d.module === '__wbindgen_placeholder__') {
      if (placeholder[d.name]) continue;
      const found = dynamic.find(([base]) => matches(d.name, base));
      if (!found) throw new Error(`Import wasm-bindgen desconocido: ${d.name}`);
      placeholder[d.name] = found[1];
      continue;
    }
    if (d.module === '__wbindgen_externref_xform__') {
      if (xform[d.name]) continue;
      const base = Object.keys(xform).find((k) => matches(d.name, k.replace(/__$/, '')));
      if (!base) throw new Error(`Import externref desconocido: ${d.name}`);
      xform[d.name] = xform[base];
      continue;
    }
    throw new Error(`Módulo WASM desconocido: ${d.module}.${d.name}`);
  }
  return { env, __wbindgen_placeholder__: placeholder, __wbindgen_externref_xform__: xform };
}

/**
 * Catalog packs: the client loads only the cards a deck actually needs.
 *
 * Phase takes the whole card database as one JSON object (`AtomicCards` shape:
 * `{ [name]: CardFace[] }`). Sending a 30k-card database into a second WASM
 * instance for a 40-card duel is the wrong trade, so the database is split into
 * packs plus a small index that maps every card name to the pack holding it.
 * At game start we resolve the deck's names against the index, fetch only the
 * matching packs and merge them into the single object the engine expects.
 *
 * This module is pure: no `fetch`, no `localStorage`. Callers pass a fetcher so
 * the selection logic is unit-testable without a browser.
 *
 * Rules never live here. The engine still decides legality, and a pack marked
 * `verified: false` is searchable but explicitly not certified for play.
 */

/**
 * One entry exactly as Phase deserializes it: `CardExportEntry`, i.e. a card
 * face flattened together with `legalities`, `layout`, `face_index`, `printings`,
 * `rulings` and `bracket_signals`. Kept loose on purpose — the engine owns the
 * schema and validates it at load time.
 */
export type CatalogFace = Record<string, unknown> & { name?: string };
/** The map `CardDatabase::from_json_str` reads: canonical name → entry. */
export type Catalog = Record<string, CatalogFace>;

export interface CatalogPackMeta {
  /** Stable id; also the file name under `/data/catalog/packs/`. */
  id: string;
  label: string;
  /** Card names whose faces live in this pack (original casing). */
  names: string[];
  /** Source set code when the pack comes from a real set, `null` for curated packs. */
  set: string | null;
  /** Cards that are always loaded (basic lands and other deck staples). */
  core: boolean;
  /**
   * `true` only when the pack's cards passed the Phase coverage gate and a real
   * game exercised them. Search can show unverified cards; starting a game with
   * them is what this flag gates.
   */
  verified: boolean;
  /** Faces in the pack, for progress and sanity checks. */
  faces: number;
  bytes: number;
  sha256: string;
  source: string;
}

export interface CatalogIndex {
  version: number;
  generated_at: string;
  /** Engine payload format the packs are written in. */
  format: 'atomic';
  packs: CatalogPackMeta[];
}

export interface CatalogLoadPlan {
  /** Packs that must be fetched for the requested names. */
  required: string[];
  /** Names the index cannot serve. Never silently dropped by the caller. */
  missing: string[];
}

export interface LoadedCatalog {
  catalog: Catalog;
  packs: string[];
  /** Names the index did not cover; the engine would silently skip them. */
  missing: string[];
  bytes: number;
}

const normalizeName = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase('en-US');

/**
 * Split a deck entry into the canonical names the database stores. Phase keys
 * multi-face cards per face ("giant killer" + "chop down"), while deck lists
 * write the combined printed name ("Giant Killer // Chop Down").
 */
export function faceNames(name: string): string[] {
  const parts = name.split('//').map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : [name];
}

/**
 * Decide the minimum set of packs. Basic-land packs (and any other `core` pack)
 * are always included because decks grow lands during play.
 */
export function planLoad(index: CatalogIndex, names: readonly string[]): CatalogLoadPlan {
  const byName = new Map<string, string>();
  const core: string[] = [];
  for (const pack of index.packs) {
    if (pack.core) core.push(pack.id);
    for (const name of pack.names) {
      const key = normalizeName(name);
      if (!byName.has(key)) byName.set(key, pack.id);
    }
  }
  const required = new Set<string>(core);
  const missing: string[] = [];
  for (const name of names) {
    // Any face of a multi-face card is enough to load its pack.
    const packs = faceNames(name).map((face) => byName.get(normalizeName(face))).filter(Boolean) as string[];
    if (packs.length) for (const pack of packs) required.add(pack);
    else missing.push(name);
  }
  // Keep index order so the fetch sequence is deterministic and easy to trace.
  return {
    required: index.packs.filter((pack) => required.has(pack.id)).map((pack) => pack.id),
    missing: [...new Set(missing)]
  };
}

/** Merge packs into one map. The first pack wins; a later identical entry is ignored. */
export function mergePacks(packs: Catalog[]): Catalog {
  const merged: Catalog = {};
  for (const pack of packs) {
    for (const [name, entry] of Object.entries(pack)) {
      if (!(name in merged)) merged[name] = entry;
    }
  }
  return merged;
}

export type Fetcher = (url: string) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;

const packUrl = (id: string) => `/data/catalog/packs/${id}.json`;

/** Process-wide cache so repeated starts in one tab do not refetch packs. */
const packCache = new Map<string, Promise<Catalog>>();

export function clearCatalogCache() { packCache.clear(); }

async function fetchJson(fetcher: Fetcher, url: string): Promise<unknown> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`No se pudo cargar ${url} (HTTP ${response.status ?? '?'})`);
  return response.json();
}

/**
 * Load the packs needed for `names`, plus the index itself.
 *
 * `corePacksOnly` is used by the deck builder before a deck exists: it loads the
 * searchable packs only, so opening the builder never pulls the whole catalog.
 */
export async function loadCatalog(
  fetcher: Fetcher,
  names: readonly string[],
  options: { indexUrl?: string; corePacksOnly?: boolean; allPacks?: boolean; onProgress?: (loaded: string, total: number) => void } = {}
): Promise<LoadedCatalog> {
  const indexUrl = options.indexUrl ?? '/data/catalog/index.json';
  const index = (await fetchJson(fetcher, indexUrl)) as CatalogIndex;
  if (!index || !Array.isArray(index.packs)) throw new Error('Índice de catálogo inválido');
  const plan = options.allPacks
    ? { required: index.packs.map((pack) => pack.id), missing: [] }
    : options.corePacksOnly
      ? { required: index.packs.filter((pack) => pack.core).map((pack) => pack.id), missing: [] }
      : planLoad(index, names);

  let loaded = 0;
  const packs = await Promise.all(plan.required.map(async (id) => {
    let pending = packCache.get(id);
    if (!pending) {
      pending = fetchJson(fetcher, packUrl(id)).then((payload) => payload as Catalog);
      packCache.set(id, pending);
      // A failed download must not poison the cache for a retry.
      pending.catch(() => packCache.delete(id));
    }
    const pack = await pending;
    loaded += 1;
    options.onProgress?.(id, plan.required.length);
    return pack;
  }));

  const bytes = plan.required.reduce((sum, id) => sum + (index.packs.find((pack) => pack.id === id)?.bytes ?? 0), 0);
  return { catalog: mergePacks(packs), packs: plan.required, missing: plan.missing, bytes };
}

/** Names covered by the index, for the deck builder's search over unloaded packs. */
export function searchableNames(index: CatalogIndex): string[] {
  return [...new Set(index.packs.flatMap((pack) => pack.names))];
}

export function packFor(index: CatalogIndex, name: string): CatalogPackMeta | undefined {
  const key = normalizeName(name);
  return index.packs.find((pack) => pack.names.some((candidate) => normalizeName(candidate) === key));
}

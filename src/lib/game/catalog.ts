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
 *
 * Name resolution lives in `canonical.ts`: this module consumes the canonical
 * index instead of keeping a second, silently different answer.
 */
import { canonicalIndex, mergeCatalogs, normalizeName, type MergeConflict, type MergeResult } from './canonical.ts';

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
  /**
   * Names this pack would carry but another pack already owns, grouped by owner.
   * The pack payload does not contain them: one name must resolve to one face.
   */
  overlap?: Record<string, string[]>;
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
  /**
   * Packs that hold the requested cards but are not play-certified.
   * `verified: false` means "the pack exists and the engine may read it, but no
   * Phase parse + real game has certified these cards yet". Search may show
   * them; a game must not start pretending they are covered.
   */
  unverifiedPacks: string[];
  /** Requested card names that live in unverified packs, in deck order. */
  unverified: string[];
}

export interface LoadedCatalog {
  catalog: Catalog;
  packs: string[];
  /** Names served by more than one loaded pack, with what differed. Empty is normal. */
  conflicts: MergeConflict[];
  /** Names the index did not cover; the engine would silently skip them. */
  missing: string[];
  /** Requested names served only by packs that are not play-certified. */
  unverified: string[];
  /** Ids of the packs behind `unverified`. */
  unverifiedPacks: string[];
  bytes: number;
  /** Index the plan came from, so callers can search names without loading packs. */
  index: CatalogIndex;
}

export { normalizeName } from './canonical.ts';

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
  // One canonical owner per name, shared with the builder (`canonicalIndex`), so
  // "the pack the search shows" and "the pack the game loads" cannot diverge.
  const canonical = canonicalIndex(index);
  const core: string[] = index.packs.filter((pack) => pack.core).map((pack) => pack.id);
  const byName = new Map<string, string>([...canonical.byName].map(([key, entry]) => [key, entry.pack]));
  const required = new Set<string>(core);
  const missing: string[] = [];
  const unverified = new Set<string>();
  const verifiedById = new Map(index.packs.map((pack) => [pack.id, pack.verified === true]));
  for (const name of names) {
    // Any face of a multi-face card is enough to load its pack.
    const packs = faceNames(name).map((face) => byName.get(normalizeName(face))).filter(Boolean) as string[];
    if (packs.length) {
      for (const pack of packs) {
        required.add(pack);
        if (!verifiedById.get(pack)) unverified.add(name);
      }
    } else missing.push(name);
  }
  // Keep index order so the fetch sequence is deterministic and easy to trace.
  const ordered = index.packs.filter((pack) => required.has(pack.id)).map((pack) => pack.id);
  const unverifiedPacks = index.packs.filter((pack) => required.has(pack.id) && !pack.verified).map((pack) => pack.id);
  return {
    required: ordered,
    missing: [...new Set(missing)],
    unverified: [...unverified],
    unverifiedPacks
  };
}

/**
 * Merge packs into one map, first wins, reporting every overwrite.
 * `mergeCatalogs` is the single implementation; this keeps the old call shape
 * from silently dropping duplicates.
 */
export function mergePacks(packs: Catalog[], ids?: readonly string[]): MergeResult {
  const inputs = packs.map((catalog, position) => ({ id: ids?.[position] ?? `pack-${position}`, catalog }));
  return mergeCatalogs(inputs);
}

export type Fetcher = (url: string) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>;

const packUrl = (id: string) => `/data/catalog/packs/${id}.json`;

/**
 * Process-wide cache so repeated starts in one tab do not refetch packs.
 * The key carries the pack's identity (id + digest + index version): a rebuilt
 * pack with different bytes must never be served from a stale entry.
 */
const packCache = new Map<string, Promise<Catalog>>();

const cacheKey = (pack: CatalogPackMeta, indexVersion: number) => `${indexVersion}:${pack.id}:${pack.sha256 ?? ''}`;

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
    ? { required: index.packs.map((pack) => pack.id), missing: [], unverified: [], unverifiedPacks: [] }
    : options.corePacksOnly
      ? { required: index.packs.filter((pack) => pack.core).map((pack) => pack.id), missing: [], unverified: [], unverifiedPacks: [] }
      : planLoad(index, names);

  let loaded = 0;
  const packs = await Promise.all(plan.required.map(async (id) => {
    const meta = index.packs.find((pack) => pack.id === id);
    const key = meta ? cacheKey(meta, index.version) : `${index.version}:${id}`;
    let pending = packCache.get(key);
    if (!pending) {
      pending = fetchJson(fetcher, packUrl(id)).then((payload) => payload as Catalog);
      packCache.set(key, pending);
      // A failed download must not poison the cache for a retry.
      pending.catch(() => packCache.delete(key));
    }
    const pack = await pending;
    loaded += 1;
    options.onProgress?.(id, plan.required.length);
    return pack;
  }));

  const bytes = plan.required.reduce((sum, id) => sum + (index.packs.find((pack) => pack.id === id)?.bytes ?? 0), 0);
  const merged = mergePacks(packs, plan.required);
  return {
    catalog: merged.catalog,
    conflicts: merged.conflicts,
    packs: plan.required,
    missing: plan.missing,
    unverified: plan.unverified ?? [],
    unverifiedPacks: plan.unverifiedPacks ?? [],
    bytes,
    index
  };
}

/**
 * Fetch exactly one pack, for the builder's "select then load" flow. Uses the
 * same cache as a game start, so a card picked here is already paid for when the
 * game begins.
 */
export async function loadPack(fetcher: Fetcher, index: CatalogIndex, id: string): Promise<Catalog> {
  const meta = index.packs.find((pack) => pack.id === id);
  if (!meta) throw new Error(`El índice no conoce el pack ${id}`);
  const key = cacheKey(meta, index.version);
  let pending = packCache.get(key);
  if (!pending) {
    pending = fetchJson(fetcher, packUrl(id)).then((payload) => payload as Catalog);
    packCache.set(key, pending);
    pending.catch(() => packCache.delete(key));
  }
  return pending;
}

/** Names covered by the index, for the deck builder's search over unloaded packs. */
export function searchableNames(index: CatalogIndex): string[] {
  return [...new Set(index.packs.flatMap((pack) => pack.names))];
}

export function packFor(index: CatalogIndex, name: string): CatalogPackMeta | undefined {
  const key = normalizeName(name);
  return index.packs.find((pack) => pack.names.some((candidate) => normalizeName(candidate) === key));
}

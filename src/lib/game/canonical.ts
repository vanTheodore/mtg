/**
 * One canonical answer to "which card is `serra angel`?".
 *
 * The same printed name can appear in more than one pack: the curated fixture
 * and a real set overlap (9 names today), and a full catalog would overlap far
 * more. The engine keys its database by name, so a name must resolve to exactly
 * one face, and every consumer — loader, builder, test, WASM run — has to agree.
 * Before this module the loader kept the *first* pack that mentioned a name while
 * the builder silently kept the *last*, so a card could be searched with one
 * rules text and played with another.
 *
 * Identity here has two parts, and they are not the same thing:
 *  - **Oracle identity**: `scryfall_oracle_id` when the source carries it. It is
 *    what makes two printings the same card. MTGJSON v3 (the offline Spanish
 *    source) has no Scryfall ids, so a real-set face may legitimately have none;
 *    we report `null` instead of inventing one.
 *  - **Printing provenance**: the pack (and therefore the set) the face came
 *    from. It answers "which printed object is this", not "which card is this".
 *
 * The generator removes overlap when it appends a set (`overlap` in the pack
 * meta), so the shipped catalog has no duplicates at all. This module still
 * detects and reports them, because a hand-built index, an old pack or a future
 * multi-set pack can reintroduce them — and that must be loud, never silent.
 */
import type { Catalog, CatalogFace, CatalogIndex } from './catalog.ts';

export const normalizeName = (name: string) => name.normalize('NFKC').trim().toLocaleLowerCase('en-US');

export interface CanonicalEntry {
  /** Lower-cased key the engine uses. */
  key: string;
  /** Original casing, as the owning pack spells it. */
  name: string;
  pack: string;
  set: string | null;
  verified: boolean;
}

export interface DuplicateName {
  name: string;
  /** The pack that owns the name (first in canonical order). */
  kept: string;
  /** Packs that also contain it; they never win. */
  dropped: string[];
}

export interface CanonicalIndex {
  byName: Map<string, CanonicalEntry>;
  /** Names served by more than one pack. Empty means the index is disjoint. */
  duplicates: DuplicateName[];
}

/**
 * Pack order decides ownership: `core` packs first (they carry the basics every
 * deck needs), then index order. The generator writes the index in the same
 * order and drops overlap, so in practice the map has no duplicates at all.
 */
function canonicalOrder(index: CatalogIndex): CatalogIndex['packs'] {
  return [...index.packs].sort((a, b) => Number(b.core) - Number(a.core));
}

export function canonicalIndex(index: CatalogIndex): CanonicalIndex {
  const byName = new Map<string, CanonicalEntry>();
  const dropped = new Map<string, string[]>();
  for (const pack of canonicalOrder(index)) {
    for (const name of pack.names) {
      const key = normalizeName(name);
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, { key, name, pack: pack.id, set: pack.set, verified: pack.verified });
        continue;
      }
      if (existing.pack === pack.id) continue;
      const list = dropped.get(key) ?? [];
      if (!list.includes(pack.id)) list.push(pack.id);
      dropped.set(key, list);
    }
  }
  const duplicates: DuplicateName[] = [...dropped.entries()].map(([key, packs]) => ({
    name: byName.get(key)!.name,
    kept: byName.get(key)!.pack,
    dropped: packs
  }));
  return { byName, duplicates };
}

export function canonicalFor(index: CanonicalIndex, name: string): CanonicalEntry | undefined {
  return index.byName.get(normalizeName(name));
}

/** The Oracle id a face declares, or `null` when the source does not carry one. */
export function oracleIdOf(face: CatalogFace | undefined): string | null {
  const value = face?.scryfall_oracle_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** What "the same card" means for two faces with the same name. */
export interface FaceIdentity {
  oracleId: string | null;
  /** Oracle text decides what the card does; a reprint can carry older wording. */
  rulesText: string;
  manaCost: string;
}

/**
 * Key order is an artefact of the exporter, not of the card: the fixture writes
 * `{type, shards, generic}` and the MTGJSON conversion writes `{generic, shards,
 * type}` for the same cost. Comparing raw JSON would report a conflict on every
 * shared card.
 */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export function faceIdentity(face: CatalogFace | undefined): FaceIdentity {
  return {
    oracleId: oracleIdOf(face),
    rulesText: typeof face?.oracle_text === 'string' ? face.oracle_text : '',
    manaCost: stableStringify(face?.mana_cost ?? null)
  };
}

/**
 * Why two faces with the same name are not interchangeable. `null` means they
 * are (`oracle_text` and cost identical; a missing Oracle id on one side is not
 * a contradiction, it is missing evidence).
 */
export function identityConflict(a: FaceIdentity, b: FaceIdentity): string | null {
  if (a.oracleId && b.oracleId && a.oracleId !== b.oracleId) return 'oracle_id';
  if (a.rulesText !== b.rulesText) return 'rules_text';
  if (a.manaCost !== b.manaCost) return 'mana_cost';
  return null;
}

export interface MergeInput {
  /** Pack id, so a conflict can name the file it came from. */
  id: string;
  catalog: Catalog;
}

export interface MergeConflict {
  name: string;
  kept: string;
  dropped: string;
  /** `null` when the two faces are the same card; otherwise what differs. */
  conflict: string | null;
  oracleIds: (string | null)[];
}

export interface MergeResult {
  catalog: Catalog;
  conflicts: MergeConflict[];
}

/**
 * Merge packs the way the engine will see them: first pack wins, every overwrite
 * is reported. The caller decides whether a conflict blocks a game; the merge
 * itself never hides one.
 */
export function mergeCatalogs(inputs: readonly MergeInput[]): MergeResult {
  const catalog: Catalog = {};
  const owner = new Map<string, string>();
  const conflicts: MergeConflict[] = [];
  for (const { id, catalog: pack } of inputs) {
    for (const [name, face] of Object.entries(pack)) {
      const previousOwner = owner.get(name);
      if (previousOwner === undefined) {
        catalog[name] = face;
        owner.set(name, id);
        continue;
      }
      const keptFace = catalog[name];
      conflicts.push({
        name,
        kept: previousOwner,
        dropped: id,
        conflict: identityConflict(faceIdentity(keptFace), faceIdentity(face)),
        oracleIds: [oracleIdOf(keptFace), oracleIdOf(face)]
      });
    }
  }
  return { catalog, conflicts };
}

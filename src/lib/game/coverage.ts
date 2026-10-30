/**
 * Per-card coverage, as Phase itself reports it.
 *
 * `pack.verified` says a pack was parsed and played once. It does **not** say
 * every card in it is fully supported, and treating it as if it did is exactly
 * the overclaim this phase is about. The real answer comes from Phase's
 * `analyze_coverage` (see `crates/mtg-engine-wasm/src/bin/coveragepack.rs`) and
 * is shipped per pack, content-addressed by the pack's own digest.
 *
 * Four states are kept apart, because they answer different questions:
 *
 *   present        the name is in a loaded pack              (index)
 *   parsed         Phase deserialized the face               (pack loads ⇒ true)
 *   coverage_known Phase knows which of its rules are missing (artifact)
 *   exercised      it was actually played in the certifying game (artifact)
 *
 * Policy for starting a game — conservative, and stated here so the UI cannot
 * quietly disagree with it:
 *
 *  - a card with `supported: true` is admitted;
 *  - a card with `supported: false` is **not admitted by default**: the start
 *    screen names it and its gaps, and the player has to opt in;
 *  - a card in a pack *without* an artifact is unknown, not incompatible (the
 *    brief's warning), so it is admitted and reported as "sin evidencia".
 *
 * `supported: false` means "the parser met something with no handler". It is
 * evidence of a known limitation, not a proof that the card is broken, and
 * nothing here claims more than that.
 */
import type { Catalog, CatalogIndex, CatalogPackMeta, Fetcher } from './catalog.ts';

export type { Fetcher };
import { canonicalIndex, normalizeName, type CanonicalEntry } from './canonical.ts';

export type CoverageLevel = 'supported' | 'limited' | 'unknown';

export interface CoverageCard {
  name: string;
  key: string;
  supported: boolean;
  gap_count: number;
  gaps: string[];
  exercised: boolean;
}

export interface CoverageDocument {
  pack: string;
  pack_sha256: string;
  pack_bytes: number;
  faces: number;
  summary: { cards: number; supported: number; with_known_gaps: number; exercised: number };
  cards: CoverageCard[];
}

/** Content-addressed: a rebuilt pack gets a different file name, so an HTTP
 *  cache can never answer a newer index with older coverage. */
export function coverageUrl(pack: CatalogPackMeta): string {
  return `/data/catalog/coverage/${pack.id}.${pack.sha256.slice(0, 8)}.json`;
}



/**
 * Load coverage for the packs a game is about to use. A missing artifact is
 * `null` (unknown), never an error: a catalog without coverage is still a
 * catalog, it simply carries less evidence.
 */
export async function loadCoverage(
  fetcher: Fetcher,
  packs: readonly CatalogPackMeta[]
): Promise<Map<string, CoverageDocument | null>> {
  const entries = await Promise.all(packs.map(async (pack) => {
    const url = coverageUrl(pack);
    try {
      const response = await fetcher(url);
      if (!response.ok) return [pack.id, null] as const;
      const document = JSON.parse(await response.text()) as CoverageDocument;
      // The name is content-addressed, so a mismatched digest means the server
      // answered with something else; refuse it instead of believing it.
      if (document.pack_sha256 !== pack.sha256) return [pack.id, null] as const;
      return [pack.id, document] as const;
    } catch {
      return [pack.id, null] as const;
    }
  }));
  return new Map(entries);
}

export interface CardAssessment {
  name: string;
  /** Pack that owns the name. */
  pack: string;
  level: CoverageLevel;
  gaps: string[];
  exercised: boolean;
}

export interface DeckAssessment {
  admitted: CardAssessment[];
  /** Known limitations: blocked by default. */
  limited: CardAssessment[];
  /** No artifact for the pack: admitted, but reported. */
  unknown: CardAssessment[];
  /** Names the index cannot serve at all. */
  missing: string[];
}

/**
 * Assess a deck list against the coverage of the packs that would serve it.
 * Only `supported` from Phase decides `limited`; a card is never called limited
 * because we lack data.
 */
export function assessDeck(
  names: readonly string[],
  index: CatalogIndex,
  coverage: Map<string, CoverageDocument | null>,
  /** Faces already in memory, used only to show the printed casing. */
  catalog?: Catalog
): DeckAssessment {
  // The index stores lower-cased keys; the face knows how the card is spelled.
  const display = (entry: CanonicalEntry) => {
    const face = catalog?.[normalizeName(entry.name)];
    return typeof face?.name === 'string' && face.name.length ? face.name : entry.name;
  };
  const canonical = canonicalIndex(index);
  const admitted: CardAssessment[] = [];
  const limited: CardAssessment[] = [];
  const unknown: CardAssessment[] = [];
  const missing: string[] = [];
  const byKey = new Map<string, CoverageCard>();
  for (const document of coverage.values()) {
    for (const card of document?.cards ?? []) byKey.set(card.key ?? normalizeName(card.name), card);
  }

  for (const name of names) {
    const entry: CanonicalEntry | undefined = canonical.byName.get(normalizeName(name));
    if (!entry) {
      if (!missing.includes(name)) missing.push(name);
      continue;
    }
    const document = coverage.get(entry.pack);
    if (!document) {
      unknown.push({ name: display(entry), pack: entry.pack, level: 'unknown', gaps: [], exercised: false });
      continue;
    }
    const card = byKey.get(normalizeName(entry.name));
    if (!card) {
      // The pack has an artifact but not this name: treat as unknown rather
      // than inventing support.
      unknown.push({ name: display(entry), pack: entry.pack, level: 'unknown', gaps: [], exercised: false });
      continue;
    }
    const assessment: CardAssessment = {
      name: display(entry),
      pack: entry.pack,
      level: card.supported ? 'supported' : 'limited',
      gaps: card.gaps,
      exercised: card.exercised
    };
    if (card.supported) admitted.push(assessment);
    else limited.push(assessment);
  }
  return { admitted, limited, unknown, missing };
}

/** Human sentence for the start-screen diagnostic. */
export function describeAssessment(assessment: DeckAssessment): string | null {
  const { limited, unknown, missing } = assessment;
  if (!limited.length && !unknown.length && !missing.length) return null;
  const parts: string[] = [];
  if (missing.length) parts.push(`${missing.length} carta(s) que el catálogo no contiene: ${missing.slice(0, 5).join(', ')}`);
  if (limited.length) {
    const example = limited.slice(0, 4).map((card) => `${card.name} (${card.gaps.slice(0, 1).join('; ') || 'sin detalle'})`);
    parts.push(`${limited.length} carta(s) con limitaciones conocidas: ${example.join(', ')}${limited.length > 4 ? '…' : ''}`);
  }
  if (unknown.length) parts.push(`${unknown.length} carta(s) sin evidencia de cobertura`);
  return parts.join('. ');
}

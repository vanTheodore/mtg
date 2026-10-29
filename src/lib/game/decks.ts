/**
 * Deck model, text import/export and local storage.
 *
 * Everything here is deck *plumbing*: counting lines, normalizing names and
 * persisting them. It never decides whether a card is legal or whether a deck is
 * valid for a format — that is Phase's job. The only cross-check this module
 * performs is against the loaded catalog and the catalog index (does a card
 * exist in the data we have, or in a pack we could still download?), which is a
 * data question, not a rules question.
 */
import type { CatalogIndex } from './catalog.ts';
import { canonicalIndex, normalizeName } from './canonical.ts';
import type { CoverageDocument } from './coverage.ts';

export type SavedFormat = 'limited';
export const DEFAULT_FORMAT: SavedFormat = 'limited';

export interface DeckLine {
  /** Card name exactly as written by the user or the source file. */
  name: string;
  count: number;
}

export interface SavedDeck {
  id: string;
  name: string;
  format: SavedFormat;
  lines: DeckLine[];
  updatedAt: string;
  /** Where the deck came from, for provenance in the UI. */
  origin: 'manual' | 'import' | 'demo';
}

export const STORAGE_KEY = 'mesa:decks:v1';
export const MAX_COPIES = 99; // A hard UI guard against typos, not a rules limit.

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const cleanName = (raw: string) => raw.replace(/\s+/g, ' ').trim();
/** A bare line means "one copy", so a name must at least contain a letter. */
const isCardName = (name: string) => /\p{L}/u.test(name);

/** `4 Lightning Bolt`, `4x Lightning Bolt`, `Lightning Bolt`, `1 Lightning Bolt (2XM) 129`. */
const LINE = /^(?:(\d+)\s*[xX]?\s+)?(.+?)(?:\s+\([A-Z0-9]{2,6}\)(?:\s+\d+)?)?$/;

const SECTION_WORDS = /^(deck|maindeck|main deck|main|sideboard|sb|commander|companion|about|name|mazo|banquillo)$/i;

export interface ParseResult {
  lines: DeckLine[];
  sideboard: DeckLine[];
  /** Lines the parser refused, kept for an honest UI report instead of vanishing. */
  skipped: string[];
}

/**
 * Parse an Arena/MTGO-style deck list. Unknown lines are reported, not dropped
 * silently; duplicate names merge; comments (`//`, `#`) and section headers are
 * ignored. Sideboard cards are collected separately so they are never mistaken
 * for main-deck cards.
 */
export function parseDeckList(text: string): ParseResult {
  const main = new Map<string, number>();
  const side = new Map<string, number>();
  const skipped: string[] = [];
  let section: 'main' | 'side' = 'main';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith('#')) continue;
    if (SECTION_WORDS.test(line.replace(/:$/, ''))) {
      section = /^(sideboard|sb|banquillo)$/i.test(line.replace(/:$/, '')) ? 'side' : 'main';
      continue;
    }
    if (/^sb:\s*/i.test(line)) {
      const rest = line.replace(/^sb:\s*/i, '');
      const parsed = LINE.exec(rest);
      if (parsed) {
        const count = parsed[1] ? Number(parsed[1]) : 1;
        const name = cleanName(parsed[2]!);
        if (count > 0 && isCardName(name)) { side.set(name, (side.get(name) ?? 0) + count); continue; }
      }
      skipped.push(rawLine);
      continue;
    }
    const parsed = LINE.exec(line);
    if (parsed) {
      const count = parsed[1] ? Number(parsed[1]) : 1;
      const name = cleanName(parsed[2]!);
      if (count > 0 && isCardName(name)) {
        const target = section === 'side' ? side : main;
        target.set(name, (target.get(name) ?? 0) + count);
        continue;
      }
    }
    skipped.push(rawLine);
  }
  const toLines = (map: Map<string, number>) => [...map.entries()].map(([name, count]) => ({ name, count }));
  return { lines: toLines(main), sideboard: toLines(side), skipped };
}

/** Arena-style export: `N Name`, one card per line, headers only when needed. */
export function formatDeckList(lines: readonly DeckLine[], sideboard: readonly DeckLine[] = []): string {
  const body = lines.map((line) => `${line.count} ${line.name}`).join('\n');
  if (!sideboard.length) return body;
  return `${body}\n\nSideboard\n${sideboard.map((line) => `${line.count} ${line.name}`).join('\n')}`;
}

export const deckSize = (lines: readonly DeckLine[]) => lines.reduce((sum, line) => sum + line.count, 0);
export const uniqueCards = (lines: readonly DeckLine[]) => lines.length;

/**
 * Expand a deck into the engine's `PlayerDeckList.main_deck`: one entry per copy,
 * because Phase resolves a list of names, not a name/count map.
 */
export function toEngineDeck(lines: readonly DeckLine[]): { player: { main_deck: string[] }; opponent: { main_deck: string[] } } {
  const names = lines.flatMap((line) => Array.from({ length: Math.max(0, Math.min(MAX_COPIES, line.count)) }, () => line.name));
  return { player: { main_deck: names }, opponent: { main_deck: [...names] } };
}

/** Canonical id for a new deck; stable enough for localStorage and tests. */
export function deckId(seed = Date.now(), random = Math.random): string {
  return `deck-${seed.toString(36)}-${Math.floor(random() * 1e6).toString(36)}`;
}

// ── catalog cross-check (data, not rules) ─────────────────────────────────────

export interface CatalogAvailability {
  /** Names present in the loaded catalog, matched case-insensitively. */
  found: DeckLine[];
  /**
   * Names no pack can serve. **Only** when an index is given: without it the
   * loaded catalog is the whole universe the caller knows about, so everything
   * else is missing by definition.
   */
  missing: DeckLine[];
  /**
   * Names the index knows in a pack that is not in memory. Not a problem: the
   * loader fetches exactly those packs when the game starts. Reporting them as
   * `missing` used to disable 「Jugar」 before the download could happen.
   */
  pending: DeckLine[];
  /** Lower-cased canonical key per input name, for display. */
  canonical: Record<string, string>;
}

/**
 * Compare a deck against what the browser has and what the index knows.
 *
 * With an `index`, a name is `found` (face in memory), `pending` (the index
 * names a pack for it) or `missing` (nobody can serve it). Without an index the
 * loaded catalog is the only authority and a name it lacks is `missing`.
 */
export function checkAgainstCatalog(
  lines: readonly DeckLine[],
  catalog: Record<string, unknown>,
  index?: CatalogIndex | null
): CatalogAvailability {
  const keys = new Map(Object.keys(catalog).map((key) => [key.toLocaleLowerCase('en-US'), key]));
  const known = index ? canonicalIndex(index).byName : null;
  const found: DeckLine[] = [];
  const missing: DeckLine[] = [];
  const pending: DeckLine[] = [];
  const canonical: Record<string, string> = {};
  for (const line of lines) {
    const key = keys.get(normalizeName(line.name));
    if (key) { found.push(line); canonical[line.name] = key; continue; }
    if (known?.has(normalizeName(line.name))) pending.push(line);
    else missing.push(line);
  }
  return { found, missing, pending, canonical };
}

/** The five states a deck line can be in, in the order the UI shows them. */
export type DeckLineState = 'absent' | 'limited' | 'pending' | 'ready';

export interface DeckLineStatus {
  line: DeckLine;
  /** Canonical lower-case name; the key every catalog lookup uses. */
  key: string;
  /** Pack that owns the name in the canonical index, `null` when unknown. */
  pack: string | null;
  /** The face is already in memory. */
  loaded: boolean;
  /** The owning pack is play-certified (`verified: true` in the index). */
  certified: boolean;
  /** Known Phase gaps for this card, when its coverage artifact was consulted. */
  gaps: string[];
  state: DeckLineState;
}

export interface DeckStatus {
  lines: DeckLineStatus[];
  /** Packs the deck touches, in deck order. Never the whole catalog. */
  neededPacks: string[];
  /** Packs that must be downloaded before the deck is fully in memory. */
  pendingPacks: string[];
  /** Lines no pack in the index can serve. */
  unknown: DeckLineStatus[];
  /** Lines whose pack the index marks as not play-certified. */
  unverified: DeckLineStatus[];
  /** Lines with known Phase limitations (admitted only with explicit consent). */
  limited: DeckLineStatus[];
  /** Copies per state; `total` is the deck size, so the parts must add up. */
  copies: Record<DeckLineState | 'total', number>;
  /**
   * Nothing blocks *attempting* the load: no unknown names and no unverified
   * packs. Pending packs are the loader's job, and limitations are the start
   * gate's (they need explicit consent, not a silent block here).
   */
  canStart: boolean;
}

/**
 * Resolve a deck against the index, the loaded catalog and (optionally) the
 * coverage artifacts. Pure: the caller decides when to download anything.
 */
export function deckStatus(
  lines: readonly DeckLine[],
  input: { index?: CatalogIndex | null; catalog?: Record<string, unknown>; coverage?: Map<string, CoverageDocument | null> }
): DeckStatus {
  const catalog = input.catalog ?? {};
  const loadedKeys = new Map(Object.entries(catalog).map(([key, face]) => [normalizeName(key), face]));
  const known = input.index ? canonicalIndex(input.index).byName : null;
  const needed: string[] = [];
  const pendingPacks = new Set<string>();
  const copies: Record<DeckLineState | 'total', number> = { absent: 0, limited: 0, pending: 0, ready: 0, total: 0 };

  const resolved = lines.map<DeckLineStatus>((line) => {
    const key = normalizeName(line.name);
    const entry = known?.get(key) ?? null;
    const face = loadedKeys.get(key) ?? (entry ? loadedKeys.get(normalizeName(entry.name)) : undefined);
    const loaded = face !== undefined;
    const pack = entry?.pack ?? null;
    const certified = entry?.verified ?? true;
    const document = pack ? input.coverage?.get(pack) ?? null : null;
    const card = document?.cards?.find((candidate) => candidate.key === key || normalizeName(candidate.name) === key);
    const gaps = card && card.supported === false ? card.gaps : [];
    let state: DeckLineState;
    if (!entry && !loaded) state = 'absent';
    else if (gaps.length) state = 'limited';
    else if (!loaded) state = 'pending';
    else state = 'ready';
    if (pack && !needed.includes(pack)) needed.push(pack);
    if (state === 'pending' && pack) pendingPacks.add(pack);
    copies[state] += line.count;
    return { line, key, pack, loaded, certified, gaps, state };
  });

  copies.total = resolved.reduce((sum, status) => sum + status.line.count, 0);
  const byState = (state: DeckLineState) => resolved.filter((status) => status.state === state);
  const unknown = byState('absent');
  const unverified = resolved.filter((status) => !status.certified);
  return {
    lines: resolved,
    neededPacks: needed,
    pendingPacks: [...pendingPacks],
    unknown,
    unverified,
    limited: byState('limited'),
    copies,
    canStart: unknown.length === 0 && unverified.length === 0
  };
}

// ── storage ──────────────────────────────────────────────────────────────────

function isLine(value: unknown): value is DeckLine {
  return !!value && typeof value === 'object'
    && typeof (value as DeckLine).name === 'string'
    && typeof (value as DeckLine).count === 'number'
    && Number.isFinite((value as DeckLine).count)
    && (value as DeckLine).count > 0;
}

function isDeck(value: unknown): value is SavedDeck {
  if (!value || typeof value !== 'object') return false;
  const deck = value as SavedDeck;
  // A single corrupt line must not discard the whole deck: ids and names are
  // required, lines are filtered on read.
  return typeof deck.id === 'string' && typeof deck.name === 'string' && Array.isArray(deck.lines);
}

/** Read saved decks. A corrupt or future-version payload degrades to an empty list. */
export function readDecks(storage: StorageLike | undefined): SavedDeck[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isDeck).map((deck) => ({
      ...deck,
      format: deck.format === 'limited' ? 'limited' : DEFAULT_FORMAT,
      origin: deck.origin ?? 'manual',
      lines: deck.lines.filter(isLine).map((line) => ({ name: line.name, count: Math.min(MAX_COPIES, line.count) }))
    }));
  } catch {
    return [];
  }
}

export function writeDecks(storage: StorageLike | undefined, decks: readonly SavedDeck[]): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(decks));
    return true;
  } catch {
    return false; // Quota or private mode: the UI reports it, nothing is lost silently.
  }
}

export function upsertDeck(decks: readonly SavedDeck[], deck: SavedDeck): SavedDeck[] {
  const rest = decks.filter((candidate) => candidate.id !== deck.id);
  return [...rest, deck].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function removeDeck(decks: readonly SavedDeck[], id: string): SavedDeck[] {
  return decks.filter((candidate) => candidate.id !== id);
}

/** Build a saved deck from editor state, keeping the deck's identity. */
export function makeDeck(input: {
  id?: string; name: string; lines: readonly DeckLine[]; origin?: SavedDeck['origin']; now?: string;
}): SavedDeck {
  return {
    id: input.id ?? deckId(),
    name: input.name.trim() || 'Mazo sin nombre',
    format: DEFAULT_FORMAT,
    lines: input.lines.filter((line) => line.count > 0 && line.name.trim()).map((line) => ({ name: line.name.trim(), count: Math.min(MAX_COPIES, Math.floor(line.count)) })),
    updatedAt: input.now ?? new Date().toISOString(),
    origin: input.origin ?? 'manual'
  };
}

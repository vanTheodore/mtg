/**
 * Deck model, text import/export and local storage.
 *
 * Everything here is deck *plumbing*: counting lines, normalizing names and
 * persisting them. It never decides whether a card is legal or whether a deck is
 * valid for a format — that is Phase's job. The only cross-check this module
 * performs is against the loaded catalog (does a card exist in the data we
 * have?), which is a data question, not a rules question.
 */

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
  /** Names the loaded catalog cannot serve. The engine would skip them silently. */
  missing: DeckLine[];
  /** Lower-cased canonical key per input name, for display. */
  canonical: Record<string, string>;
}

export function checkAgainstCatalog(lines: readonly DeckLine[], catalog: Record<string, unknown>): CatalogAvailability {
  const keys = new Map(Object.keys(catalog).map((key) => [key.toLocaleLowerCase('en-US'), key]));
  const found: DeckLine[] = [];
  const missing: DeckLine[] = [];
  const canonical: Record<string, string> = {};
  for (const line of lines) {
    const key = keys.get(line.name.toLocaleLowerCase('en-US').trim());
    if (key) { found.push(line); canonical[line.name] = key; }
    else missing.push(line);
  }
  return { found, missing, canonical };
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

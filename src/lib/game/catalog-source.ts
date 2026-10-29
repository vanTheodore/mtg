/**
 * Conversion from MTGJSON set files to the two shapes Mesa needs:
 *
 * 1. `atomicFromMtgjsonSet` → the `AtomicCards` object Phase deserializes.
 *    MTGJSON v3/v4 set files are per-set and carry both English rules text and
 *    (in the `.es.json` variants) the official Spanish text of the same printing.
 * 2. `impressionsFromMtgjsonSet` → Spanish impressions keyed by the catalog's
 *    English name, used only for display. Names stay English so Phase's card
 *    identity, oracle ids and image cache keep working.
 *
 * Nothing here invents rules text: a card without localized data simply gets no
 * impression and falls back to the engine's English text.
 */

export interface MtgjsonCard {
  name?: string;
  names?: string[];
  layout?: string;
  manaCost?: string;
  cmc?: number;
  colors?: string[];
  colorIdentity?: string[];
  type?: string;
  originalType?: string;
  types?: string[];
  supertypes?: string[];
  subtypes?: string[];
  text?: string;
  originalText?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  multiverseid?: number | string;
  number?: string;
  rarity?: string;
}

export interface MtgjsonSetFile {
  name?: string;
  code?: string;
  language?: string;
  cards?: MtgjsonCard[];
}

export interface AtomicFace {
  name: string;
  manaCost?: string;
  manaValue?: number;
  colors?: string[];
  colorIdentity?: string[];
  type?: string;
  text?: string;
  types?: string[];
  supertypes?: string[];
  subtypes?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  layout?: string;
  identifiers?: { scryfallOracleId?: string; multiverseId?: string };
}

/** Multi-face cards keep their printed names; the engine splits them by `name`. */
function faceNames(card: MtgjsonCard): string[] {
  if (Array.isArray(card.names) && card.names.length) return card.names;
  return card.name ? [card.name] : [];
}

export function atomicFromMtgjsonSet(file: MtgjsonSetFile): Record<string, AtomicFace[]> {
  const out: Record<string, AtomicFace[]> = {};
  for (const card of file.cards ?? []) {
    const names = faceNames(card);
    if (!names.length) continue;
    // A DFC/split keeps the front name as the database key; `names` documents
    // the other faces so the pack index can resolve either name.
    const key = names[0]!;
    const face: AtomicFace = {
      name: key,
      manaCost: card.manaCost,
      // Phase requires `manaValue`; a card without `cmc` (a land) is 0.
      manaValue: typeof card.cmc === 'number' ? card.cmc : 0,
      colors: card.colors,
      colorIdentity: card.colorIdentity ?? card.colors,
      type: card.type,
      text: card.text,
      types: card.types,
      supertypes: card.supertypes ?? [],
      subtypes: card.subtypes ?? [],
      power: card.power,
      toughness: card.toughness,
      loyalty: card.loyalty,
      layout: card.layout,
      identifiers: card.multiverseid !== undefined ? { multiverseId: String(card.multiverseid) } : undefined
    };
    out[key] = [...(out[key] ?? []), stripUndefined(face) as AtomicFace];
  }
  return out;
}

function stripUndefined(face: AtomicFace): AtomicFace {
  return Object.fromEntries(Object.entries(face).filter(([, value]) => value !== undefined)) as AtomicFace;
}

// ── format guards ────────────────────────────────────────────────────────────
//
// Phase parses MTGJSON v5 *AtomicCards* (`{ meta, data: { name: [faces] } }`).
// MTGJSON v3 set files (`{ code, cards: [...] }`) and the localized `.es.json`
// variants are a different schema, so they cannot be handed to the engine as-is:
// feeding one to the pack generator used to produce an artifact the engine would
// silently misunderstand. Both formats are detected explicitly here.

/** MTGJSON v5 AtomicCards: the only shape `CardDatabase::from_mtgjson` reads. */
export interface AtomicCardsFile {
  meta?: Record<string, unknown>;
  data: Record<string, AtomicFace[]>;
}

export function isAtomicCardsFile(value: unknown): value is AtomicCardsFile {
  if (!value || typeof value !== 'object') return false;
  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  return Object.values(data as Record<string, unknown>).every((faces) => Array.isArray(faces));
}

export function isMtgjsonV3SetFile(value: unknown): value is MtgjsonSetFile {
  if (!value || typeof value !== 'object') return false;
  const cards = (value as { cards?: unknown }).cards;
  return Array.isArray(cards) && !isAtomicCardsFile(value);
}

/** MTGJSON v3 spells colours out; v5/Phase use the WUBRG letters. */
const COLOR_LETTER: Record<string, string> = {
  white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G'
};

export function colorLetters(colors: readonly string[] | undefined): string[] | undefined {
  if (!colors?.length) return undefined;
  const letters = colors
    .map((color) => (color.length === 1 ? color.toUpperCase() : COLOR_LETTER[color.trim().toLowerCase()]))
    .filter((letter): letter is string => !!letter && 'WUBRG'.includes(letter));
  return letters.length ? [...new Set(letters)] : undefined;
}

/**
 * Adapt an MTGJSON v3 set file to the v5 AtomicCards shape.
 *
 * This is a *schema* translation only — no card is invented and no rules text is
 * rewritten. Cards the v3 schema cannot express faithfully (a multi-face card
 * keeps only the front face and no per-face text; a meld/split back face would
 * have to be fabricated) are skipped and reported, so the caller can decide
 * whether the resulting set is usable.
 */
export interface AtomicFromV3Result {
  atomic: AtomicCardsFile;
  /** Cards that could not be represented in AtomicCards without inventing data. */
  skipped: { name: string; reason: 'multi-face' | 'no-name' }[];
  set: string | null;
  language: string | null;
}

export function mtgjsonV3ToAtomic(file: MtgjsonSetFile): AtomicFromV3Result {
  const data: Record<string, AtomicFace[]> = {};
  const skipped: AtomicFromV3Result['skipped'] = [];
  for (const card of file.cards ?? []) {
    const names = faceNames(card);
    if (!names.length) { skipped.push({ name: '(sin nombre)', reason: 'no-name' }); continue; }
    if (names.length > 1) { skipped.push({ name: names.join(' // '), reason: 'multi-face' }); continue; }
    const name = names[0]!;
    const face: AtomicFace = {
      name,
      manaCost: card.manaCost,
      // Phase requires `manaValue`; a card without `cmc` (a land) is 0.
      manaValue: typeof card.cmc === 'number' ? card.cmc : 0,
      // MTGJSON v5 always carries these two arrays; Phase rejects a card that
      // omits `colors`, so a colorless card gets `[]`, never `undefined`.
      colors: colorLetters(card.colors) ?? [],
      colorIdentity: colorLetters(card.colorIdentity) ?? colorLetters(card.colors) ?? [],
      type: card.type,
      text: card.text,
      types: card.types,
      supertypes: card.supertypes ?? [],
      subtypes: card.subtypes ?? [],
      power: card.power,
      toughness: card.toughness,
      loyalty: card.loyalty,
      layout: card.layout,
      identifiers: card.multiverseid !== undefined ? { multiverseId: String(card.multiverseid) } : undefined
    };
    const clean = stripUndefined(face);
    data[name] = [...(data[name] ?? []), clean];
  }
  return {
    atomic: { meta: { source: 'mtgjson-v3', code: file.code ?? null, language: file.language ?? null }, data },
    skipped,
    set: file.code ?? null,
    language: file.language ?? null
  };
}

export interface SpanishImpression {
  /** English name Phase uses; the impression never replaces it. */
  face_name: string;
  printed_name?: string;
  printed_text?: string;
  printed_type?: string;
  /** Set code and printing id the text was taken from. */
  set: string;
  printing_id: string;
}

export interface ImpressionsFile {
  version: 1;
  language: 'es';
  source: string;
  generated_at: string;
  /** Keyed by lower-cased English name. */
  cards: Record<string, SpanishImpression>;
}

const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('en-US');

/**
 * Keep the Spanish text of the cards the catalog actually ships. MTGJSON v3's
 * translated set files keep the English `name` and put the official localized
 * text in `originalText` / `originalType`, so matching is by English name — the
 * same identity Phase and the image cache use.
 *
 * `printed_name` is only set when the source carries a localized name; v3 files
 * usually do not, and in that case the English name stays visible.
 */
export function impressionsFromMtgjsonSet(
  file: MtgjsonSetFile,
  catalogNames: readonly string[],
  meta: { source: string; generatedAt: string }
): ImpressionsFile {
  const wanted = new Set(catalogNames.map(normalize));
  const cards: Record<string, SpanishImpression> = {};
  const set = file.code ?? 'UNK';
  for (const card of file.cards ?? []) {
    const names = faceNames(card);
    const name = names[0];
    if (!name || !wanted.has(normalize(name))) continue;
    const localName = (card as MtgjsonCard & { originalName?: string }).originalName;
    const impression: SpanishImpression = {
      face_name: name,
      ...(localName && normalize(localName) !== normalize(name) ? { printed_name: localName } : {}),
      ...(card.originalText ? { printed_text: card.originalText } : {}),
      ...(card.originalType ? { printed_type: card.originalType } : {}),
      set,
      printing_id: card.multiverseid !== undefined ? String(card.multiverseid) : (card.number ?? '')
    };
    if (!impression.printed_text && !impression.printed_type && !impression.printed_name) continue;
    cards[normalize(name)] = impression;
  }
  return { version: 1, language: 'es', source: meta.source, generated_at: meta.generatedAt, cards };
}

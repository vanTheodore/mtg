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
      manaValue: typeof card.cmc === 'number' ? card.cmc : undefined,
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

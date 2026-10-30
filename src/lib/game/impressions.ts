/**
 * Optional Spanish impressions layer.
 *
 * Real localized text (not hand-written translations) keyed by the English card
 * name Phase uses. Everything here is display-only:
 *
 * - names, oracle ids and rules identity stay exactly as the engine sent them;
 * - a card without an impression keeps its English text;
 * - nothing is ever hidden: a missing impression is a normal fallback, not a
 *   "hidden information" state.
 *
 * The file is optional on purpose (`/data/impressions.es.json` may 404), so the
 * app keeps working before any localized data ships.
 */
import type { SpanishImpression, ImpressionsFile } from './catalog-source.ts';

export type { SpanishImpression, ImpressionsFile };

export const IMPRESSIONS_URL = '/data/impressions.es.json';

const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('en-US');

export interface ImpressionLookup {
  /** Spanish text for an English card name, if one is published. */
  text(name?: string | null): string | undefined;
  /** Spanish type line of the printing, if one is published. */
  type(name?: string | null): string | undefined;
  /** Localized printed name, only when the source carried one. */
  name(name?: string | null): string | undefined;
  /** Set code and printing id the text came from, for attribution. */
  printing(name?: string | null): { set: string; id: string } | undefined;
  size: number;
  source?: string;
}

const EMPTY: ImpressionLookup = { text: () => undefined, type: () => undefined, name: () => undefined, printing: () => undefined, size: 0 };

/** Build a lookup from a parsed file. Invalid entries are skipped, never guessed. */
export function createLookup(file: ImpressionsFile | null | undefined): ImpressionLookup {
  const cards = file?.cards ?? {};
  const valid = Object.entries(cards).filter(([, impression]) => impression && typeof impression === 'object');
  if (!valid.length) return { ...EMPTY, source: file?.source };
  const map = new Map(valid.map(([key, impression]) => [normalize(key), impression]));
  return {
    text: (name) => (name ? map.get(normalize(name))?.printed_text : undefined),
    type: (name) => (name ? map.get(normalize(name))?.printed_type : undefined),
    name: (name) => (name ? map.get(normalize(name))?.printed_name : undefined),
    printing: (name) => {
      const found = name ? map.get(normalize(name)) : undefined;
      return found ? { set: found.set, id: found.printing_id } : undefined;
    },
    size: map.size,
    source: file?.source
  };
}

/** Load the impressions file; a 404 or a broken payload degrades to "no layer". */
export async function loadImpressions(fetcher: (url: string) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>): Promise<ImpressionLookup> {
  try {
    const response = await fetcher(IMPRESSIONS_URL);
    if (!response.ok) return { ...EMPTY };
    const file = (await response.json()) as ImpressionsFile;
    if (file?.version !== 1) return { ...EMPTY };
    return createLookup(file);
  } catch {
    return { ...EMPTY };
  }
}

/**
 * The rules text the interface shows for an object: the engine's text, replaced
 * by the published Spanish impression when one exists for that exact card name.
 */
export function displayText(
  lookup: ImpressionLookup,
  object: { name?: string },
  fallback?: string | null
): string {
  return lookup.text(object.name) ?? fallback ?? '';
}

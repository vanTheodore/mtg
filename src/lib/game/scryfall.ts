import type { CardImageLookup } from './cards.ts';
import type { TokenArtDescriptor } from '#lib/engine/types.ts';

interface ScryfallFace { name?: string; oracle_id?: string; image_uris?: Record<string, unknown>; power?: string; toughness?: string }
export interface ScryfallCard {
  id?: string; oracle_id?: string; name?: string; layout?: string;
  image_uris?: Record<string, unknown>; card_faces?: ScryfallFace[];
  power?: string; toughness?: string; colors?: string[]; type_line?: string;
  keywords?: string[]; oracle_text?: string;
}
export type ImageFailureReason = 'no-identity' | 'not-found' | 'network' | 'rate-limit' | 'server' | 'invalid-response' | 'image-download';
export type ImageResult =
  | { status: 'ready'; url: string; faceName?: string; source: 'oracle' | 'name' | 'token-id' | 'token-search' }
  | { status: 'unavailable'; reason: ImageFailureReason; retryAfterMs?: number };

const CACHE_KEY = 'mesa:scryfall:v2';
const TTL = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL = 60_000;
const REQUEST_GAP_MS = 110;
const API = 'https://api.scryfall.com';
const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('en-US');

class ImageLookupError extends Error {
  constructor(readonly reason: ImageFailureReason, readonly retryAfterMs?: number) { super(reason); }
}

export function isScryfallImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'cards.scryfall.io' || url.hostname.endsWith('.scryfall.io')); }
  catch { return false; }
}

/** Match the engine's displayed face, never silently substitute the other face. */
export function selectCardImage(card: ScryfallCard, lookup: CardImageLookup): { url: string; faceName?: string } | null {
  const faces = card.card_faces ?? [];
  const requested = lookup.faceName ? normalize(lookup.faceName) : undefined;
  const namedIndex = requested ? faces.findIndex((face) => face.name && normalize(face.name) === requested) : -1;
  const fullCard = requested && card.name && normalize(card.name) === requested;
  let face: ScryfallFace | undefined;
  let uris = card.image_uris;
  if (namedIndex >= 0) { face = faces[namedIndex]; uris = face.image_uris ?? uris; }
  else if (!fullCard && faces.length > 0) {
    // An index is a fallback only when no authoritative face name was supplied.
    if (requested) return null;
    face = faces[lookup.faceIndex];
    if (!face) return null;
    uris = face.image_uris ?? uris;
  }
  const url = uris?.normal ?? uris?.large ?? uris?.small;
  return isScryfallImageUrl(url) ? { url, faceName: face?.name ?? card.name } : null;
}

const COLOR_LETTERS: Record<string, string> = { White: 'W', Blue: 'U', Black: 'B', Red: 'R', Green: 'G', Colorless: 'C', W: 'W', U: 'U', B: 'B', R: 'R', G: 'G', C: 'C' };
function tokenQuery(name: string, art?: TokenArtDescriptor): string {
  const baseName = name.replace(/\s+token$/i, '').trim();
  let query = `t:token !"${baseName.replace(/"/g, '')}"`;
  if (art) {
    if (art.power != null) query += ` pow=${art.power}`;
    if (art.toughness != null) query += ` tou=${art.toughness}`;
    const colors = [...new Set(art.colors.map((c) => COLOR_LETTERS[c]).filter(Boolean))].sort().join('');
    query += colors ? ` c=${colors}` : ' c=c';
    for (const subtype of art.subtypes) query += ` t:"${subtype.replace(/"/g, '').toLowerCase()}"`;
    for (const keyword of art.keywords ?? []) {
      const plain = keyword.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
      query += ` kw:"${plain.replace(/"/g, '')}"`;
    }
    if (!art.has_abilities) query += ' is:vanilla';
  }
  return query;
}

function matchesTokenShape(card: ScryfallCard, art?: TokenArtDescriptor): boolean {
  if (!art) return true;
  const face = card.card_faces?.[0] ?? card;
  if (art.power != null && face.power !== String(art.power)) return false;
  if (art.toughness != null && face.toughness !== String(art.toughness)) return false;
  if (card.colors) {
    const expected = [...new Set(art.colors.map((c) => COLOR_LETTERS[c]).filter(Boolean))].sort().join('');
    if ([...card.colors].sort().join('') !== expected) return false;
  }
  if (art.subtypes.length && !art.subtypes.every((s) => card.type_line?.toLowerCase().includes(s.toLowerCase()))) return false;
  return true;
}

export function retryAfterMs(header: string | null, now = Date.now()): number {
  if (!header) return 2_000;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(600_000, seconds * 1000));
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, Math.min(600_000, date - now)) : 2_000;
}

interface ResolverOptions { fetcher?: typeof fetch; storage?: Storage | null; now?: () => number; requestGapMs?: number }
interface CacheEntry { result: ImageResult; t: number }

/** Bounded cache + shared in-flight requests + a respectful Scryfall queue. */
export class CardImageResolver {
  private fetcher: typeof fetch;
  private storage: Storage | null;
  private now: () => number;
  private gap: number;
  private memory = new Map<string, CacheEntry>();
  private pending = new Map<string, Promise<ImageResult>>();
  private queue: Promise<void> = Promise.resolve();
  private nextRequestAt = 0;
  private cooldownUntil = 0;

  constructor(options: ResolverOptions = {}) {
    this.fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
    this.storage = options.storage === undefined ? (typeof localStorage !== 'undefined' ? localStorage : null) : options.storage;
    this.now = options.now ?? Date.now;
    this.gap = options.requestGapMs ?? REQUEST_GAP_MS;
  }

  static key(lookup: CardImageLookup): string {
    const identity = lookup.tokenRef?.scryfall_id ?? lookup.oracleId ?? normalize(lookup.name);
    return JSON.stringify([lookup.kind, identity, normalize(lookup.faceName ?? ''), lookup.faceIndex, lookup.tokenArt ?? null]);
  }

  resolve(lookup: CardImageLookup, fresh = false): Promise<ImageResult> {
    if (!lookup.name.trim() && !lookup.oracleId && !lookup.tokenRef) return Promise.resolve({ status: 'unavailable', reason: 'no-identity' });
    const key = CardImageResolver.key(lookup);
    if (fresh) { this.memory.delete(key); this.removeStored(key); }
    const cached = this.readCache(key);
    if (cached && !fresh) return Promise.resolve(cached);
    const existing = this.pending.get(key);
    if (existing && !fresh) return existing;
    const promise = this.lookup(lookup).then((result) => {
      this.writeCache(key, result);
      return result;
    }).finally(() => { if (this.pending.get(key) === promise) this.pending.delete(key); });
    this.pending.set(key, promise);
    return promise;
  }

  clear() {
    this.memory.clear(); this.pending.clear(); this.cooldownUntil = 0;
    try { this.storage?.removeItem(CACHE_KEY); } catch { /* storage is optional */ }
  }

  private async lookup(lookup: CardImageLookup): Promise<ImageResult> {
    try {
      if (this.now() < this.cooldownUntil) throw new ImageLookupError('rate-limit', this.cooldownUntil - this.now());
      const attempts: Array<{ url: string; source: Extract<ImageResult, { status: 'ready' }>['source']; search?: boolean }> = [];
      if (lookup.kind === 'token') {
        if (lookup.tokenRef?.scryfall_id) attempts.push({ url: `${API}/cards/${encodeURIComponent(lookup.tokenRef.scryfall_id)}`, source: 'token-id' });
        if (lookup.oracleId) attempts.push({ url: `${API}/cards/oracle/${encodeURIComponent(lookup.oracleId)}`, source: 'oracle' });
        attempts.push({ url: `${API}/cards/search?q=${encodeURIComponent(tokenQuery(lookup.name, lookup.tokenArt))}&unique=art&order=released&dir=desc`, source: 'token-search', search: true });
      } else {
        if (lookup.oracleId) attempts.push({ url: `${API}/cards/oracle/${encodeURIComponent(lookup.oracleId)}`, source: 'oracle' });
        if (lookup.name.trim()) {
          attempts.push({ url: `${API}/cards/named?exact=${encodeURIComponent(lookup.name)}`, source: 'name' });
          attempts.push({ url: `${API}/cards/named?fuzzy=${encodeURIComponent(lookup.name)}`, source: 'name' });
        }
      }
      if (!attempts.length) return { status: 'unavailable', reason: 'no-identity' };
      for (const attempt of attempts) {
        const payload = await this.request(attempt.url);
        const cards: ScryfallCard[] = attempt.search ? ((payload as { data?: ScryfallCard[] } | null)?.data ?? []) : (payload ? [payload as ScryfallCard] : []);
        for (const card of cards) {
          if (attempt.source === 'oracle' && lookup.oracleId && card.oracle_id && card.oracle_id !== lookup.oracleId && !card.card_faces?.some((f) => f.oracle_id === lookup.oracleId)) continue;
          if (attempt.source === 'token-id' && card.id !== lookup.tokenRef?.scryfall_id) continue;
          if (attempt.search && !matchesTokenShape(card, lookup.tokenArt)) continue;
          const image = selectCardImage(card, lookup);
          if (image) return { status: 'ready', ...image, source: attempt.source };
        }
      }
      return { status: 'unavailable', reason: 'not-found' };
    } catch (error) {
      if (error instanceof ImageLookupError) return { status: 'unavailable', reason: error.reason, retryAfterMs: error.retryAfterMs };
      return { status: 'unavailable', reason: 'network' };
    }
  }

  private async request(url: string): Promise<unknown | null> {
    const previous = this.queue;
    let release!: () => void;
    this.queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      const wait = Math.max(0, this.nextRequestAt - this.now());
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      this.nextRequestAt = this.now() + this.gap;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8_000);
      try {
        const response = await this.fetcher(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
        if (response.status === 404) return null;
        if (response.status === 429) {
          const delay = retryAfterMs(response.headers.get('Retry-After'), this.now());
          this.cooldownUntil = this.now() + delay;
          throw new ImageLookupError('rate-limit', delay);
        }
        if (!response.ok) throw new ImageLookupError(response.status >= 500 ? 'server' : 'invalid-response');
        const payload: unknown = await response.json();
        if (!payload || typeof payload !== 'object') throw new ImageLookupError('invalid-response');
        return payload;
      } finally { clearTimeout(timeout); }
    } catch (error) {
      if (error instanceof ImageLookupError) throw error;
      throw new ImageLookupError('network');
    } finally { release(); }
  }

  private readCache(key: string): ImageResult | null {
    const entry = this.memory.get(key) ?? this.readStored(key);
    if (!entry) return null;
    const ttl = entry.result.status === 'ready' ? TTL : entry.result.reason === 'rate-limit' ? (entry.result.retryAfterMs ?? 2_000) : NEGATIVE_TTL;
    if (this.now() - entry.t >= ttl) { this.memory.delete(key); return null; }
    return entry.result;
  }

  private readStored(key: string): CacheEntry | null {
    try {
      const data = JSON.parse(this.storage?.getItem(CACHE_KEY) ?? '{}') as Record<string, CacheEntry>;
      const entry = data[key];
      if (!entry || typeof entry.t !== 'number' || entry.result?.status !== 'ready' || !isScryfallImageUrl(entry.result.url)) return null;
      this.memory.set(key, entry);
      return entry;
    } catch { return null; }
  }

  private writeCache(key: string, result: ImageResult) {
    const entry = { result, t: this.now() };
    this.memory.set(key, entry);
    if (result.status !== 'ready') return;
    try {
      const data = JSON.parse(this.storage?.getItem(CACHE_KEY) ?? '{}') as Record<string, CacheEntry>;
      data[key] = entry;
      const keys = Object.keys(data).sort((a, b) => (data[a]?.t ?? 0) - (data[b]?.t ?? 0));
      while (keys.length > 300) delete data[keys.shift()!];
      this.storage?.setItem(CACHE_KEY, JSON.stringify(data));
    } catch { /* private mode / quota: the in-memory cache still works */ }
  }

  private removeStored(key: string) {
    try {
      const data = JSON.parse(this.storage?.getItem(CACHE_KEY) ?? '{}') as Record<string, CacheEntry>;
      delete data[key]; this.storage?.setItem(CACHE_KEY, JSON.stringify(data));
    } catch { /* optional storage */ }
  }
}

export const imageResolver = new CardImageResolver();
export function resolveCardImage(lookup: CardImageLookup, fresh = false): Promise<ImageResult> { return imageResolver.resolve(lookup, fresh); }
export async function scryfallImageUrl(lookup: CardImageLookup): Promise<string | null> {
  const result = await resolveCardImage(lookup);
  return result.status === 'ready' ? result.url : null;
}
export function clearImageCache() { imageResolver.clear(); }

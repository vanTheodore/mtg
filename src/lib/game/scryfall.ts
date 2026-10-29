import type { CardImageLookup } from './cards';

interface ScryfallFace { name?: string; image_uris?: Record<string, string> }
interface ScryfallCard { id: string; name?: string; image_uris?: Record<string, string>; card_faces?: ScryfallFace[] }

const memory = new Map<string, Promise<string | null>>();
const CACHE_KEY = 'mesa:scryfall:v1';
const TTL = 1000 * 60 * 60 * 24 * 7;

function readCache(id: string): string | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Record<string, { url: string; t: number }>;
    const entry = data[id];
    if (entry && Date.now() - entry.t < TTL) return entry.url;
  } catch { /* ignore */ }
  return null;
}

function writeCache(id: string, url: string) {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const data = raw ? JSON.parse(raw) as Record<string, { url: string; t: number }> : {};
    data[id] = { url, t: Date.now() };
    const keys = Object.keys(data);
    if (keys.length > 300) delete data[keys[0]];
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch { /* ignore */ }
}

export function scryfallImageUrl(lookup: CardImageLookup): Promise<string | null> {
  if (!lookup.oracleId) return Promise.resolve(null);
  const key = `${lookup.oracleId}:${lookup.faceName ?? lookup.faceIndex}`;
  const cached = readCache(key);
  if (cached) return Promise.resolve(cached);
  const existing = memory.get(key);
  if (existing) return existing;
  const promise = (async () => {
    try {
      const response = await fetch(`https://api.scryfall.com/cards/oracle/${encodeURIComponent(lookup.oracleId!)}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) return null;
      const card = await response.json() as ScryfallCard;
      let uris = card.image_uris;
      if (card.card_faces?.length) {
        const face = lookup.faceName
          ? card.card_faces.find((f) => f.name === lookup.faceName) ?? card.card_faces[lookup.faceIndex]
          : card.card_faces[lookup.faceIndex];
        uris = face?.image_uris ?? uris;
      }
      const url = uris?.normal ?? uris?.large ?? uris?.small ?? null;
      if (url) writeCache(key, url);
      return url;
    } catch {
      return null;
    } finally {
      memory.delete(key);
    }
  })();
  memory.set(key, promise);
  return promise;
}

export function clearImageCache() {
  memory.clear();
  try { localStorage.removeItem(CACHE_KEY); } catch { /* ignore */ }
}

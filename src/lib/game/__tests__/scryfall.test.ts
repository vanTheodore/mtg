import { describe, expect, test } from 'bun:test';
import { CardImageResolver, selectCardImage, retryAfterMs, type ScryfallCard } from '../scryfall';
import { cardImageLookup, manaText, type CardImageLookup } from '../cards';
import type { GameObject } from '../../engine/types';

const url = (name: string) => `https://cards.scryfall.io/normal/${name}.jpg`;
const card = (name: string, id = name.toLowerCase()): ScryfallCard => ({ id, oracle_id: `oracle-${id}`, name, image_uris: { normal: url(id) } });
const response = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers });
const lookup = (overrides: Partial<CardImageLookup> = {}): CardImageLookup => ({ name: 'Forest', faceIndex: 0, kind: 'card', ...overrides });
const base: GameObject = { id: 1, card_id: 1, owner: 0, controller: 0, zone: 'Hand', name: 'Delver of Secrets', display_visible_to_viewer: true };

describe('image identity and faces', () => {
  test('resolves by name when oracle id is absent', async () => {
    const calls: string[] = [];
    const resolver = new CardImageResolver({ storage: null, requestGapMs: 0, fetcher: (async (input: string) => { calls.push(input); return response(card('Forest')); }) as unknown as typeof fetch });
    const result = await resolver.resolve(lookup());
    expect(result.status).toBe('ready');
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/cards/named?exact=Forest');
  });

  test('oracle miss falls back to exact name and selects the authoritative back face', async () => {
    const dfc: ScryfallCard = { id: 'delver', oracle_id: 'oracle-delver', name: 'Delver of Secrets // Insectile Aberration', card_faces: [
      { name: 'Delver of Secrets', image_uris: { normal: url('delver-front') } },
      { name: 'Insectile Aberration', image_uris: { normal: url('delver-back') } }
    ] };
    const calls: string[] = [];
    const resolver = new CardImageResolver({ storage: null, requestGapMs: 0, fetcher: (async (input: string) => { calls.push(input); return calls.length === 1 ? response({}, 404) : response(dfc); }) as unknown as typeof fetch });
    const result = await resolver.resolve(lookup({ name: 'Delver of Secrets', oracleId: 'oracle-delver', faceName: 'Insectile Aberration', faceIndex: 1 }));
    expect(result).toMatchObject({ status: 'ready', url: url('delver-back'), faceName: 'Insectile Aberration', source: 'name' });
    expect(calls).toHaveLength(2);
  });

  test('does not substitute the front face when the requested face is missing', () => {
    const dfc: ScryfallCard = { name: 'Front // Back', card_faces: [{ name: 'Front', image_uris: { normal: url('front') } }, { name: 'Back', image_uris: { normal: url('back') } }] };
    expect(selectCardImage(dfc, lookup({ faceName: 'Missing' }))).toBeNull();
    expect(selectCardImage(dfc, lookup({ faceName: 'Back', faceIndex: 1 }))?.url).toBe(url('back'));
    expect(selectCardImage(dfc, lookup({ faceName: 'Front // Back' }))?.url).toBeUndefined();
  });

  test('MDFC back face uses printed_ref, not the transformed flag', () => {
    const result = cardImageLookup({ ...base, name: 'Bala Ged Recovery', modal_back_face: true, transformed: false, printed_ref: { oracle_id: 'oracle-bala', face_name: 'Bala Ged Recovery' } });
    expect(result.faceIndex).toBe(1);
    expect(result.faceName).toBe('Bala Ged Recovery');
  });

  test('hidden objects never request an image', async () => {
    let calls = 0;
    const resolver = new CardImageResolver({ storage: null, fetcher: (async () => { calls++; return response(card('Forest')); }) as unknown as typeof fetch });
    const descriptor = cardImageLookup({ ...base, face_down: true });
    expect(await resolver.resolve(descriptor)).toEqual({ status: 'unavailable', reason: 'no-identity' });
    expect(calls).toBe(0);
  });
});

describe('tokens', () => {
  test('exact engine token printing wins over name search', async () => {
    const calls: string[] = [];
    const resolver = new CardImageResolver({ storage: null, requestGapMs: 0, fetcher: (async (input: string) => { calls.push(input); return response(card('Soldier', 'token-exact')); }) as unknown as typeof fetch });
    const result = await resolver.resolve(lookup({ name: 'Soldier Token', kind: 'token', tokenRef: { scryfall_id: 'token-exact', preset_id: 'soldier' } }));
    expect(result).toMatchObject({ status: 'ready', source: 'token-id', url: url('token-exact') });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/cards/token-exact');
  });

  test('shape search rejects a same-name token with different P/T', async () => {
    let requested = '';
    const wrong = { ...card('Soldier', 'wrong'), power: '2', toughness: '2', colors: ['W'], type_line: 'Token Creature — Soldier' };
    const right = { ...card('Soldier', 'right'), power: '1', toughness: '1', colors: ['W'], type_line: 'Token Creature — Soldier' };
    const resolver = new CardImageResolver({ storage: null, requestGapMs: 0, fetcher: (async (input: string) => { requested = input; return response({ data: [wrong, right] }); }) as unknown as typeof fetch });
    const result = await resolver.resolve(lookup({ name: 'Soldier Token', kind: 'token', tokenArt: { power: 1, toughness: 1, colors: ['White'], subtypes: ['Soldier'], keywords: [], has_abilities: false } }));
    expect(result).toMatchObject({ status: 'ready', url: url('right'), source: 'token-search' });
    const query = new URL(requested).searchParams.get('q') ?? '';
    expect(query).toContain('pow=1'); expect(query).toContain('tou=1'); expect(query).toContain('c=W'); expect(query).toContain('is:vanilla');
  });
});

describe('cache, deduplication and failures', () => {
  test('shares in-flight requests and caches successes; explicit retry bypasses cache', async () => {
    let calls = 0;
    const resolver = new CardImageResolver({ storage: null, requestGapMs: 0, fetcher: (async () => { calls++; return response(card('Forest')); }) as unknown as typeof fetch });
    const [a, b] = await Promise.all([resolver.resolve(lookup()), resolver.resolve(lookup())]);
    expect(a).toEqual(b); expect(calls).toBe(1);
    await resolver.resolve(lookup()); expect(calls).toBe(1);
    await resolver.resolve(lookup(), true); expect(calls).toBe(2);
  });

  test('429 respects Retry-After and does not hammer the next card', async () => {
    let now = 1000; let calls = 0;
    const resolver = new CardImageResolver({ storage: null, requestGapMs: 0, now: () => now, fetcher: (async () => { calls++; return response({}, 429, { 'Retry-After': '10' }); }) as unknown as typeof fetch });
    expect(await resolver.resolve(lookup())).toEqual({ status: 'unavailable', reason: 'rate-limit', retryAfterMs: 10_000 });
    expect(await resolver.resolve(lookup({ name: 'Grizzly Bears' }))).toMatchObject({ status: 'unavailable', reason: 'rate-limit' });
    expect(calls).toBe(1);
    now += 10_001;
    await resolver.resolve(lookup({ name: 'Grizzly Bears' }));
    expect(calls).toBe(2);
  });

  test('network and missing art are explicit, not hidden-information states', async () => {
    const network = new CardImageResolver({ storage: null, requestGapMs: 0, fetcher: (async () => { throw new TypeError('offline'); }) as unknown as typeof fetch });
    expect(await network.resolve(lookup())).toEqual({ status: 'unavailable', reason: 'network' });
    const missing = new CardImageResolver({ storage: null, requestGapMs: 0, fetcher: (async () => response({}, 404)) as unknown as typeof fetch });
    expect(await missing.resolve(lookup())).toEqual({ status: 'unavailable', reason: 'not-found' });
  });

  test('rejects non-Scryfall image URLs and parses rate-limit headers', () => {
    expect(selectCardImage({ name: 'Forest', image_uris: { normal: 'javascript:alert(1)' } }, lookup())).toBeNull();
    expect(retryAfterMs('3', 0)).toBe(3000);
    expect(retryAfterMs('Thu, 01 Jan 1970 00:00:10 GMT', 0)).toBe(10_000);
  });
});

test('mana fallback includes colored shards', () => {
  expect(manaText({ type: 'Cost', generic: 1, shards: ['Green'] })).toBe('{1}{G}');
  expect(manaText({ type: 'NoCost' })).toBe('');
});

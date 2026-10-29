import type { CardMeta, GameObject, TokenArtDescriptor, TokenImageRef } from '#lib/engine/types.ts';

export interface CardImageLookup {
  oracleId?: string;
  faceName?: string;
  name: string;
  faceIndex: number;
  kind: 'card' | 'token' | 'emblem';
  tokenRef?: TokenImageRef;
  tokenArt?: TokenArtDescriptor;
}

type ImageObject = Pick<GameObject, 'name' | 'transformed' | 'modal_back_face' | 'back_face' | 'printed_ref' | 'face_down' | 'display_visible_to_viewer' | 'display_source' | 'card_types' | 'token_image_ref' | 'token_art' | 'is_emblem' | 'emblem_source'>;

/** Presentation identity only. Game characteristics and visibility stay in Phase. */
export function cardImageLookup(obj: ImageObject): CardImageLookup {
  if (isHidden(obj)) return { name: '', faceIndex: 0, kind: 'card' };
  const faceIndex = obj.transformed || obj.modal_back_face ? 1 : 0;
  if (obj.is_emblem && obj.emblem_source) {
    const source = obj.emblem_source;
    return { name: source.name, oracleId: source.printed_ref?.oracle_id, faceName: source.printed_ref?.face_name ?? source.name, faceIndex: 0, kind: 'emblem' };
  }
  const token = obj.display_source === 'Token' || obj.card_types?.core_types?.includes('Token');
  if (token) {
    return {
      name: obj.name, faceName: obj.printed_ref?.face_name ?? obj.name, faceIndex, kind: 'token',
      oracleId: obj.token_image_ref?.scryfall_oracle_id ?? obj.printed_ref?.oracle_id,
      tokenRef: obj.token_image_ref ?? undefined, tokenArt: obj.token_art ?? undefined
    };
  }
  if (obj.printed_ref) {
    // Phase updates printed_ref to the currently displayed face. Do not swap it
    // again based on `transformed`: MDFCs and copies do not share that flag.
    return { oracleId: obj.printed_ref.oracle_id || undefined, faceName: obj.printed_ref.face_name || obj.name, name: obj.name, faceIndex, kind: 'card' };
  }
  if (obj.transformed) {
    // Legacy objects can stash the original face here. Query that printed name
    // but let faceIndex select the displayed back face from the returned DFC.
    return { name: obj.back_face?.name ?? obj.name, faceIndex: 1, kind: 'card' };
  }
  return { name: obj.name, faceName: obj.name, faceIndex, kind: 'card' };
}

export function isHidden(obj: Pick<GameObject, 'face_down' | 'display_visible_to_viewer'>): boolean {
  return obj.face_down === true || obj.display_visible_to_viewer === false;
}

const COLOR_SYMBOLS: Record<string, string> = { White: 'W', Blue: 'U', Black: 'B', Red: 'R', Green: 'G', Colorless: 'C' };

/** Formats the engine's mana-cost DTO; it never evaluates affordability. */
export function manaText(cost: unknown): string {
  if (!cost) return '';
  if (typeof cost === 'string') return cost;
  if (typeof cost !== 'object') return '';
  const c = cost as Record<string, unknown>;
  if (typeof c.type === 'string' && c.type !== 'Cost') return '';
  if (Array.isArray(c.mana)) return c.mana.map(manaText).join('');
  const generic = typeof c.generic === 'number' && c.generic > 0 ? `{${c.generic}}` : '';
  const shards = Array.isArray(c.shards) ? c.shards.map((shard) => {
    if (typeof shard === 'string') return `{${COLOR_SYMBOLS[shard] ?? shard}}`;
    if (shard && typeof shard === 'object') {
      const s = shard as Record<string, unknown>;
      if (typeof s.type === 'string') return `{${COLOR_SYMBOLS[s.type] ?? s.type}}`;
    }
    return '';
  }).join('') : '';
  return generic + shards;
}

export function typeLine(obj: GameObject, meta?: CardMeta): string {
  const ct = obj.card_types ?? meta?.card_type;
  if (!ct) return '';
  const parts = [...(ct.supertypes ?? []), ...(ct.core_types ?? [])];
  const subs = ct.subtypes ?? [];
  return subs.length ? `${parts.join(' ')} — ${subs.join(' ')}` : parts.join(' ');
}

export function isToken(obj: GameObject): boolean {
  return obj.is_token === true || obj.display_source === 'Token' || obj.card_types?.core_types?.includes('Token') === true;
}

/** Stable serialization for equivalence, not a rules or image-identity hash. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export interface TokenContext { combatRole?: (id: number) => string | undefined; keywordBadges?: Record<string, unknown[]>; copyStatus?: Record<string, unknown> }
export function groupTokens(objects: GameObject[], context: TokenContext = {}): { key: string; name: string; items: GameObject[] }[] {
  const map = new Map<string, GameObject[]>();
  for (const obj of objects) {
    // Deliberately conservative: compare the whole filtered public object, not
    // just its name/art. This includes live/base stats, counters, all ability
    // sets, keywords, attachments, face/tap state and future Phase DTO fields.
    // Only storage identity is excluded. Extra singletons are preferable to
    // concealing a mechanically different permanent behind a representative.
    const { id, card_id, ...publicState } = obj;
    const key = stableJson({ publicState, combat: context.combatRole?.(id), keywords: context.keywordBadges?.[String(id)], copy: context.copyStatus?.[String(id)] });
    const list = map.get(key) ?? [];
    list.push(obj); map.set(key, list);
  }
  return [...map.entries()].map(([key, items]) => ({ key, name: items[0].name, items }));
}

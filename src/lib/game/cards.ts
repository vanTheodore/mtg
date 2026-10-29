import type { CardMeta, GameObject } from '#lib/engine/types.ts';

export interface CardImageLookup {
  oracleId?: string;
  faceName?: string;
  name: string;
  faceIndex: number;
}

export function cardImageLookup(obj: Pick<GameObject, 'name' | 'transformed' | 'back_face' | 'printed_ref' | 'face_down' | 'display_visible_to_viewer'>): CardImageLookup {
  if (obj.printed_ref?.oracle_id) {
    return {
      oracleId: obj.printed_ref.oracle_id,
      faceName: obj.printed_ref.face_name,
      name: obj.name,
      faceIndex: obj.transformed ? 1 : 0
    };
  }
  if (obj.transformed) return { name: obj.back_face?.name ?? obj.name, faceIndex: 1 };
  return { name: obj.name, faceIndex: 0 };
}

export function isHidden(obj: GameObject): boolean {
  return obj.face_down === true || obj.display_visible_to_viewer === false;
}

export function manaText(cost: unknown): string {
  if (!cost) return '';
  if (typeof cost === 'string') return cost;
  if (typeof cost === 'object') {
    const c = cost as Record<string, unknown>;
    if (typeof c.type === 'string' && c.type !== 'Cost') return '';
    if (Array.isArray(c.mana)) return c.mana.map(manaText).join('');
    if (typeof c.generic === 'number') return `{${c.generic}}`;
  }
  return '';
}

export function typeLine(obj: GameObject, meta?: CardMeta): string {
  const ct = obj.card_types ?? meta?.card_type;
  if (!ct) return '';
  const parts = [...(ct.supertypes ?? []), ...(ct.core_types ?? [])];
  const subs = ct.subtypes ?? [];
  return subs.length ? `${parts.join(' ')} — ${subs.join(' ')}` : parts.join(' ');
}

export function groupTokens(objects: GameObject[]): { key: string; name: string; items: GameObject[] }[] {
  const map = new Map<string, GameObject[]>();
  for (const obj of objects) {
    const key = `${obj.controller}:${obj.name}`;
    const list = map.get(key) ?? [];
    list.push(obj);
    map.set(key, list);
  }
  return [...map.entries()].map(([key, items]) => ({ key, name: items[0].name, items }));
}

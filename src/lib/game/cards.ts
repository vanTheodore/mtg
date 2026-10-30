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

export interface ManaPip {
  /** The symbol printed on the card: W, U, B, R, G, C or a generic number. */
  symbol: string;
  kind: 'white' | 'blue' | 'black' | 'red' | 'green' | 'colorless' | 'generic';
}

const PIP_KINDS: Record<string, ManaPip['kind']> = {
  White: 'white', Blue: 'blue', Black: 'black', Red: 'red', Green: 'green', Colorless: 'colorless'
};

/**
 * The same cost as {@link manaText}, but as separate pips so the interface
 * can *show* the cost instead of only naming it. Presentation only: it reads
 * the engine's DTO and never decides what a card costs or what is payable.
 */
export function manaPips(cost: unknown): ManaPip[] {
  if (!cost || typeof cost !== 'object') return [];
  const c = cost as Record<string, unknown>;
  if (typeof c.type === 'string' && c.type !== 'Cost') return [];
  const pips: ManaPip[] = [];
  const generic = typeof c.generic === 'number' && c.generic > 0 ? c.generic : 0;
  if (generic > 0) pips.push({ symbol: String(generic), kind: 'generic' });
  for (const shard of Array.isArray(c.shards) ? c.shards : []) {
    const name = typeof shard === 'string'
      ? shard
      : shard && typeof shard === 'object' && 'type' in shard
        ? String((shard as { type: unknown }).type)
        : '';
    const kind = PIP_KINDS[name];
    if (!kind) continue;
    pips.push({ symbol: COLOR_SYMBOLS[name] ?? name, kind });
  }
  return pips;
}

/**
 * Spanish (es-419) rendering of Phase's English type DTOs. This is presentation
 * only: grouping, filters and rules still read the engine's English keys. When a
 * term has no verified Spanish form the whole line falls back to English instead
 * of mixing languages.
 */
const CORE_TYPES_ES: Record<string, { es: string; gender: 'f' | 'm' }> = {
  Artifact: { es: 'Artefacto', gender: 'm' },
  Creature: { es: 'Criatura', gender: 'f' },
  Enchantment: { es: 'Encantamiento', gender: 'm' },
  Instant: { es: 'Instantáneo', gender: 'm' },
  Land: { es: 'Tierra', gender: 'f' },
  Planeswalker: { es: 'Planeswalker', gender: 'm' },
  Sorcery: { es: 'Conjuro', gender: 'm' }
};
const SUPERTYPES_ES: Record<string, { f: string; m: string }> = {
  Basic: { f: 'básica', m: 'básico' },
  Legendary: { f: 'legendaria', m: 'legendario' },
  Snow: { f: 'nevada', m: 'nevado' }
};
/** Wizards' Spanish card types. Unknown subtypes keep their English name. */
const SUBTYPES_ES: Record<string, string> = {
  Adventure: 'Aventura', Angel: 'Ángel', Arcane: 'Arcano', Armadillo: 'Armadillo', Artificer: 'Artífice',
  Aura: 'Aura', Bear: 'Oso', Beast: 'Bestia', Bird: 'Ave', Cat: 'Gato', Cleric: 'Clérigo',
  Construct: 'Constructo', Demon: 'Demonio', Dog: 'Perro', Druid: 'Druida', Elf: 'Elfo', Equipment: 'Equipo',
  Faerie: 'Hada', Forest: 'Bosque', Goblin: 'Trasgo', Human: 'Humano', Insect: 'Insecto', Island: 'Isla',
  Jace: 'Jace', Knight: 'Caballero', Lhurgoyf: 'Lhurgoyf', Lizard: 'Lagarto', Merfolk: 'Tritón', Monk: 'Monje',
  Mountain: 'Montaña', Myr: 'Myr', Noble: 'Noble', Peasant: 'Campesino', Pirate: 'Pirata', Plains: 'Llanura',
  Rogue: 'Pícaro', Scout: 'Explorador', Shaman: 'Chamán', Sheep: 'Oveja', Skeleton: 'Esqueleto',
  Soldier: 'Soldado', Sphinx: 'Esfinge', Spirit: 'Espíritu', Swamp: 'Pantano', Vampire: 'Vampiro',
  Warrior: 'Guerrero', Wizard: 'Mago', Zombie: 'Zombi'
};

/** "Criatura legendaria — Humano Mago", "Tierra básica — Llanura", "Ficha de criatura — Soldado". */
function spanishTypeLine(supertypes: string[], coreTypes: string[]): string | undefined {
  const isTokenType = coreTypes.includes('Token');
  const cores = coreTypes.filter((type) => type !== 'Token');
  if (!cores.length) return isTokenType ? 'Ficha' : undefined;
  const mapped = cores.map((type) => CORE_TYPES_ES[type]);
  if (mapped.some((entry) => !entry)) return undefined;
  const primary = mapped[mapped.length - 1]!;
  const secondary = mapped.slice(0, -1).map((entry) => entry!.es.toLocaleLowerCase('es'));
  const adjectives = supertypes.map((type) => SUPERTYPES_ES[type]?.[primary.gender]);
  if (adjectives.some((adjective) => !adjective)) return undefined;
  const noun = isTokenType ? primary.es.toLocaleLowerCase('es') : primary.es;
  const head = isTokenType ? `Ficha de ${noun}` : noun;
  const tail = [...adjectives.filter((adjective): adjective is string => !!adjective), ...secondary];
  return tail.length ? `${head} ${tail.join(' ')}` : head;
}

export function typeLine(obj: GameObject, meta?: CardMeta): string {
  const ct = obj.card_types ?? meta?.card_type;
  if (!ct) return '';
  const supertypes = ct.supertypes ?? [];
  const coreTypes = ct.core_types ?? [];
  const subs = ct.subtypes ?? [];
  const localized = spanishTypeLine(supertypes, coreTypes);
  if (!localized) {
    const parts = [...supertypes, ...coreTypes];
    return subs.length ? `${parts.join(' ')} — ${subs.join(' ')}` : parts.join(' ');
  }
  const translatedSubs = subs.map((type) => SUBTYPES_ES[type] ?? type);
  return translatedSubs.length ? `${localized} — ${translatedSubs.join(' ')}` : localized;
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

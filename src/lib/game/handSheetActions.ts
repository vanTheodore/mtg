import type { EngineSnapshot, GameAction, GameObject, ObjectId } from '#lib/engine/types.ts';
import { actionsForObject } from './actions.ts';
import { isManaPrompt, namedAbilityCost } from './interaction.ts';

/**
 * How the hand sheet presents the actions Phase publishes for one card.
 *
 * This module decides nothing about the game. It answers two presentation
 * questions, both derived from `snapshot.legal`:
 *
 *  1. Can one press act for this card without guessing? If there is exactly one
 *     thing to do, that thing is the quick action. If there are several
 *     semantically different things — a cast *and* an activation, two
 *     activations, two cast faces — a single press would be a coin flip, so the
 *     sheet must open the detail and let the player choose.
 *  2. Which of those actions are mana production? Phase's own `manaActions`
 *     owns that judgement (it knows about mana windows); this module only
 *     groups its answer, it never re-derives it.
 *
 * `HandSheet.svelte` used to answer (1) with three independent `find`s and (2)
 * with `!isManaAction(a)`. Both were wrong in opposite directions: the finds
 * proved "there is a land, or exactly one cast" and not "there is exactly one
 * choice", and `isManaAction` counts every `ActivateAbility` as mana while
 * `manaActions` withholds generic activations outside a mana window — so an
 * ability activated from hand matched the "mana" filter, was then rejected by
 * `manaActions`, and the "other actions" filter had already skipped it. It was
 * in neither list.
 */

export type SheetActionKind = 'cast' | 'land' | 'activate' | 'mana' | 'other';

export interface SheetActionChoice {
  action: GameAction;
  kind: SheetActionKind;
  /**
   * Text for the control. Two different actions never share one, and when the
   * detail comes from something Phase did not publish, the label says so
   * instead of inventing a name ("Activar · habilidad 2 (Phase no publicó su
   * descripción)").
   */
  label: string;
  /** This is a second way to cast the same card (adventure, split face…). */
  alternative: boolean;
}

export interface SheetActions {
  /** Exactly one thing to do: a press on the card may do it. */
  quick?: SheetActionChoice;
  /** Everything else, each with its own control. Never empty when `quick` is set. */
  choices: SheetActionChoice[];
  /** Offer the "choose mana manually" control next to each cast. */
  manualPayment: boolean;
}

/** `spell_costs` is keyed by object; a face variant is the same object. */
function isAlternative(action: GameAction, casts: GameAction[]): boolean {
  if (action.type !== 'CastSpell' || casts.length < 2) return false;
  const face = (action.data as { face?: unknown } | undefined)?.face;
  if (face !== undefined && face !== null) return true;
  // With several casts and no face on this one, it is the base cast: the
  // alternatives are the ones that name a face.
  return !casts.some((c) => {
    const f = (c.data as { face?: unknown } | undefined)?.face;
    return f !== undefined && f !== null && c !== action;
  });
}


/**
 * Which printed ability an `ActivateAbility` names.
 *
 * Phase publishes `data.ability_index`, and the object's own `abilities` array
 * carries the definition that index points at (`ability_tag`, `cost`). Both come
 * from the engine; nothing here decides what an ability does. The index is
 * matched against the published array, and when the array does not reach it the
 * answer is `undefined` — a fact, not a guess.
 */
function publishedAbility(object: GameObject | undefined, index: unknown): Record<string, unknown> | undefined {
  if (!object || !Array.isArray(object.abilities) || typeof index !== 'number') return undefined;
  const ability = object.abilities[index];
  return ability && typeof ability === 'object' ? (ability as Record<string, unknown>) : undefined;
}

/** Spanish names for the keyword tags Phase publishes. No keyword is invented. */
const TAG_NAMES: Record<string, string> = {
  Cycling: 'Ciclar', Equip: 'Equipar', Crew: 'Tripular', Saddle: 'Enseillar',
  Ninjutsu: 'Ninjutsu', Channel: 'Canalizar', Unearth: 'Desenterrar',
  Morph: 'Metamorfosis', Megamorph: 'Megametamorfosis', Disguise: 'Disfraz',
  Transmute: 'Transmutar', Forecast: 'Pronosticar', Reconfigure: 'Reconfigurar',
  Embalm: 'Embalsamar', Eternalize: 'Eternalizar', Scavenge: 'Carroñar',
  Adapt: 'Adaptar', Monstrosity: 'Monstruosidad', Renown: 'Renombre',
  Explore: 'Explorar', Outlast: 'Perdurar', Exert: 'Exertar'
};

/**
 * Label for one action Phase published for a card.
 *
 * The old label was the bare verb ("Activar", "Lanzar"), so two different
 * activations of the same card became two identical buttons and the player had
 * to guess. Everything below is read from the snapshot: the ability tag and cost
 * from `objects[id].abilities[index]`, the face from `data.face`. When the
 * snapshot does not carry that part, the label names the gap instead of filling
 * it with a rule this module would be inventing.
 */
export function activationLabel(action: GameAction, object: GameObject | undefined): string {
  const index = (action.data as { ability_index?: unknown } | undefined)?.ability_index;
  const position = typeof index === 'number' ? index + 1 : null;
  const ability = publishedAbility(object, index);
  const tag = (ability?.ability_tag as { type?: unknown } | undefined)?.type;
  const cost = namedAbilityCost(ability?.cost).label;
  const parts: string[] = [];
  if (typeof tag === 'string' && tag) parts.push(TAG_NAMES[tag] ?? tag);
  if (cost) parts.push(cost);
  const detail = parts.join(' · ');
  const ordinal = position === null ? 'habilidad sin índice publicado' : `habilidad ${position}`;
  if (!ability) {
    // Phase did not publish the definition for this index (or none at all).
    return `Activar · ${ordinal} (no publicado por Phase)`;
  }
  if (!detail) {
    // The definition exists but names neither a keyword nor a cost: say that
    // rather than print two buttons that read the same.
    return `Activar · ${ordinal} (sin nombre publicado)`;
  }
  return `Activar · ${detail}`;
}

/** Label for one cast: the base face and each alternative read differently. */
export function castLabel(action: GameAction, object: GameObject | undefined, alternative: boolean): string {
  const face = (action.data as { face?: unknown } | undefined)?.face;
  if (typeof face === 'string' && face) {
    const back = object?.back_face?.name;
    const label = back ? `Lanzar · ${face} (${back})` : `Lanzar · ${face}`;
    return alternative ? `${label} · alternativa` : label;
  }
  if (!alternative) return 'Lanzar';
  // A second cast with no face: Phase published the choice but not its name.
  return 'Lanzar · segunda forma (Phase no publicó su nombre)';
}

export function sheetActions(snapshot: EngineSnapshot | null, objectId: ObjectId): SheetActions {
  if (!snapshot) return { choices: [], manualPayment: false };
  // Phase may publish the same action twice (the same activation reachable from
  // two paths); `manaActions` already de-duplicates by its JSON shape and the
  // list follows the same rule, so one control never means two dispatches.
  const published = [...new Map(
    actionsForObject(snapshot.legal.by_object ?? {}, objectId)
      .map((action) => [JSON.stringify(action), action] as const)
  ).values()];
  if (!published.length) return { choices: [], manualPayment: false };

  // Phase's own judgement: a generic activation counts as mana only inside a
  // mana window, exactly as `manaActions` decides it. Land/source taps are
  // always mana. Nothing here re-derives the rule — it mirrors the one the
  // engine-facing helper already applies, so both agree.
  const manaPrompt = isManaPrompt(snapshot);
  const manaSet = new Set(published.filter((action) => action.type === 'TapLandForMana'
    || action.type === 'ActivateManaSource'
    || (action.type === 'ActivateAbility' && manaPrompt)));
  const casts = published.filter((action) => action.type === 'CastSpell');

  const object = snapshot.state?.objects?.[String(objectId)];
  const choices: SheetActionChoice[] = published.map((action) => {
    if (action.type === 'CastSpell') {
      const alternative = isAlternative(action, casts);
      return { action, kind: 'cast', label: castLabel(action, object, alternative), alternative };
    }
    if (action.type === 'PlayLand') return { action, kind: 'land', label: 'Jugar tierra', alternative: false };
    if (manaSet.has(action)) return { action, kind: 'mana', label: 'Producir maná', alternative: false };
    if (action.type === 'ActivateAbility') {
      return { action, kind: 'activate', label: activationLabel(action, object), alternative: false };
    }
    return { action, kind: 'other', label: 'Elegir esta opción', alternative: false };
  });

  return {
    quick: choices.length === 1 ? choices[0] : undefined,
    choices,
    manualPayment: casts.length > 0
  };
}

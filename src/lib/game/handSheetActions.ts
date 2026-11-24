import type { EngineSnapshot, GameAction, ObjectId } from '#lib/engine/types.ts';
import { actionsForObject } from './actions.ts';
import { isManaPrompt } from './interaction.ts';

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
  /** Text for a button. Behaviour, not intent: "Lanzar", "Producir maná". */
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

  const choices: SheetActionChoice[] = published.map((action) => {
    if (action.type === 'CastSpell') {
      return { action, kind: 'cast', label: 'Lanzar', alternative: isAlternative(action, casts) };
    }
    if (action.type === 'PlayLand') return { action, kind: 'land', label: 'Jugar tierra', alternative: false };
    if (manaSet.has(action)) return { action, kind: 'mana', label: 'Producir maná', alternative: false };
    if (action.type === 'ActivateAbility') return { action, kind: 'activate', label: 'Activar', alternative: false };
    return { action, kind: 'other', label: 'Elegir esta opción', alternative: false };
  });

  return {
    quick: choices.length === 1 ? choices[0] : undefined,
    choices,
    manualPayment: casts.length > 0
  };
}

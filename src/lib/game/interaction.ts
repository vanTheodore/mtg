import type { AttackTarget, EngineSnapshot, GameAction, GameObject, ObjectId, PlayerId, TargetRef } from '#lib/engine/types.ts';
import { manaText } from './cards.ts';

/** Presentation of Phase's legal-action DTO. This module never evaluates rules. */
export type NormalizedTarget = { kind: 'player'; id: PlayerId } | { kind: 'object'; id: ObjectId };
/** Phase serializes TargetRef as `{Player: id}` or `{Object: id}`; accept only those. */
export function parseTarget(value: unknown): NormalizedTarget | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.Player === 'number') return { kind: 'player', id: v.Player };
  if (typeof v.Object === 'number') return { kind: 'object', id: v.Object };
  return undefined;
}
export const sameTarget = (a: unknown, b: unknown): boolean => {
  const x = parseTarget(a); const y = parseTarget(b);
  return !!x && !!y && x.kind === y.kind && x.id === y.id;
};
export const objectTarget = (id: ObjectId): TargetRef => ({ Object: id });
export const playerTarget = (id: PlayerId): TargetRef => ({ Player: id });
export const isTargetPrompt = (s: EngineSnapshot | null) => s?.state.waiting_for.type === 'TargetSelection' || s?.state.waiting_for.type === 'TriggerTargetSelection';
export const isManaPrompt = (s: EngineSnapshot | null) => ['ManaPayment', 'ManaAbilityManaPayment', 'ManaSourceSelection', 'UnlessPayment'].includes(s?.state.waiting_for.type ?? '');
export const isManaAction = (a: GameAction) => ['TapLandForMana', 'ActivateManaSource', 'ActivateAbility'].includes(a.type);
export function actionObjectId(a: GameAction): ObjectId | undefined {
  const d = a.data ?? {};
  const selection = d.selection as { source?: { object_id?: ObjectId } } | undefined;
  const id = d.object_id ?? d.source_id ?? selection?.source?.object_id;
  return typeof id === 'number' ? id : undefined;
}
export function manaActions(s: EngineSnapshot | null, id?: ObjectId): GameAction[] {
  if (!s) return [];
  // Asking for one permanent must not walk every object on the board: the
  // per-card pass does this for each permanent on every click.
  const groups = id === undefined ? Object.values(s.legal.by_object).flat() : (s.legal.by_object[String(id)] ?? []);
  const seen = new Set<string>();
  return [...s.legal.actions, ...groups].filter((a) => {
    if (!isManaAction(a) || (id !== undefined && actionObjectId(a) !== id)) return false;
    // Generic ActivateAbility is shown as mana only during a mana window.
    if (a.type === 'ActivateAbility' && !isManaPrompt(s)) return false;
    const key = JSON.stringify(a);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function targetAction(s: EngineSnapshot | null, target: TargetRef): GameAction | undefined {
  if (!isTargetPrompt(s)) return undefined;
  return s!.legal.actions.find((a) => a.type === 'ChooseTarget' && sameTarget(a.data?.target, target));
}
export function attackTargets(s: EngineSnapshot | null, id: ObjectId): AttackTarget[] {
  const w = s?.state.waiting_for;
  if (w?.type !== 'DeclareAttackers' || !w.data?.valid_attacker_ids?.includes(id)) return [];
  return w.data.valid_attack_targets_by_attacker?.[String(id)] ?? [];
}
export function blockTargets(s: EngineSnapshot | null, id: ObjectId): ObjectId[] {
  const w = s?.state.waiting_for;
  if (w?.type !== 'DeclareBlockers' || !w.data?.valid_blocker_ids?.includes(id)) return [];
  return w.data?.valid_block_targets?.[String(id)] ?? [];
}
/**
 * Pure decision for one card click during blocker declaration. The engine
 * supplies `validBlockTargets`; this only decides which pair the person was
 * forming (attacker-first or blocker-first) and never invents legality.
 */
export function nextBlockAssignment(
  selected: ObjectId | null,
  clicked: ObjectId,
  attackers: ObjectId[],
  validBlockTargets: (id: ObjectId) => ObjectId[]
): { selected: ObjectId | null; assignment?: [ObjectId, ObjectId] } {
  if (selected !== null && attackers.includes(selected) && validBlockTargets(clicked).includes(selected)) {
    return { selected: null, assignment: [clicked, selected] };
  }
  if (selected !== null && validBlockTargets(selected).includes(clicked)) {
    return { selected: null, assignment: [selected, clicked] };
  }
  return { selected: selected === clicked ? null : clicked };
}
export function canSelectObject(s: EngineSnapshot | null, id: ObjectId): boolean {
  if (!s || isHiddenObject(s.state.objects[String(id)])) return false;
  return !!targetAction(s, objectTarget(id)) || manaActions(s, id).length > 0 || attackTargets(s, id).length > 0 || blockTargets(s, id).length > 0;
}
export function isHiddenObject(o?: GameObject) { return !!o && (o.face_down === true || o.display_visible_to_viewer === false); }

/**
 * The cleanup step (CR 514.1) asks the active player to discard down to the
 * maximum hand size. Phase publishes how many cards to discard and which ones
 * it accepts, so the interface only ever offers those: it never counts the
 * hand itself and never decides what may be discarded.
 */
export type DiscardPrompt = {
  count: number;
  cards: ObjectId[];
  player: PlayerId;
  /** CR 701.9b: "discard up to N" accepts fewer than `count`, including zero. */
  upTo: boolean;
  /**
   * Which prompt asked: the hand-size rule (CR 514.1), a connive (CR 701.51b),
   * a discard effect (CR 701.9b) or a ward cost (CR 702.21b).
   */
  kind: 'cleanup' | 'connive' | 'discard' | 'ward';
  /** Name of the object that asked, when the engine identifies it. */
  source?: string;
};
const DISCARD_KINDS: Record<string, DiscardPrompt['kind']> = {
  DiscardToHandSize: 'cleanup',
  ConniveDiscard: 'connive',
  DiscardChoice: 'discard',
  WardDiscardChoice: 'ward'
};
export function discardPrompt(snapshot: EngineSnapshot | null): DiscardPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  const kind = waiting ? DISCARD_KINDS[waiting.type] : undefined;
  if (!waiting || !kind) return null;
  const data = waiting.data ?? {};
  const cards = (data.cards ?? []) as ObjectId[];
  // A ward cost discards one card per round-trip; the prompt carries no count.
  const count = kind === 'ward'
    ? 1
    : typeof data.count === 'number' ? data.count : 0;
  const source = data.source_id !== undefined
    ? snapshot!.state.objects[String(data.source_id)]?.name
    : undefined;
  return {
    count,
    cards,
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    upTo: data.up_to === true,
    kind,
    source
  };
}
/**
 * Digital-only Alchemy (no CR entry): a batch token entry ("one or more
 * creatures enter … attached to one of them") stamped several hosts, and the
 * controller picks which one. The engine's own note is explicit that this is a
 * choice and NOT a target — hexproof, shroud and protection do not filter the
 * list — so the block only names what Phase published and answers with the
 * `ChooseTarget` the engine offers.
 */
export type TokenHostPrompt = {
  player: PlayerId;
  /** The ability's source, for the block's title. */
  sourceId: ObjectId;
  /** Still-legal hosts, already filtered by the engine. */
  hosts: TargetRef[];
};
export function tokenHostPrompt(snapshot: EngineSnapshot | null): TokenHostPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'ChooseTokenHost') return null;
  const data = waiting.data ?? {};
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : 0,
    hosts: Array.isArray(data.legal_targets) ? (data.legal_targets as TargetRef[]) : []
  };
}
/** The chosen host, as the `ChooseTarget` the engine listed. */
export function chooseTokenHost(host: TargetRef): GameAction {
  return { type: 'ChooseTarget', data: { target: host } };
}

/**
 * CR 702.95a + CR 608.2d: soulbond asks whose partner the creature becomes. The
 * listed objects are legal choices, not targets, and the pairing is optional
 * ("you may pair it with another unpaired creature you control"), so the empty
 * answer is a real one — the engine offers `ChoosePair { partner: None }`.
 */
export type PairPrompt = {
  player: PlayerId;
  /** The creature entering the pairing. */
  sourceId: ObjectId;
  choices: ObjectId[];
};
export function pairPrompt(snapshot: EngineSnapshot | null): PairPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'PairChoice') return null;
  const data = waiting.data ?? {};
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : 0,
    choices: Array.isArray(data.choices)
      ? (data.choices as unknown[]).filter((id): id is ObjectId => typeof id === 'number')
      : []
  };
}
/** CR 702.95a: the partner, or none at all. */
export function choosePair(partner: ObjectId | null): GameAction {
  return { type: 'ChoosePair', data: { partner } };
}

/**
 * CR 118.12: "counter it unless its controller pays {3}" — the payer chooses to
 * pay or to let the effect happen. Two things the prompt has to carry, and both
 * come from the engine:
 *   - the cost, which is an `AbilityCost` and is NOT always mana (life is the
 *     other common one; the rest are object costs the table cannot price);
 *   - what happens on decline, in the engine's own wording, because "no pago"
 *     is a real answer with a consequence.
 * CR 118.12a adds the multi-player variant: `remaining` lists the seats still
 * to be polled, and the first one willing to pay stops the effect.
 */
export type UnlessCostText =
  | { kind: 'mana'; text: string }
  | { kind: 'life'; amount: number }
  /** CR 701.21: an object given up, named by kind and count only. */
  | { kind: 'permanent'; count: number; noun?: string }
  | { kind: 'cards'; verb: 'descartar' | 'exiliar'; count: number }
  | { kind: 'tap' }
  | { kind: 'other' };
export type UnlessPrompt = {
  player: PlayerId;
  cost: UnlessCostText;
  /** What happens to whoever declines: the engine's own wording. */
  effect?: string;
  /** CR 118.12a: seats still to be asked after `player`. */
  remaining: PlayerId[];
};
function unlessCostText(raw: unknown): UnlessCostText {
  const cost = (raw ?? {}) as Record<string, unknown>;
  const type = typeof cost.type === 'string' ? cost.type : '';
  if (type === 'Mana') {
    const text = manaText(cost.cost);
    if (text) return { kind: 'mana', text };
  }
  if (type === 'PayLife') {
    const amount = cost.amount as { type?: string; value?: number } | undefined;
    // CR 119.4: only a fixed amount can be named; anything dynamic stays unnamed
    // rather than printed as a wrong number.
    if (amount?.type === 'Fixed' && typeof amount.value === 'number') {
      return { kind: 'life', amount: amount.value };
    }
  }
  // CR 701.21: `Sacrifice(SacrificeCost)` is flattened onto the tag, so the
  // count and the filter sit next to `type`.
  if (type === 'Sacrifice') {
    const count = fixedCount(cost.count) ?? 1;
    return { kind: 'permanent', count, noun: filterNoun(cost.target) };
  }
  if (type === 'Discard' || type === 'Exile') {
    const count = fixedCount(cost.count) ?? 1;
    return { kind: 'cards', verb: type === 'Discard' ? 'descartar' : 'exiliar', count };
  }
  if (type === 'Tap') return { kind: 'tap' };
  return { kind: 'other' };
}

/** CR 107.3: only a fixed amount can be printed as a number. */
function fixedCount(raw: unknown): number | undefined {
  const quantity = raw as { type?: string; value?: number } | undefined;
  if (quantity && typeof quantity === 'object' && typeof quantity.value === 'number') {
    return quantity.value;
  }
  if (typeof raw === 'number') return raw;
  return undefined;
}

/**
 * CR 701.21: *which* permanents a sacrifice cost accepts is a decided rule, but
 * only the two axes a player reads at a glance are named here — the core type
 * and whose permanent it is. Anything further (a colour, a supertype, a
 * counter) is left to Phase, which is what actually filters the choice; the
 * prompt says so instead of printing a rule the table only half understands.
 */
const CORE_TYPE_ES: Record<string, string> = {
  Creature: 'criatura',
  Artifact: 'artefacto',
  Enchantment: 'encantamiento',
  Land: 'tierra',
  Permanent: 'permanente',
  Planeswalker: 'planeswalker',
  Instant: 'instantáneo',
  Sorcery: 'conjuro',
  Battle: 'batalla'
};
function filterNoun(raw: unknown): string | undefined {
  const filter = raw as { type?: string; type_filters?: unknown; controller?: unknown } | undefined;
  if (!filter || filter.type !== 'Typed') return undefined;
  const types = Array.isArray(filter.type_filters) ? filter.type_filters.filter((t): t is string => typeof t === 'string') : [];
  const only = types.length === 1 ? CORE_TYPE_ES[types[0]] : undefined;
  const owns = filter.controller === 'You';
  if (!only) return owns ? 'que controlas' : undefined;
  return owns ? `${only} que controlas` : only;
}
export function unlessPrompt(snapshot: EngineSnapshot | null): UnlessPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'UnlessPayment') return null;
  const data = waiting.data ?? {};
  const remaining = Array.isArray(data.remaining)
    ? (data.remaining as unknown[]).filter((seat): seat is PlayerId => typeof seat === 'number')
    : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    cost: unlessCostText(data.cost),
    effect:
      typeof data.effect_description === 'string' && data.effect_description
        ? data.effect_description
        : undefined,
    remaining
  };
}
/** What the cost is called in a sentence, or `null` when it cannot be named. */
export function unlessCostLabel(cost: UnlessCostText): string | null {
  if (cost.kind === 'mana') return cost.text;
  if (cost.kind === 'life') return `${cost.amount} ${cost.amount === 1 ? 'vida' : 'vidas'}`;
  if (cost.kind === 'permanent') {
    if (cost.count < 1) return null;
    const noun = cost.noun ?? (cost.count === 1 ? 'permanente' : 'permanentes');
    return `Sacrificar ${cost.count} ${noun}`;
  }
  if (cost.kind === 'cards') {
    if (cost.count < 1) return null;
    return `${cost.verb === 'descartar' ? 'Descartar' : 'Exiliar'} ${cost.count} ${cost.count === 1 ? 'carta' : 'cartas'}`;
  }
  if (cost.kind === 'tap') return 'Girar un permanente';
  return null;
}

/**
 * CR 118.12a: the disjunctive unless-cost — "unless they X or Y". The engine
 * publishes the sub-costs in their own order and accepts either branch or a
 * decline (which runs the effect). This is *not* `UnlessPayment`: there the
 * question is pay-or-not for one cost, here it is **which** cost, so the two
 * prompts cannot share a sentence.
 *
 * The engine can also queue several disjunctions in a row (per-age-counter
 * cumulative upkeep): `remaining_choices` says how many more are coming and
 * `chosen` what was already picked, so the block can count them without
 * inventing an order of its own.
 */
export type UnlessCostBranch = { index: number; label: string | null };
export type UnlessBranchPrompt = {
  player: PlayerId;
  branches: UnlessCostBranch[];
  /** What happens to whoever declines: the engine's own wording. */
  effect?: string;
  /** CR 702.24a: disjunctions still to be answered after this one. */
  remainingChoices: number;
  /** How many branches were already picked in this sequence. */
  chosen: number;
};
export function unlessBranchPrompt(snapshot: EngineSnapshot | null): UnlessBranchPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'UnlessPaymentChooseCost') return null;
  const data = waiting.data ?? {};
  const costs = Array.isArray(data.costs) ? (data.costs as unknown[]) : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    branches: costs.map((cost, index) => ({ index, label: unlessCostLabel(unlessCostText(cost)) })),
    effect:
      typeof data.effect_description === 'string' && data.effect_description
        ? data.effect_description
        : undefined,
    remainingChoices: Array.isArray(data.remaining_choices) ? data.remaining_choices.length : 0,
    chosen: Array.isArray(data.chosen) ? data.chosen.length : 0
  };
}
/** CR 118.12a: one branch by position, or the decline. */
export function chooseUnlessCostBranch(index: number | null): GameAction {
  return {
    type: 'ChooseUnlessCostBranch',
    data: { choice: index === null ? { type: 'Decline' } : { type: 'Pay', data: { index } } }
  };
}
/** CR 118.12: pay, or let it happen. */
export function payUnlessCost(pay: boolean): GameAction {
  return { type: 'PayUnlessCost', data: { pay } };
}

/**
 * CR 701.20a: revealing a card from a hidden zone. Phase publishes the cards the
 * player may pick from (already filtered by the effect) and whether the reveal
 * is optional — the reveal-land pattern, where declining is a real answer that
 * runs the card's other branch.
 *
 * Exactly one card is chosen; an empty selection is the decline. The engine also
 * says what an empty selection *means* (`decline_runs_continuation`): a
 * reveal-from-hand effect runs its decline branch, while an optional follow-up
 * choice simply skips what came next. Same gesture, different consequence, so
 * the prompt carries both flags.
 */
export type RevealPrompt = {
  player: PlayerId;
  cards: ObjectId[];
  /** CR 701.20a: the player may decline by revealing nothing. */
  optional: boolean;
  /** Declining runs the effect's other branch instead of skipping the follow-up. */
  declineRunsContinuation: boolean;
};
export function revealPrompt(snapshot: EngineSnapshot | null): RevealPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'RevealChoice') return null;
  const data = waiting.data ?? {};
  const cards = Array.isArray(data.cards)
    ? (data.cards as unknown[]).filter((id): id is ObjectId => typeof id === 'number')
    : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    cards,
    optional: data.optional === true,
    declineRunsContinuation: data.decline_runs_continuation === true
  };
}
/** One card, or none when the reveal is optional. */
export function revealAction(card: ObjectId | null): GameAction {
  return selectCardsAction(card === null ? [] : [card]);
}

/**
 * CR 702.122a (crew) and CR 702.171a (saddle): tap creatures whose **crew power
 * contribution** adds up to N. The engine publishes the eligible creatures, the
 * number it needs, and one contribution per creature, aligned index-for-index —
 * and it means those numbers, not printed power: a Pilot token contributes more
 * and a Mount can count toughness instead. The table sums what the engine sent.
 *
 * The engine's candidates are the *minimal* covers (`minimal_power_subset_candidates`),
 * but the handler only checks the captured total against the threshold, so any
 * subset that reaches it is legal. The view lets the player pick and shows the
 * running total; Phase validates.
 *
 * Three keywords share this gesture and not this action: crew answers
 * `CrewVehicle`, saddle answers `SaddleMount`, station taps exactly one
 * creature (`StationTarget`) and equip names one target instead (below).
 */
export type TapPowerPrompt = {
  kind: 'crew' | 'saddle';
  player: PlayerId;
  /** The Vehicle or Mount being paid for. */
  sourceId: ObjectId;
  required: number;
  /** CR 702.122a: contributions, aligned with `eligible`. */
  creatures: { id: ObjectId; contribution: number | null }[];
  /** False when the engine sent no contribution list and no total may be claimed. */
  counted: boolean;
};
export function tapPowerPrompt(snapshot: EngineSnapshot | null): TapPowerPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting) return null;
  const kind = waiting.type === 'CrewVehicle' ? 'crew' : waiting.type === 'SaddleMount' ? 'saddle' : null;
  if (!kind) return null;
  const data = waiting.data ?? {};
  const objects = snapshot!.state.objects;
  const eligible = Array.isArray(data.eligible_creatures)
    ? (data.eligible_creatures as unknown[]).filter((id): id is ObjectId => typeof id === 'number')
    : [];
  const raw = Array.isArray(data.contributions) ? (data.contributions as unknown[]) : [];
  const counted = raw.length === eligible.length;
  return {
    kind,
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    sourceId:
      typeof data.vehicle_id === 'number'
        ? (data.vehicle_id as ObjectId)
        : typeof data.mount_id === 'number'
          ? (data.mount_id as ObjectId)
          : 0,
    required:
      typeof data.crew_power === 'number'
        ? data.crew_power
        : typeof data.saddle_power === 'number'
          ? data.saddle_power
          : 0,
    creatures: eligible.map((id, index) => {
      const value = raw[index];
      return { id, contribution: typeof value === 'number' ? value : null };
    }),
    counted
  };
}
/** CR 702.122a / CR 702.171a: the tapped creatures, as the engine expects them. */
/**
 * CR 702.122a: what the picked creatures add up to, according to the engine.
 *
 * The sum is the engine's own `contributions`, not the printed power: a Pilot
 * contributes more and a Mount may count toughness. When the engine published no
 * list there is no total to claim and this returns `null` — the block then shows
 * the pick without a number and lets Phase decide.
 */
export function tapPowerTotal(prompt: TapPowerPrompt, ids: ObjectId[]): number | null {
  if (!prompt.counted) return null;
  return ids.reduce(
    (sum, id) => sum + (prompt.creatures.find((creature) => creature.id === id)?.contribution ?? 0),
    0
  );
}

export function tapPowerAction(prompt: TapPowerPrompt, ids: ObjectId[]): GameAction {
  return prompt.kind === 'crew'
    ? { type: 'CrewVehicle', data: { vehicle_id: prompt.sourceId, creature_ids: [...ids] } }
    : { type: 'SaddleMount', data: { mount_id: prompt.sourceId, creature_ids: [...ids] } };
}

/**
 * CR 301.5 + CR 702.6a: equip. The engine publishes the equipment and the
 * permanents it may attach to; each is one `Equip` action, so this view is a
 * list of the targets and nothing else — no set to compose, no threshold to
 * check.
 */
export type EquipPrompt = { player: PlayerId; equipmentId: ObjectId; targets: ObjectId[] };
export function equipPrompt(snapshot: EngineSnapshot | null): EquipPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'EquipTarget') return null;
  const data = waiting.data ?? {};
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    equipmentId: typeof data.equipment_id === 'number' ? (data.equipment_id as ObjectId) : 0,
    targets: Array.isArray(data.valid_targets)
      ? (data.valid_targets as unknown[]).filter((id): id is ObjectId => typeof id === 'number')
      : []
  };
}
/**
 * CR 702.184a: station. One untapped creature is tapped — **exactly one**, so
 * this is not the crew sum of the block above — and its power, as the engine
 * computes it (CR 702.184c lets a static make it "as though its power were N
 * greater"), becomes the number of charge counters the Spacecraft gets when the
 * ability resolves. The pick is therefore a quantity, not just a permission:
 * which creature you tap is how much the ship charges.
 *
 * The prompt publishes only the candidates (`eligible_creatures`: untapped
 * creatures you control, never the Spacecraft itself), so this view shows no
 * count of its own — the engine's number arrives with the resolution, and the
 * card's printed power is not necessarily it.
 *
 * `CancelCast` is a legal answer while the prompt is open: the tap cost is not
 * paid until the announcement (CR 602.2b), so backing out undoes nothing.
 */
export type StationPrompt = { player: PlayerId; spacecraftId: ObjectId; creatures: ObjectId[] };
export function stationPrompt(snapshot: EngineSnapshot | null): StationPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'StationTarget') return null;
  const data = waiting.data ?? {};
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    spacecraftId: typeof data.spacecraft_id === 'number' ? (data.spacecraft_id as ObjectId) : 0,
    creatures: Array.isArray(data.eligible_creatures)
      ? (data.eligible_creatures as unknown[]).filter((id): id is ObjectId => typeof id === 'number')
      : []
  };
}
/**
 * CR 608.2c + CR 115.10a: `ChooseObjectsIntoTrackedSet` and the described damage
 * recipient. Neither is a *target*: the prompt names a set of battlefield
 * permanents (plus, for a damage recipient, the seats) and the engine publishes a
 * **window** — at least `min`, at most `max`, and `max` absent means "any number"
 * and clamps to the eligible set. Picks must be distinct.
 *
 * Two consequences the block states instead of guessing:
 *
 *   - CR 608.2c: the selection becomes a **fresh tracked set** ("those
 *     creatures"), a new resolution scope for the rest of the effect; selecting
 *     nothing yields an empty set, which is legal only when `min == 0`;
 *   - CR 115.10a: a pick made while the instruction is applied is not announced as
 *     a target, so ward, hexproof, shroud and protection never restrict it — which
 *     is why a player may appear in the eligible set here and nowhere else.
 */
export type ChooseObjectsPrompt = {
  player: PlayerId;
  eligible: TargetRef[];
  min: number;
  /** Clamped to the eligible set, exactly as the engine's own projection does. */
  max: number;
  /** `max` was absent in the payload: "any number" of the eligible objects. */
  openMax: boolean;
  /** A seat is eligible, so this is a described damage recipient. */
  recipient: boolean;
  /** The trigger whose resolution raised the prompt (CR 608.2). */
  triggered: boolean;
};
export function chooseObjectsPrompt(snapshot: EngineSnapshot | null): ChooseObjectsPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'ChooseObjectsSelection') return null;
  const data = waiting.data ?? {};
  const eligible = Array.isArray(data.eligible)
    ? (data.eligible as unknown[])
        .map((entry) => parseTarget(entry))
        .filter((entry): entry is NormalizedTarget => !!entry)
        .map((entry) => (entry.kind === 'player' ? playerTarget(entry.id) : objectTarget(entry.id)))
    : [];
  const min = typeof data.min === 'number' ? Math.max(0, data.min) : 0;
  const openMax = typeof data.max !== 'number';
  // A missing maximum is the eligible set: "any number" cannot need more objects
  // than the ones it may pick from.
  const max = Math.min(openMax ? eligible.length : Math.max(0, data.max as number), eligible.length);
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    eligible,
    min,
    max,
    openMax,
    recipient: eligible.some((target) => parseTarget(target)?.kind === 'player'),
    triggered: !!data.trigger_event
  };
}
/** CR 608.2c: one `SelectTargets` answer, distinct, in the chosen order. */
export function chooseObjectsAction(targets: TargetRef[]): GameAction {
  return { type: 'SelectTargets', data: { targets: targets.map((target) => ({ ...target })) } };
}

/**
 * CR 115.7: changing the targets of a spell or ability already on the stack.
 * "Each target can be changed only to another legal target" — a per-position rule,
 * which is why the engine publishes a candidate pool **per position**
 * (`slot_pools`, aligned with `slots`) and a flat union (`legal_new_targets`) only
 * as the fallback for payloads that predate the per-position field.
 *
 * The submission is an `Option` per position, in the prompt's index space: `null`
 * keeps that target, a `TargetRef` changes it. That is what splits the two scopes:
 *
 *   - `single` ("change the target of target spell"): exactly one pick, and it
 *     cannot be "keep" — the engine rejects a null there;
 *   - `all` ("choose new targets"): the same number of positions as the spell has
 *     targets, and any of them may stay.
 *
 * `forced` is not interactive: the engine applies it and rejects a submission, so
 * this view never offers it.
 */
export type RetargetScopeKind = 'single' | 'all';
export type RetargetPrompt = {
  player: PlayerId;
  stackEntryIndex: number;
  scope: RetargetScopeKind;
  /** The declared targets, in the prompt's order. */
  current: TargetRef[];
  /** Per position, exactly what that position admits. */
  pools: TargetRef[][];
  /** The flat union — only a fallback, never an admission set of its own. */
  union: TargetRef[];
  /**
   * Per position, whether the announced object is gone, so keeping it and naming
   * the same id are DIFFERENT objects (CR 115.7d + CR 400.7). Only there does the
   * declared target belong among its own alternatives.
   */
  keepDistinct: boolean[];
};
export function retargetPrompt(snapshot: EngineSnapshot | null): RetargetPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'RetargetChoice') return null;
  const data = waiting.data ?? {};
  const rawScope = data.scope as { type?: string } | undefined;
  if (rawScope?.type === 'ForcedTo') return null;
  const toTargets = (value: unknown): TargetRef[] =>
    Array.isArray(value)
      ? value
          .map((entry) => parseTarget(entry))
          .filter((entry): entry is NormalizedTarget => !!entry)
          .map((entry) => (entry.kind === 'player' ? playerTarget(entry.id) : objectTarget(entry.id)))
      : [];
  const current = toTargets(data.current_targets);
  const union = toTargets(data.legal_new_targets);
  const rawPools = Array.isArray(data.slot_pools) ? (data.slot_pools as unknown[]) : [];
  // An outer-empty `slot_pools` means no per-position refinement was recorded, so
  // every position falls back to the union — the engine's own rule.
  const pools = rawPools.length
    ? current.map((_, index) => (Array.isArray(rawPools[index]) ? toTargets(rawPools[index]) : union))
    : current.map(() => union);
  const rawKeep = Array.isArray(data.keep_is_distinct) ? (data.keep_is_distinct as unknown[]) : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    stackEntryIndex: typeof data.stack_entry_index === 'number' ? data.stack_entry_index : -1,
    scope: rawScope?.type === 'Single' ? 'single' : 'all',
    current,
    pools,
    union,
    keepDistinct: current.map((_, index) => rawKeep[index] === true)
  };
}
/** `null` keeps a position; `single` needs one non-null entry and no more. */
export function retargetAction(newTargets: (TargetRef | null)[]): GameAction {
  return { type: 'RetargetSpell', data: { new_targets: newTargets.map((target) => target ?? null) } };
}

/**
 * CR 122.5 + CR 608.2d: "move any number of counters". A different question from
 * the division above: the amount is not fixed — **the available pool is** — and the
 * counters leave the source as they arrive at each destination, one
 * `CounterMoveChoice` per (destination, type) pair.
 *
 * The engine publishes the source, the counters on it by type, and the legal
 * destinations. Its validator refuses a zero count, a destination outside the
 * list, a repeated (destination, type) pair, and any request that exceeds what is
 * available *of that type*; moving nothing is legal, because the text says "may".
 *
 * Counter types are flat strings on the wire (`P1P1`, `M1M1`, `loyalty`,
 * `flying`…). `counterLabel` translates the ones a table meets constantly and
 * otherwise shows the engine's own string — it never invents a name.
 */
export type CounterOffer = { type: string; count: number };
export type MoveCountersPrompt = {
  player: PlayerId;
  sourceId: ObjectId;
  /** Set when the effect narrowed the counters it moves. */
  counterType: string | null;
  available: CounterOffer[];
  destinations: ObjectId[];
};
export function moveCountersPrompt(snapshot: EngineSnapshot | null): MoveCountersPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'MoveCountersDistribution') return null;
  const data = waiting.data ?? {};
  const available: CounterOffer[] = Array.isArray(data.available)
    ? (data.available as unknown[])
        .map((entry) => {
          if (!Array.isArray(entry) || typeof entry[0] !== 'string' || typeof entry[1] !== 'number') return null;
          return { type: entry[0] as string, count: entry[1] as number };
        })
        .filter((entry): entry is CounterOffer => entry !== null)
    : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : 0,
    counterType: typeof data.counter_type === 'string' ? data.counter_type : null,
    available,
    destinations: Array.isArray(data.destinations)
      ? (data.destinations as unknown[]).filter((id): id is ObjectId => typeof id === 'number')
      : []
  };
}
export type CounterMoveSelection = { destinationId: ObjectId; counterType: string; count: number };
export function moveCountersAction(selections: CounterMoveSelection[]): GameAction {
  return {
    type: 'ChooseCounterMoveDistribution',
    data: {
      selections: selections.map(({ destinationId, counterType, count }) => ({
        destination_id: destinationId,
        counter_type: counterType,
        count
      }))
    }
  };
}

/**
 * CR 601.2d + CR 608.2d: a division. The engine publishes the amount, the legal
 * recipients (`TargetRef`s, so players count too) and **when** the division is
 * chosen:
 *
 *   - `announced` — chosen while the spell is cast (CR 601.2d): every target must
 *     receive at least one, so the whole amount is divided among *all* of them.
 *   - `resolution` — chosen as the effect applies (CR 608.2d): the chooser may
 *     leave candidates out, and each one that is named receives at least one.
 *
 * `EvenSplitDamage` is the exception the wire can carry: the engine computes
 * `total / num_targets` itself, so there is no division for the player to choose
 * and the block only says so.
 *
 * The single validator (`validate_distribution`) checks the sum, that no entry is
 * zero, that no recipient repeats, and — for `announced` — that every target is
 * named. The view states those rules and Phase remains the one that enforces them.
 */
export type DistributeUnit = 'damage' | 'even' | 'counters' | 'life';
export type DistributePrompt = {
  player: PlayerId;
  total: number;
  unit: DistributeUnit;
  /** `Counters(<type>)` carries what is being placed; the rest carry nothing. */
  counterType: string | null;
  scope: 'announced' | 'resolution';
  targets: TargetRef[];
};
export function distributePrompt(snapshot: EngineSnapshot | null): DistributePrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'DistributeAmong') return null;
  const data = waiting.data ?? {};
  const rawUnit = data.unit as { type?: string; data?: unknown } | undefined;
  const unit: DistributeUnit =
    rawUnit?.type === 'EvenSplitDamage'
      ? 'even'
      : rawUnit?.type === 'Counters'
        ? 'counters'
        : rawUnit?.type === 'Life'
          ? 'life'
          : 'damage';
  const rawScope = data.scope as { type?: string } | undefined;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    total: typeof data.total === 'number' ? data.total : 0,
    unit,
    counterType: unit === 'counters' && typeof rawUnit?.data === 'string' ? rawUnit.data : null,
    scope: rawScope?.type === 'ResolutionCandidates' ? 'resolution' : 'announced',
    targets: Array.isArray(data.targets)
      ? (data.targets as unknown[]).map((t) => parseTarget(t)).filter((t): t is NormalizedTarget => !!t)
          .map((t) => (t.kind === 'player' ? playerTarget(t.id) : objectTarget(t.id)))
      : []
  };
}
/** A stable key for the split map: a `TargetRef` is not a key of its own. */
export function targetKey(target: unknown): string {
  const t = parseTarget(target);
  return t ? `${t.kind}:${t.id}` : 'none';
}
export function distributeAction(distribution: [TargetRef, number][]): GameAction {
  return { type: 'DistributeAmong', data: { distribution: distribution.map(([target, amount]) => [target, amount]) } };
}
/**
 * The even split the engine documents for `EvenSplitDamage`: `total / n` rounded
 * down per target, with the remainder on the last one — and only when every
 * recipient still gets at least one, which the validator requires.
 */
export function evenSplit(total: number, count: number): number[] | null {
  if (count <= 0) return total === 0 ? [] : null;
  const base = Math.floor(total / count);
  if (base < 1) return null;
  const parts = Array.from({ length: count }, () => base);
  parts[count - 1] += total - base * count;
  return parts;
}

/**
 * CR 601.2c: a spell or ability with more than one instance of the word "target"
 * ("any number of targets", "up to two target creatures") asks for **a set**, not
 * a sum and not a single pick. The engine publishes the legal targets and a
 * window — `min_targets..=max_targets` — and answers `SelectCards`.
 *
 * The window is the whole gate: `min` is 0 when the text says "up to", and
 * `min == max` when the count is fixed. The engine also refuses the same target
 * twice (CR 115.3), so the view offers each one once and toggles it.
 *
 * `pending_ability.source_id` is attribution only, but it is enough to name the
 * spell that is asking; when it is missing the block does not invent a name.
 */
export type MultiTargetPrompt = {
  player: PlayerId;
  /** The spell or ability asking, when the engine attributed it. */
  sourceId: ObjectId | null;
  min: number;
  max: number;
  targets: ObjectId[];
};
export function multiTargetPrompt(snapshot: EngineSnapshot | null): MultiTargetPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'MultiTargetSelection') return null;
  const data = waiting.data ?? {};
  const ability = data.pending_ability as { source_id?: unknown } | undefined;
  const sourceId = typeof ability?.source_id === 'number' ? (ability.source_id as ObjectId) : null;
  const targets = Array.isArray(data.legal_targets)
    ? (data.legal_targets as unknown[]).filter((id): id is ObjectId => typeof id === 'number')
    : [];
  const min = typeof data.min_targets === 'number' ? data.min_targets : 0;
  // A missing maximum is the number of legal targets: "any number" can never need
  // more than the set it may pick from.
  const max = typeof data.max_targets === 'number' ? data.max_targets : targets.length;
  return { player: typeof data.player === 'number' ? data.player : snapshot!.viewer, sourceId, min, max, targets };
}
export function multiTargetAction(targets: ObjectId[]): GameAction {
  return selectCardsAction(targets);
}

export function stationAction(spacecraftId: ObjectId, creatureId: ObjectId): GameAction {
  return { type: 'ActivateStation', data: { spacecraft_id: spacecraftId, creature_id: creatureId } };
}

export function equipAction(equipmentId: ObjectId, targetId: ObjectId): GameAction {
  return { type: 'Equip', data: { equipment_id: equipmentId, target_id: targetId } };
}

/**
 * CR 701.22a (scry) and CR 701.25a (surveil), as the engine writes them: look at
 * the top N and put any number back **in any order**. The two prompts carry the
 * same shape — the deciding seat and the cards it looked at — but the rest goes
 * to different places, and that difference is the whole view:
 *
 *   - scry: what is not kept goes to the **bottom** of the library;
 *   - surveil: what is not kept goes to the **graveyard**.
 *
 * The answer is `SelectCards` carrying the ordered **keep-on-top** set; every
 * looked-at card outside it takes the other destination. Phase's candidates only
 * enumerate the empty set, the full set and each single card, so the table
 * composes the selection from what the player marks — the rule allows any
 * subset in any order, and Phase is still the one that validates it.
 */
export type ScryPrompt = {
  kind: 'scry' | 'surveil';
  player: PlayerId;
  /** The looked-at cards, in library order (first is the top). */
  cards: ObjectId[];
};
export function scryPrompt(snapshot: EngineSnapshot | null): ScryPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting) return null;
  const kind = waiting.type === 'ScryChoice' ? 'scry' : waiting.type === 'SurveilChoice' ? 'surveil' : null;
  if (!kind) return null;
  const data = waiting.data ?? {};
  return {
    kind,
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    cards: Array.isArray(data.cards)
      ? (data.cards as unknown[]).filter((id): id is ObjectId => typeof id === 'number')
      : []
  };
}
/** The ordered set that stays on top; the rest takes the other destination. */
export function scryAction(keepOnTop: ObjectId[]): GameAction {
  return selectCardsAction(keepOnTop);
}

/**
 * CR 103.1: before the first turn of game 1 the players roll, and the winner
 * **chooses who takes the first turn** — the roll does not decide it. The engine
 * publishes the chooser (`player`) and the seats that may be named
 * (`candidates`, in seat order); under shared team turns (CR 103.1a) the choice
 * names a starting team, so a candidate is a seat, not necessarily a person.
 *
 * The answer is the seat itself. Nothing here re-rolls or re-orders: the
 * contest already happened inside the engine, and `candidates` is what it will
 * accept.
 */
export type StartingPlayerPrompt = { player: PlayerId; candidates: PlayerId[] };
export function startingPlayerPrompt(snapshot: EngineSnapshot | null): StartingPlayerPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'ChooseStartingPlayer') return null;
  const data = waiting.data ?? {};
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    candidates: Array.isArray(data.candidates)
      ? (data.candidates as unknown[]).filter((seat): seat is PlayerId => typeof seat === 'number')
      : []
  };
}
/** CR 103.1: the seat that takes the first turn. */
export function chooseStartingPlayer(player: PlayerId): GameAction {
  return { type: 'ChooseStartingPlayer', data: { player } };
}

/**
 * CR 702.21a/b: paying a ward cost by sacrificing. This prompt is reached only
 * **after** the payer said yes to the ward, so there is no "no pago" among the
 * options: the engine accepts exactly one permanent per round-trip, or — when
 * the cost asks for permanents whose total power reaches a threshold — one set
 * it has already found.
 *
 * The options are Phase's own `SelectCards` candidates, in the engine's order.
 * The table does not build a set of its own: it cannot know which combinations
 * the engine will accept beyond the one it published.
 */
export type WardSacrificeOption = { cards: ObjectId[]; power: number | null };
export type WardSacrificePrompt = {
  player: PlayerId;
  options: WardSacrificeOption[];
  /** Sacrifices still owed after this one (`remaining` in the engine). */
  remaining: number;
  /** CR 118.12a: total power the chosen set must reach, when the cost says so. */
  minTotalPower?: number;
};
export function wardSacrificePrompt(snapshot: EngineSnapshot | null): WardSacrificePrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'WardSacrificeChoice') return null;
  const data = waiting.data ?? {};
  const objects = snapshot!.state.objects;
  const powerOf = (id: ObjectId) => {
    const power = objects[String(id)]?.power;
    return typeof power === 'number' ? power : null;
  };
  const options: WardSacrificeOption[] = [];
  for (const action of snapshot!.legal.actions) {
    if (action.type !== 'SelectCards') continue;
    const cards = Array.isArray(action.data?.cards)
      ? (action.data.cards as unknown[]).filter((id): id is ObjectId => typeof id === 'number')
      : [];
    const powers = cards.map(powerOf);
    options.push({
      cards,
      // CR 208.1: the total is for display only, and only when every power is known.
      power: powers.length && powers.every((value) => value !== null)
        ? powers.reduce<number>((sum, value) => sum + (value ?? 0), 0)
        : null
    });
  }
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    options,
    remaining: typeof data.remaining === 'number' ? data.remaining : 1,
    minTotalPower: typeof data.min_total_power === 'number' ? data.min_total_power : undefined
  };
}
/** CR 702.21b: the selected permanents, exactly as the engine listed them. */
export function wardSacrificeAction(cards: ObjectId[]): GameAction {
  return selectCardsAction(cards);
}

/**
 * CR 702.104a: a Tribute creature enters and **an opponent** decides whether to
 * put the counters on it. The engine names the decider (`player`), the creature
 * (`source_id`) and how many +1/+1 counters the tribute is worth (`count`).
 *
 * It answers with the same `DecideOptionalEffect` as "you may", but the question
 * is not the controller's: paying the tribute helps the creature, and declining
 * is what turns on the card's "if tribute wasn't paid" ability (CR 702.104b), so
 * the block has to say both things in its own words.
 */
export type TributePrompt = { player: PlayerId; sourceId: ObjectId; count: number };
export function tributePrompt(snapshot: EngineSnapshot | null): TributePrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'TributeChoice') return null;
  const data = waiting.data ?? {};
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : 0,
    count: typeof data.count === 'number' && data.count > 0 ? data.count : 0
  };
}
/** CR 702.104a: pay the tribute (counters) or decline it. */
export function decideTribute(pay: boolean): GameAction {
  return { type: 'DecideOptionalEffect', data: { accept: pay } };
}

/**
 * CR 608.2d: "you may" asks the controller whether to perform the instruction.
 * The engine answers it with a plain accept/decline, and — when the prompt
 * carries a `may_trigger_key` — lets the player stop being asked: for that exact
 * instance, or (only when the engine publishes the capability) for every
 * occurrence printed on the same card.
 *
 * The same action also answers `OpponentMayChoice`, and that is a different
 * question: the seat being asked does NOT control the source, and the engine
 * publishes the opponents still to come (`remaining`, APNAP order). Nothing can
 * be remembered there — the payload carries no `may_trigger_key` —, so the two
 * capabilities below are false by construction, not by omission.
 */
export type OptionalEffectPrompt = {
  player: PlayerId;
  /** The ability's source. */
  sourceId: ObjectId;
  /** CR 608.2d: the single object the instruction acts on, when latched. */
  subjectId?: ObjectId;
  /** What would happen: the engine's own wording. */
  description?: string;
  /** The answer can be remembered for this trigger (CR 603.5). */
  rememberable: boolean;
  /** …and the engine offers the wider same-card scope. */
  sameCardAvailable: boolean;
  /** Whose decision this is: the source's controller, or another player. */
  asked: 'controller' | 'opponent';
  /** Seats that still have to answer this same question after `player`. */
  remaining: PlayerId[];
};
export function optionalEffectPrompt(snapshot: EngineSnapshot | null): OptionalEffectPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting) return null;
  const opponent = waiting.type === 'OpponentMayChoice';
  if (waiting.type !== 'OptionalEffectChoice' && !opponent) return null;
  const data = waiting.data ?? {};
  const keyed = !opponent && data.may_trigger_key != null;
  const remaining = Array.isArray(data.remaining)
    ? (data.remaining as unknown[]).filter((seat): seat is PlayerId => typeof seat === 'number')
    : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : 0,
    subjectId: typeof data.decision_subject_id === 'number' ? (data.decision_subject_id as ObjectId) : undefined,
    description: typeof data.description === 'string' && data.description ? data.description : undefined,
    rememberable: keyed,
    sameCardAvailable: keyed && data.same_card_may_trigger_choice_available === true,
    asked: opponent ? 'opponent' : 'controller',
    remaining
  };
}
/** CR 608.2d: accept or decline, once. */
export function decideOptionalEffect(accept: boolean): GameAction {
  return { type: 'DecideOptionalEffect', data: { accept } };
}
/** CR 603.5: accept or decline, and stop asking within the chosen scope. */
export function rememberOptionalEffect(accept: boolean, sameCard: boolean): GameAction {
  return {
    type: 'DecideOptionalEffectAndRemember',
    data: {
      choice: { type: accept ? 'Accept' : 'Decline' },
      scope: { type: sameCard ? 'SameCard' : 'ExactInstance' }
    }
  };
}

/**
 * CR 701.20e: a "look at the top N" effect shows the cards to one player, who
 * keeps some and sends the rest somewhere. Phase publishes the cards, which of
 * them pass the effect's filter, how many may be kept and — crucially — WHERE
 * both piles end up, because "put it on top of your library" and "into your
 * hand" ask for different decisions on the same cards.
 */
export type DigPrompt = {
  player: PlayerId;
  /** Every card looked at, in the order the effect found them. */
  cards: ObjectId[];
  /** The subset that passes the filter; the rest are shown but not keepable. */
  selectable: ObjectId[];
  /** How many may be kept, already capped by `selectable`. */
  count: number;
  /** `0..=count` is legal ("up to N"); otherwise exactly `count`. */
  partial: boolean;
  keptLabel: string;
  restLabel: string;
  enterTapped: boolean;
  entersAttacking: boolean;
};
/**
 * Where a pile lands, in words. Two maps, because the phrase differs by role:
 * the pile the player keeps is named as a place ("tu mano"), the pile that
 * leaves is named as a movement ("al cementerio").
 */
const KEPT_PLACES: Record<string, string> = {
  Library: 'la parte superior de tu biblioteca',
  Hand: 'tu mano',
  Battlefield: 'el campo de batalla',
  Graveyard: 'el cementerio',
  Exile: 'el exilio',
  Stack: 'la pila'
};
const REST_PLACES: Record<string, string> = {
  Library: 'al fondo de tu biblioteca',
  Hand: 'a tu mano',
  Battlefield: 'al campo de batalla',
  Graveyard: 'al cementerio',
  Exile: 'al exilio',
  Stack: 'a la pila'
};
const place = (map: Record<string, string>, zone: unknown) =>
  typeof zone === 'string' ? map[zone] ?? `a ${zone.toLowerCase()}` : undefined;
export function digPrompt(snapshot: EngineSnapshot | null): DigPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'DigChoice') return null;
  const data = waiting.data ?? {};
  const cards = Array.isArray(data.cards) ? (data.cards as ObjectId[]) : [];
  const rawSelectable = Array.isArray(data.selectable_cards) ? (data.selectable_cards as ObjectId[]) : [];
  // An empty `selectable_cards` means the engine published no filter, not that
  // nothing may be kept: the looked-at cards are the eligible set.
  const selectable = rawSelectable.length ? rawSelectable.filter((id) => cards.includes(id)) : [...cards];
  const keepCount = typeof data.keep_count === 'number' ? data.keep_count : 0;
  const topCount = typeof data.rest_split_top_count === 'number' ? data.rest_split_top_count : undefined;
  // `rest_remainder` is serialized only when it is NOT the routing default, so
  // its presence means the unkept cards were only looked at and never moved.
  const stays = data.rest_remainder === 'StayInLibrary';
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    cards,
    selectable,
    count: Math.min(keepCount, selectable.length),
    partial: data.up_to === true,
    keptLabel: place(KEPT_PLACES, data.kept_destination) ?? 'donde están',
    restLabel: stays
      ? 'se quedan en la biblioteca'
      : topCount !== undefined
        ? 'se reparten entre la parte superior y el fondo de tu biblioteca'
        : `van ${place(REST_PLACES, data.rest_destination) ?? 'al cementerio'}`,
    enterTapped: data.enter_tapped === true,
    entersAttacking: data.enters_attacking === true
  };
}
/** Whether Phase would take this answer as it stands. */
export function digReady(prompt: DigPrompt, selected: ObjectId[]): boolean {
  if (!selected.every((id) => prompt.selectable.includes(id))) return false;
  return prompt.partial ? selected.length <= prompt.count : selected.length === prompt.count;
}

/**
 * CR 701.23: a search looks through a hidden zone and its searcher picks from
 * the cards Phase already deemed legal. CR 701.23b/701.23d matter here: a
 * *stated-quality* search ("a creature card", "with different names") may find
 * fewer cards — even none — while a pure quantity search must find as many as
 * it can. The engine publishes that distinction; Mesa never re-derives it.
 */
export type SearchPrompt = {
  player: PlayerId;
  /** The cards Phase will accept, already filtered from the library. */
  cards: ObjectId[];
  /** How many cards the effect asks for. */
  count: number;
  /** CR 107.1c: `0..=count` is legal, so "find nothing" is a real answer. */
  partial: boolean;
  /** The found cards are revealed before the continuation resolves. */
  reveal: boolean;
  /** CR 701.23a: whose library was searched, when the engine says. */
  owner?: PlayerId;
};
/**
 * `SearchSelectionConstraint::permits_partial_find`: any constrained (stated
 * quality) search allows a partial find, whatever `up_to` says.
 */
function constraintIsStated(constraint: unknown): boolean {
  if (!constraint || typeof constraint !== 'object') return false;
  const type = (constraint as { type?: unknown }).type;
  return typeof type === 'string' && type !== 'None';
}
export function searchPrompt(snapshot: EngineSnapshot | null): SearchPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'SearchChoice') return null;
  const data = waiting.data ?? {};
  const cards = Array.isArray(data.cards) ? (data.cards as ObjectId[]) : [];
  const count = typeof data.count === 'number' ? data.count : 1;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    cards,
    count,
    partial: data.up_to === true || data.allows_partial_find === true || constraintIsStated(data.constraint),
    reveal: data.reveal === true,
    owner: typeof data.library_owner === 'number' ? data.library_owner : undefined
  };
}
/** Whether Phase would take this answer as it stands. */
export function searchReady(prompt: SearchPrompt, selected: ObjectId[]): boolean {
  if (!selected.every((id) => prompt.cards.includes(id))) return false;
  return prompt.partial ? selected.length <= prompt.count : selected.length === prompt.count;
}
/**
 * Toggles one card of a published set, never exceeding `limit`. Returns the SAME
 * array when the click cannot change anything, so the caller can skip a render.
 */
export function togglePick(allowed: ObjectId[], selected: ObjectId[], id: ObjectId, limit: number): ObjectId[] {
  if (!allowed.includes(id)) return selected;
  if (selected.includes(id)) return selected.filter((value) => value !== id);
  if (selected.length >= limit) return selected;
  return [...selected, id];
}

/** "Pick these cards" is one action for every prompt of this family. */
export function selectCardsAction(cards: ObjectId[]): GameAction {
  return { type: 'SelectCards', data: { cards: [...cards] } };
}

/**
 * CR 700.2: a modal spell or ability asks its controller to choose modes before
 * targets and costs. Phase publishes the window (`min_choices..max_choices`),
 * the mode texts, which modes are unavailable and — for the "up to N {P} worth
 * of modes" cards (CR 700.2i) — the pawprint weight of each mode, where
 * `max_choices` is a point BUDGET rather than a mode count.
 *
 * The answer is `SelectModes { indices }`, and every rule below is arithmetic
 * over engine data: Mesa never decides which modes a card offers.
 */
export type ModeChoicePrompt = {
  player: PlayerId;
  /** A modal spell (`ModeChoice`) or a modal ability (`AbilityModeChoice`). */
  kind: 'spell' | 'ability';
  /** The object asking: the spell being cast, or the permanent's ability. */
  objectId?: ObjectId;
  min: number;
  max: number;
  descriptions: string[];
  /** Modes Phase already rules out (CR 700.2a NoRepeat, unmet targets). */
  unavailable: number[];
  allowRepeat: boolean;
  /** CR 700.2i: pawprint weight per mode; empty for ordinary modals. */
  pawprints: number[];
  /** CR 602.2b: an activated ability can be cancelled here; a trigger cannot. */
  activated: boolean;
};
export function modeChoicePrompt(snapshot: EngineSnapshot | null): ModeChoicePrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting) return null;
  const isSpell = waiting.type === 'ModeChoice';
  const isAbility = waiting.type === 'AbilityModeChoice';
  if (!isSpell && !isAbility) return null;
  const data = waiting.data ?? {};
  const modal = (data.modal ?? {}) as Record<string, unknown>;
  const number = (value: unknown, fallback = 0) => (typeof value === 'number' ? value : fallback);
  const list = (value: unknown, fallback: number[]) => (Array.isArray(value) ? (value as number[]) : fallback);
  const descriptions = Array.isArray(modal.mode_descriptions) ? (modal.mode_descriptions as string[]) : [];
  const cast = data.pending_cast as { object_id?: ObjectId } | undefined;
  const objectId = isAbility
    ? typeof data.source_id === 'number' ? (data.source_id as ObjectId) : undefined
    : typeof cast?.object_id === 'number' ? cast.object_id : undefined;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    kind: isAbility ? 'ability' : 'spell',
    objectId,
    min: number(modal.min_choices),
    max: number(modal.max_choices),
    descriptions,
    unavailable: list(data.unavailable_modes, []),
    allowRepeat: modal.allow_repeat_modes === true,
    pawprints: list(modal.mode_pawprints, []),
    activated: data.is_activated === true
  };
}
/** CR 700.2i: with pawprints the cap is a point budget, not a mode count. */
export function modeIsBudget(prompt: ModeChoicePrompt): boolean {
  return prompt.pawprints.length > 0;
}
export function modeWeight(prompt: ModeChoicePrompt, index: number): number {
  return prompt.pawprints[index] ?? 0;
}
export function modeSpent(prompt: ModeChoicePrompt, selected: number[]): number {
  return modeIsBudget(prompt) ? selected.reduce((sum, index) => sum + modeWeight(prompt, index), 0) : 0;
}
/** A one-of-one modal answers with a single click; anything else builds a selection. */
export function modeSingleChoice(prompt: ModeChoicePrompt): boolean {
  return !modeIsBudget(prompt) && prompt.min === 1 && prompt.max === 1;
}
/** CR 602.2b / CR 603.3c: only an activated ability is still cancellable. */
export function modeCanCancel(prompt: ModeChoicePrompt): boolean {
  return prompt.kind === 'spell' || prompt.activated;
}
/**
 * The mode row a click lands on: toggling, or adding while repeats are allowed.
 * Refused choices return the SAME array, so an impossible click changes nothing.
 */
export function modeToggle(prompt: ModeChoicePrompt, selected: number[], index: number): number[] {
  if (prompt.unavailable.includes(index)) return selected;
  const budget = modeIsBudget(prompt);
  const fits = (list: number[]) => !budget || modeSpent(prompt, list) + modeWeight(prompt, index) <= prompt.max;
  if (prompt.allowRepeat) {
    if (!fits(selected)) return selected;
    if (!budget && selected.length >= prompt.max) return selected;
    return [...selected, index].sort((a, b) => a - b);
  }
  if (selected.includes(index)) return selected.filter((value) => value !== index);
  if (!fits(selected)) return selected;
  if (!budget && selected.length >= prompt.max) return selected;
  return [...selected, index].sort((a, b) => a - b);
}
/** Whether Phase would accept the selection as it stands. */
export function modeConfirmable(prompt: ModeChoicePrompt, selected: number[]): boolean {
  if (selected.length < prompt.min) return false;
  return modeIsBudget(prompt) ? modeSpent(prompt, selected) <= prompt.max : selected.length <= prompt.max;
}
/** CR 700.2: the chosen modes, in the order the engine indexes them. */
export function modeSelectAction(indices: number[]): GameAction {
  return { type: 'SelectModes', data: { indices: [...indices].sort((a, b) => a - b) } };
}

/**
 * CR 603.3b: when several abilities a player controls trigger at once, that
 * player chooses the order in which they go on the stack — and the stack
 * resolves last-in, first-out (CR 405.3). Phase publishes the summaries and
 * accepts a permutation of their indices; this module permutes the list and
 * never re-derives a trigger from `state.objects`.
 */
export type TriggerEntry = { sourceId: ObjectId; name: string; description: string };
export type TriggerOrderPrompt = { player: PlayerId; triggers: TriggerEntry[] };
export function triggerOrderPrompt(snapshot: EngineSnapshot | null): TriggerOrderPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'OrderTriggers') return null;
  const data = waiting.data ?? {};
  const raw = Array.isArray(data.triggers) ? (data.triggers as Record<string, unknown>[]) : [];
  const triggers = raw.map((entry) => ({
    sourceId: typeof entry.source_id === 'number' ? (entry.source_id as ObjectId) : 0,
    name: typeof entry.source_name === 'string' ? entry.source_name : '',
    description: typeof entry.description === 'string' ? entry.description : ''
  }));
  if (!triggers.length) return null;
  return { player: typeof data.player === 'number' ? data.player : snapshot!.viewer, triggers };
}
/** The order the prompt opens with: the one the engine published. */
export function defaultOrder(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}
/** Moves one trigger, refusing targets outside the list instead of clamping. */
export function moveInOrder(order: number[], from: number, to: number): number[] {
  if (from === to || from < 0 || from >= order.length || to < 0 || to >= order.length) return order;
  const next = [...order];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
/** CR 603.3b: the permutation, top of the list resolving last. */
export function orderTriggersAction(order: number[]): GameAction {
  return { type: 'OrderTriggers', data: { order: [...order] } };
}

/**
 * CR 107.3a: X is announced by the spell's controller while casting it, and
 * CR 601.2f locks the total cost that X feeds. Phase publishes the window
 * (`min..max`, with `max` derived from what the player can actually pay), the
 * spell being cast and the cost preview for each value, so this module only
 * validates and formats what the engine sent.
 */
export type XPrompt = {
  player: PlayerId;
  min: number;
  max: number;
  /** The spell waiting for its X, so the panel can name it. */
  objectId?: ObjectId;
  /** The cast's cost before the chosen X. */
  cost?: unknown;
  /** Total cost per value, as the engine computed it. */
  previews: [number, unknown][];
};
export function xPrompt(snapshot: EngineSnapshot | null): XPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'ChooseXValue') return null;
  const data = waiting.data ?? {};
  const cast = data.pending_cast as { object_id?: ObjectId; cost?: unknown } | undefined;
  const previews = Array.isArray(data.x_cost_previews)
    ? (data.x_cost_previews as [number, unknown][]).filter(
        (entry) => Array.isArray(entry) && typeof entry[0] === 'number'
      )
    : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    min: typeof data.min === 'number' ? data.min : 0,
    max: typeof data.max === 'number' ? data.max : 0,
    objectId: typeof cast?.object_id === 'number' ? cast.object_id : undefined,
    cost: cast?.cost,
    previews
  };
}
/** The value the box opens with: the engine's own minimum, never a guess above it. */
export function defaultX(prompt: Pick<XPrompt, 'min' | 'max'>): number {
  return prompt.min <= prompt.max ? Math.max(prompt.min, 0) : 0;
}
/**
 * Reads an entry the way the engine will: digits only, inside the window.
 * Out-of-range or malformed entries return `null` instead of being clamped —
 * a value the player never typed must never be submitted (CR 107.3a for X,
 * CR 118.1 for an amount). The window is the engine's in both cases, so the
 * sanitiser is shared: `Number('')`, `Number(' 7 ')`, `'1.5'`, `'1e3'`, `'+2'`
 * and `'0x10'` all land inside a typical window and none of them is digits.
 */
export function parseAmount(raw: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const value = Number(raw);
  return value >= min && value <= max ? value : null;
}
/** The X prompt reads the same sanitiser under the name it has always had. */
export const parseX = parseAmount;

/**
 * CR 107.1c + CR 118.1: "pay any amount" / "choose a number" asks for an amount
 * inside a window the engine owns. `resource` is what gets spent —and it is not
 * always a cost: CR 732.2a's loop collapse names how many cycles to materialise,
 * which is a count, not a payment.
 */
export type PayableResourceKind =
  | { kind: 'energy' }
  | { kind: 'mana'; composition: 'concretizeX' | 'perUnit' }
  | { kind: 'counters' }
  | { kind: 'life' }
  | { kind: 'speed' }
  | { kind: 'loop'; axis: 'tokens' | 'counters' | 'life' | 'mixed' };
export type PayAmountPrompt = {
  player: PlayerId;
  sourceId: ObjectId;
  min: number;
  max: number;
  /** CR 107.1c: the engine's running total when the prompt collects in steps. */
  accumulated: number;
  resource: PayableResourceKind;
  /** CR 107.3a + CR 601.2b: a mana ability announcing X, not a standalone amount. */
  pendingManaAbility: boolean;
};
const LOOP_AXES: Record<string, 'tokens' | 'counters' | 'life' | 'mixed'> = {
  Tokens: 'tokens',
  Counters: 'counters',
  Life: 'life',
  Mixed: 'mixed'
};
function payableResource(raw: unknown): PayableResourceKind {
  const type = (raw as { type?: string } | undefined)?.type;
  switch (type) {
    case 'Energy':
      return { kind: 'energy' };
    case 'ManaGeneric':
      return {
        kind: 'mana',
        // CR 107.3f vs CR 107.1c: `{X}{W}` and "pay any amount of {R}" both arrive
        // under the legacy `ManaGeneric` tag; only `composition` tells them apart.
        composition:
          (raw as { composition?: string }).composition === 'PerUnit' ? 'perUnit' : 'concretizeX'
      };
    case 'Counters':
      return { kind: 'counters' };
    case 'Life':
      return { kind: 'life' };
    case 'Speed':
      return { kind: 'speed' };
    case 'LoopCollapse': {
      const axis = (raw as { axis?: string }).axis;
      return { kind: 'loop', axis: LOOP_AXES[axis ?? ''] ?? 'mixed' };
    }
    default:
      return { kind: 'energy' };
  }
}
export function payAmountPrompt(snapshot: EngineSnapshot | null): PayAmountPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'PayAmountChoice') return null;
  const data = waiting.data ?? {};
  const min = typeof data.min === 'number' ? Math.max(0, data.min) : 0;
  const max = typeof data.max === 'number' ? data.max : 0;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : 0,
    min,
    max: Math.max(min, max),
    accumulated: typeof data.accumulated === 'number' ? data.accumulated : 0,
    resource: payableResource(data.resource),
    pendingManaAbility: data.pending_mana_ability != null
  };
}
/**
 * Identity of the prompt, for resetting the box. Not just the window: the engine
 * mints consecutive prompts with the same `source_id` that differ only in
 * `player` (CR 732.2a collapses one loop per controller, in APNAP order), and
 * carrying one controller's amount into the other's prompt would submit a number
 * nobody typed. The engine's running `accumulated` moves the window too.
 */
export function payAmountKey(prompt: PayAmountPrompt): string {
  return [prompt.player, prompt.sourceId, prompt.min, prompt.max, prompt.accumulated, prompt.resource.kind].join(':');
}
/** What the amount is spent on, in the prompt's own terms. */
export function payAmountResource(prompt: PayAmountPrompt): string {
  switch (prompt.resource.kind) {
    case 'energy':
      return 'energía';
    case 'mana':
      return prompt.resource.composition === 'perUnit' ? 'maná por unidad' : 'maná';
    case 'counters':
      return 'contadores';
    case 'life':
      return 'vida';
    case 'speed':
      return 'velocidad';
    case 'loop':
      return prompt.resource.axis === 'tokens'
        ? 'fichas'
        : prompt.resource.axis === 'counters'
          ? 'contadores'
          : prompt.resource.axis === 'life'
            ? 'vida'
            : 'ciclos';
  }
}
/**
 * The button's own words. A loop collapse is not a payment (nothing is spent):
 * CR 732.2a collapses N cycles into N materialisations, so the label counts what
 * will exist. Everything else says what it costs, with the amount and resource.
 */
export function payAmountLabel(prompt: PayAmountPrompt, amount: number | null): string {
  const value = amount === null ? '?' : String(amount);
  if (prompt.resource.kind === 'loop') {
    const axis = prompt.resource.axis;
    const one = axis === 'tokens' ? 'ficha' : axis === 'counters' ? 'contador' : axis === 'life' ? 'punto de vida' : 'ciclo';
    const many = axis === 'tokens' ? 'fichas' : axis === 'counters' ? 'contadores' : axis === 'life' ? 'puntos de vida' : 'ciclos';
    return amount === 1 ? `Aplicar 1 ciclo · 1 ${one}` : `Aplicar ${value} · ${value} ${many}`;
  }
  return `Pagar ${value} ${payAmountResource(prompt)}`;
}
export function submitPayAmount(amount: number): GameAction {
  return { type: 'SubmitPayAmount', data: { amount } };
}
/**
 * The cost of the announced value, or the cast's own cost when the engine
 * published no preview for it. `null` while there is no valid value: showing
 * the cost of an X the caster has not chosen would be inventing a number.
 */
export function xCost(prompt: XPrompt, value: number | null): unknown {
  if (value === null) return null;
  return prompt.previews.find(([x]) => x === value)?.[1] ?? prompt.cost;
}
/** CR 107.3a: the announced value, and nothing else. */
export function chooseXAction(value: number): GameAction {
  return { type: 'ChooseX', data: { value } };
}
export function cancelCastAction(): GameAction {
  return { type: 'CancelCast' };
}

/** The answer to a discard prompt: exactly the cards the interface collected. */
export function discardSelection(cards: ObjectId[]): GameAction {
  return selectCardsAction(cards);
}

export function targetLabel(target: unknown, objects: Record<string, GameObject>): string {
  const t = parseTarget(target);
  if (!t) return 'Sin objetivo';
  return t.kind === 'player' ? `Jugador ${t.id + 1}` : objects[String(t.id)]?.name ?? 'permanente';
}
/**
 * Names for a list of recipients, disambiguated by controller only where the name
 * repeats. Two permanents can share a name and both be legal recipients (one per
 * side); a bare name would make two rows the player cannot tell apart, and the
 * controller is published, so it is what separates them.
 */
export function distinctTargetLabels(targets: TargetRef[], objects: Record<string, GameObject>): string[] {
  const base = targets.map((target) => targetLabel(target, objects));
  const withController = base.map((name, index) => {
    if (base.filter((other) => other === name).length < 2) return name;
    const parsed = parseTarget(targets[index]);
    const controller = parsed?.kind === 'object' ? objects[String(parsed.id)]?.controller : undefined;
    return typeof controller === 'number' ? `${name} (Jugador ${controller + 1})` : name;
  });
  // The controller separates the two sides, but not two copies on the SAME side:
  // a retarget can name both. Phase publishes the id, and it is what is left, so
  // that is what tells them apart — a label that repeats is not a label.
  return withController.map((name, index) => {
    if (withController.filter((other) => other === name).length < 2) return name;
    const parsed = parseTarget(targets[index]);
    return parsed ? `${name} · #${parsed.id}` : name;
  });
}
export function attackLabel(target: AttackTarget, objects: Record<string, GameObject>): string {
  if (target.type === 'Player') return `Jugador ${target.data + 1}`;
  return objects[String(target.data)]?.name ?? (target.type === 'Battle' ? 'Batalla' : 'Planeswalker');
}
export function manualCast(action: GameAction): GameAction {
  return { ...action, data: { ...action.data, payment_mode: { type: 'Manual' } } };
}
/**
 * Combat role of one permanent, read from Phase's own combat state.
 *
 * `attackers` is a list; blocking is a **map keyed by blocker**
 * (`blocker_to_attacker`, CR 509.1g) whose presence marks the creature as a
 * blocking creature even if every attacker it blocked has left combat. The old
 * reader looked for a `blockers` field that Phase never sends, so a blocker was
 * never labelled and the player could not see the block they had just made.
 */
export function combatRole(s: EngineSnapshot | null, id: ObjectId): string | undefined {
  const c = s?.state.combat;
  if (c?.attackers?.some((a) => a.object_id === id)) return 'Atacando';
  if (c?.blocker_to_attacker && Object.prototype.hasOwnProperty.call(c.blocker_to_attacker, String(id))) return 'Bloqueando';
  return undefined;
}

/** Attackers Phase marked as blocked (CR 509.1h), as a set for the UI. */
export function blockedAttackerIds(s: EngineSnapshot | null): Set<ObjectId> {
  const out = new Set<ObjectId>();
  for (const attacker of s?.state.combat?.attackers ?? []) if (attacker.blocked) out.add(attacker.object_id);
  return out;
}
export function permanentStates(o: GameObject, combat?: string): string[] {
  if (isHiddenObject(o)) return [];
  const states: string[] = [];
  if (combat) states.push(combat);
  if (o.tapped) states.push('Girada');
  if (o.damage_marked) states.push(`${o.damage_marked} daño`);
  if (o.transformed) states.push('Transformada');
  // Singular/plural: "1 adjuntos" is the kind of thing a player notices.
  if (o.attachments?.length) states.push(o.attachments.length === 1 ? '1 adjunto' : `${o.attachments.length} adjuntos`);
  const counters = Array.isArray(o.counters) ? o.counters : Object.entries(o.counters ?? {});
  for (const [kind, count] of counters) if (count) states.push(`${count} ${counterLabel(kind)}`);
  return states;
}
/**
 * Counter names in Spanish. Two spellings reach the table: the PascalCase the
 * older payloads use and the flat strings `CounterType::as_str` writes on the
 * wire (`P1P1`, `loyalty`, `flying`). What is not in the table keeps the engine's
 * own word — it is never renamed into something the rules do not say.
 */
const COUNTERS: Record<string, string> = {
  PlusOnePlusOne: '+1/+1', MinusOneMinusOne: '−1/−1', Loyalty: 'lealtad', Defense: 'defensa', Charge: 'carga', Flying: 'vuelo', Shield: 'escudo', Stun: 'aturdimiento', Finality: 'finalidad',
  P1P1: '+1/+1', M1M1: '−1/−1', loyalty: 'lealtad', defense: 'defensa', stun: 'aturdimiento', lore: 'relato', time: 'tiempo', shield: 'escudo', finality: 'finalidad',
  flying: 'vuelo', trample: 'arrollar', deathtouch: 'toque mortal', lifelink: 'vínculo vital', vigilance: 'vigilancia', haste: 'prisa', reach: 'alcance', menace: 'amenaza', hexproof: 'antimaleficio', indestructible: 'indestructible'
};
export function counterLabel(kind: string) { return COUNTERS[kind] ?? kind; }
const KEYWORDS: Record<string, string> = { Flying: 'Vuelo', Haste: 'Prisa', Vigilance: 'Vigilancia', Trample: 'Arrolla', Lifelink: 'Vínculo vital', Deathtouch: 'Toque mortal', FirstStrike: 'Daña primero', DoubleStrike: 'Daña dos veces', Defender: 'Defensor', Menace: 'Amenaza', Reach: 'Alcance', Hexproof: 'Antimaleficio', Indestructible: 'Indestructible' };
export function keywordLabel(value: unknown): string {
  if (typeof value === 'string') return KEYWORDS[value] ?? value;
  if (value && typeof value === 'object' && 'type' in value) return KEYWORDS[String(value.type)] ?? String(value.type);
  return 'Habilidad';
}
/**
 * The exact payload Phase receives for a combat declaration.
 *
 * These live here — not inline in the session — so a test can assert the pairs
 * the UI sends: `[blocker, attacker]` in that order, matching `BlockersDeclared`.
 */
export function attackDeclaration(attacks: Record<string, AttackTarget>): GameAction {
  return {
    type: 'DeclareAttackers',
    data: { attacks: Object.entries(attacks).map(([id, target]) => [Number(id), target]), bands: [] }
  };
}

export function blockDeclaration(blocks: Record<string, ObjectId>): GameAction {
  return {
    type: 'DeclareBlockers',
    data: { assignments: Object.entries(blocks).map(([blocker, attacker]) => [Number(blocker), attacker]) }
  };
}

/** Pairs as the log and the tests read them: `[[blocker, attacker], …]`. */
export function blockPairs(blocks: Record<string, ObjectId>): [ObjectId, ObjectId][] {
  return Object.entries(blocks).map(([blocker, attacker]) => [Number(blocker), attacker]);
}

/**
 * What a **second** activation of an already-selected hand card commits.
 *
 * One click selects (the panel then shows every option with its cost); a second
 * one plays the single obvious action, so the common case is two clicks on the
 * card instead of click-then-aim-at-a-button-across-the-screen. It only commits
 * when the engine offers **exactly one** such action: with two ways to cast the
 * same card the second activation stays a selection — the choice belongs to the
 * player, not to a guess.
 */
export function secondActivation(
  s: EngineSnapshot | null,
  id: ObjectId
): { action: GameAction; kind: 'play-land' | 'cast' } | { action: null; reason: 'no-action' | 'ambiguous' | 'not-a-priority' } {
  if (!s) return { action: null, reason: 'no-action' };
  if (s.state.waiting_for.type !== 'Priority') return { action: null, reason: 'not-a-priority' };
  const committing = (s.legal.by_object[String(id)] ?? []).filter((a) => a.type === 'PlayLand' || a.type === 'CastSpell');
  if (!committing.length) return { action: null, reason: 'no-action' };
  if (committing.length > 1) return { action: null, reason: 'ambiguous' };
  const action = committing[0]!;
  return { action, kind: action.type === 'PlayLand' ? 'play-land' : 'cast' };
}

export function objectSelectLabel(s: EngineSnapshot | null, id: ObjectId): string | undefined {
  if (!s) return undefined;
  if (targetAction(s, objectTarget(id))) return 'Elegir como objetivo';
  if (manaActions(s, id).length) return 'Producir maná';
  if (attackTargets(s, id).length) return 'Seleccionar atacante';
  if (blockTargets(s, id).length) return 'Seleccionar bloqueadora';
  if (s.state.waiting_for.type === 'DeclareBlockers' && s.state.combat?.attackers.some((a) => a.object_id === id)) return 'Elegir atacante para bloquear';
  return undefined;
}

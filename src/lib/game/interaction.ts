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
  /**
   * CR 702.24a: a compact cumulative-upkeep draw pays one printed instruction
   * `repeat` times — the age-counter count. Absent means "pay it once".
   */
  repeat: number | null;
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
    remaining,
    // A zero or a missing count both mean the printed instruction is paid once.
    repeat: typeof data.repeat === 'number' && data.repeat > 1 ? data.repeat : null
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
export type RevealCardinality = { kind: 'exactly'; count: number } | { kind: 'any' };
export type RevealPrompt = {
  player: PlayerId;
  cards: ObjectId[];
  /** CR 701.20a: the player may decline by revealing nothing. */
  optional: boolean;
  /** Declining runs the effect's other branch instead of skipping the follow-up. */
  declineRunsContinuation: boolean;
  /**
   * CR 608.2d + CR 107.1c: how many of `cards` the answer must hold. The historical
   * shape is exactly one (and it is the serde default); "reveal any number of
   * artifact cards" admits any subset, including none.
   */
  cardinality: RevealCardinality;
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
    declineRunsContinuation: data.decline_runs_continuation === true,
    cardinality: revealCardinality(data.cardinality)
  };
}
/**
 * CR 608.2d: `cardinality` is an `Exactly { count }` or `AnyNumber`; the first is
 * omitted on the wire when it is the historical single pick, so an absent field is
 * one card, not "unknown".
 */
function revealCardinality(raw: unknown): RevealCardinality {
  if (raw === 'AnyNumber') return { kind: 'any' };
  if (raw && typeof raw === 'object') {
    const value = raw as Record<string, unknown>;
    if (value.type === 'AnyNumber') return { kind: 'any' };
    if (value.type === 'Exactly') {
      const data = value.data as Record<string, unknown> | undefined;
      const count = typeof data?.count === 'number' ? data.count : 1;
      return count === 1 ? { kind: 'exactly', count: 1 } : { kind: 'exactly', count };
    }
  }
  return { kind: 'exactly', count: 1 };
}
/** The chosen cards; an empty list reveals nothing and is only legal when offered. */
export function revealCardsAction(cards: ObjectId[]): GameAction {
  return selectCardsAction([...cards]);
}
/** One card, or none when the reveal is optional. */
export function revealAction(card: ObjectId | null): GameAction {
  return revealCardsAction(card === null ? [] : [card]);
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
 * CR 101.4 + CR 701.21a: the **exact** keeper — "each player chooses three
 * permanents they control, then sacrifices the rest" (Razia's Purification), and
 * the one-creature vow-counter form (Promise of Loyalty, CR 122.1).
 *
 * `required_count` is the number the engine already resolved **and capped to this
 * prompt's eligible pool** under CR 609.3 ("do as much as possible"); the prompt's
 * own contract says display clients must render it and not derive a second legality
 * rule from `eligible.len()`. So the screen shows that number, asks for exactly
 * that many distinct permanents, and never silently lowers it.
 *
 * `keeper_counter` is the mark the instruction owes its keepers (CR 122.1), placed
 * before the sacrifice; it rides here because the resolved ability is gone by the
 * time the answer arrives.
 */
export type KeepExactPrompt = {
  player: PlayerId;
  targetPlayer: PlayerId;
  eligible: ObjectId[];
  /** CR 609.3: already capped by the engine — rendered, never recomputed. */
  requiredCount: number;
  /** CR 122.1: the keeper mark, with its own count already resolved (CR 608.2h). */
  keeperCounter: { type: string; count: number } | null;
  chooserScope: 'self' | 'forAll';
  sourceId: ObjectId | null;
  remainingPlayers: PlayerId[];
  keptBefore: ObjectId[];
};
/** `CounterType::Generic("vow")` arrives as an object; a flat string also happens. */
function counterTypeName(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const generic = (value as { Generic?: unknown }).Generic;
    if (typeof generic === 'string') return generic;
  }
  return null;
}
export function keepExactPrompt(snapshot: EngineSnapshot | null): KeepExactPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'KeepExactPermanentsChoice') return null;
  const data = waiting.data ?? {};
  const ids = (value: unknown): ObjectId[] =>
    Array.isArray(value) ? (value as unknown[]).filter((id): id is ObjectId => typeof id === 'number') : [];
  const rawCounter = Array.isArray(data.keeper_counter) ? (data.keeper_counter as unknown[]) : null;
  const counterType = rawCounter ? counterTypeName(rawCounter[0]) : null;
  const counterCount = rawCounter && typeof rawCounter[1] === 'number' ? (rawCounter[1] as number) : 1;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    targetPlayer: typeof data.target_player === 'number' ? data.target_player : snapshot!.viewer,
    eligible: ids(data.eligible),
    // `count` is the older alias the payload may still use.
    requiredCount:
      typeof data.required_count === 'number'
        ? Math.max(0, data.required_count)
        : typeof data.count === 'number'
          ? Math.max(0, data.count)
          : 0,
    keeperCounter: counterType ? { type: counterType, count: counterCount } : null,
    chooserScope: data.chooser_scope === 'ControllerForAll' ? 'forAll' : 'self',
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : null,
    remainingPlayers: ids(data.remaining_players),
    keptBefore: ids(data.all_kept)
  };
}
/** CR 101.4: exactly `required_count` permanents to keep; the rest are sacrificed. */
export function keepExactAction(ids: ObjectId[]): GameAction {
  return { type: 'ChooseKeptPermanents', data: { kept: [...ids] } };
}

/**
 * CR 107.1c + CR 701.21a: "each player chooses any number of creatures they
 * control with total power 4 or less, then sacrifices all other creatures they
 * control" (Slaughter the Strong).
 *
 * The window is not a count but a **sum**: any number of eligible creatures whose
 * combined power stays within `cap`, and the rest are sacrificed. Zero is legal
 * ("any number" may be fewer — and zero — which the engine test states outright),
 * and choosing nothing sacrifices everything, so the button says so.
 *
 * `cap` is the engine's resolved number (CR 608.2h), so the screen never recomputes
 * it; the powers are the ones published on the objects, and when one is missing the
 * sum is reported as incomplete instead of guessed.
 */
export type KeepPowerPrompt = {
  player: PlayerId;
  targetPlayer: PlayerId;
  eligible: ObjectId[];
  /** CR 208.3: maximum combined power of the kept subset. */
  cap: number;
  chooserScope: 'self' | 'forAll';
  sourceId: ObjectId | null;
  remainingPlayers: PlayerId[];
  keptBefore: ObjectId[];
};
export function keepPowerPrompt(snapshot: EngineSnapshot | null): KeepPowerPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'KeepWithinTotalPowerChoice') return null;
  const data = waiting.data ?? {};
  const ids = (value: unknown): ObjectId[] =>
    Array.isArray(value) ? (value as unknown[]).filter((id): id is ObjectId => typeof id === 'number') : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    targetPlayer: typeof data.target_player === 'number' ? data.target_player : snapshot!.viewer,
    eligible: ids(data.eligible),
    cap: typeof data.cap === 'number' ? data.cap : 0,
    chooserScope: data.chooser_scope === 'ControllerForAll' ? 'forAll' : 'self',
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : null,
    remainingPlayers: ids(data.remaining_players),
    keptBefore: ids(data.all_kept)
  };
}
/** CR 107.1c: the subset to keep; the engine sums its power against the cap. */
export function keepPowerAction(ids: ObjectId[]): GameAction {
  return { type: 'ChooseKeptCreatures', data: { kept: [...ids] } };
}

/**
 * CR 707.2 + CR 101.4: `EachPlayerCopyChosen` — "each player chooses one or two
 * creatures they control; each player creates a token that's a copy of the **first**
 * creature they chose … then each player who chose a second creature puts counters
 * on the token equal to the power of the second" (Human—Time Lord Meta-Crisis).
 *
 * **The order is the rule.** The answer is an ordered `SelectTargets`: index 0 is
 * what gets copied, index 1 (when `max` allows a second pick) is only read for the
 * scaling clause. Picks must be distinct, objects only, `min..=max` of them, and
 * still live-eligible when submitted.
 *
 * `choose_scope` says whose battlefield the pool came from — the chooser's own, or
 * their seat-neighbour's (CR 102.1 + CR 103.1) — and `all_choices` carries what the
 * earlier players in APNAP order already chose, because nothing happens until the
 * whole set is collected.
 */
export type CopyChosenScale = { counterType: string; property: string };
export type CopyChosenPrompt = {
  player: PlayerId;
  eligible: ObjectId[];
  min: number;
  max: number;
  /** Whose permanents this chooser draws from. */
  scope: 'own' | 'left' | 'right';
  scale: CopyChosenScale | null;
  sourceId: ObjectId | null;
  remainingPlayers: PlayerId[];
  /** Choices already made, in APNAP order; the effect waits for the complete set. */
  earlier: { player: PlayerId; chosen: ObjectId[] }[];
};
/** CR 208.1: the property the scaling clause reads off the second pick. */
export function objectPropertyLabel(property: string): string {
  const known: Record<string, string> = {
    Power: 'fuerza',
    Toughness: 'resistencia',
    ManaValue: 'valor de maná'
  };
  return known[property] ?? property;
}
export function copyChosenPrompt(snapshot: EngineSnapshot | null): CopyChosenPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'EachPlayerCopyChosenSelection') return null;
  const data = waiting.data ?? {};
  const ids = (value: unknown): ObjectId[] =>
    Array.isArray(value) ? (value as unknown[]).filter((id): id is ObjectId => typeof id === 'number') : [];
  const scope = data.choose_scope as { type?: string; direction?: string } | undefined;
  const rawScale = data.scale as { counter_type?: unknown; scale_property?: unknown } | undefined;
  const rawChoices = Array.isArray(data.all_choices) ? (data.all_choices as unknown[]) : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    // The engine rejects a non-object pick outright, so the list is objects only.
    eligible: Array.isArray(data.eligible)
      ? (data.eligible as unknown[])
          .map((entry) => parseTarget(entry))
          .filter((entry): entry is NormalizedTarget => !!entry && entry.kind === 'object')
          .map((entry) => entry.id)
      : [],
    min: typeof data.min === 'number' ? Math.max(0, data.min) : 1,
    max: typeof data.max === 'number' ? Math.max(1, data.max) : 1,
    scope: scope?.type === 'Neighbor' ? (scope.direction === 'Right' ? 'right' : 'left') : 'own',
    scale:
      rawScale && typeof rawScale.counter_type === 'string' && typeof rawScale.scale_property === 'string'
        ? { counterType: rawScale.counter_type as string, property: rawScale.scale_property as string }
        : null,
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : null,
    remainingPlayers: ids(data.remaining_players),
    earlier: rawChoices
      .map((entry) => {
        const record = entry as { player?: unknown; chosen?: unknown };
        return { player: typeof record.player === 'number' ? record.player : 0, chosen: ids(record.chosen) };
      })
      .filter((entry) => entry.chosen.length > 0)
  };
}
/** CR 707.2: the picks go in the order they were made — that order is the rule. */
export function copyChosenAction(ids: ObjectId[]): GameAction {
  return selectTargetsAction(ids.map((id) => objectTarget(id)));
}

/**
 * CR 101.4 + CR 701.21a: "each player chooses one permanent of each of those types
 * from among the permanents they control, then sacrifices the rest" — Cataclysm,
 * Cataclysmic Gearhulk (each player for their own) and Tragic Arrogance (the
 * controller for everyone).
 *
 * The payload is one list of candidates **per category**, aligned with
 * `categories`, and the answer is one slot per category: exactly one pick when the
 * category has candidates, `null` when it has none — the engine rejects a choice
 * for an empty category and a missing one for a full category. The same permanent
 * may fill two categories (an artifact creature legally satisfies both); the
 * protected set is deduped by the engine, not by the screen.
 *
 * `remaining_players` is APNAP order: the prompt can come back once per player.
 */
export type CategoryPrompt = {
  player: PlayerId;
  /** Whose permanents this round draws from — differs from `player` when the
   *  controller chooses for everyone (CR 101.4). */
  targetPlayer: PlayerId;
  sourceId: ObjectId | null;
  /** `forAll`: the spell's controller picks for every player. */
  chooserScope: 'self' | 'forAll';
  categories: { category: string; eligible: ObjectId[] }[];
  /** Still to choose after this one, in APNM order. */
  remainingPlayers: PlayerId[];
  /** Permanents already protected by earlier players in the same resolution. */
  keptBefore: ObjectId[];
};
export function categoryPrompt(snapshot: EngineSnapshot | null): CategoryPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'CategoryChoice') return null;
  const data = waiting.data ?? {};
  const categories = Array.isArray(data.categories)
    ? (data.categories as unknown[]).filter((entry): entry is string => typeof entry === 'string')
    : [];
  const rawEligible = Array.isArray(data.eligible_per_category)
    ? (data.eligible_per_category as unknown[])
    : [];
  const ids = (value: unknown): ObjectId[] =>
    Array.isArray(value) ? (value as unknown[]).filter((id): id is ObjectId => typeof id === 'number') : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    targetPlayer: typeof data.target_player === 'number' ? data.target_player : snapshot!.viewer,
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : null,
    chooserScope: data.chooser_scope === 'ControllerForAll' ? 'forAll' : 'self',
    // A category the payload forgot keeps its slot with no candidates rather than
    // shifting every later category onto the wrong list.
    categories: categories.map((category, index) => ({ category, eligible: ids(rawEligible[index]) })),
    remainingPlayers: ids(data.remaining_players),
    keptBefore: ids(data.all_kept)
  };
}
/** CR 101.4: exactly one slot per category, `null` where the engine offered none. */
export function categoryAction(choices: (ObjectId | null)[]): GameAction {
  return { type: 'SelectCategoryPermanents', data: { choices: choices.map((choice) => choice ?? null) } };
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
/**
 * The answer every "choose any number of these" prompt shares: one `SelectTargets`
 * carrying the picks, in the order they were made. Distinctness and the window are
 * the engine's to enforce; the UI only ever sends what it offered.
 */
export function selectTargetsAction(targets: TargetRef[]): GameAction {
  return { type: 'SelectTargets', data: { targets: targets.map((target) => ({ ...target })) } };
}
/** CR 608.2c: the same answer, named for the prompt that introduced it. */
export const chooseObjectsAction = selectTargetsAction;

/** `{Player: n}` / `{Object: n}` entries, junk dropped rather than guessed at. */
function parseTargetList(value: unknown): TargetRef[] {
  return Array.isArray(value)
    ? (value as unknown[])
        .map((entry) => parseTarget(entry))
        .filter((entry): entry is NormalizedTarget => !!entry)
        .map((entry) => (entry.kind === 'player' ? playerTarget(entry.id) : objectTarget(entry.id)))
    : [];
}

/**
 * CR 701.34a: proliferate — "choose any number of permanents and/or players, then
 * give each another counter of each kind already there". The prompt is that
 * choice and nothing else: the engine publishes exactly what has a counter
 * (permanents, plus players with poison or energy), so there is no window — any
 * number, including none, and no duplicates.
 */
export type ProliferatePrompt = { player: PlayerId; eligible: TargetRef[] };
export function proliferatePrompt(snapshot: EngineSnapshot | null): ProliferatePrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'ProliferateChoice') return null;
  const data = waiting.data ?? {};
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    eligible: parseTargetList(data.eligible)
  };
}

/**
 * CR 701.56a: time travel — for each chosen object, put **or** remove a time
 * counter. The engine models the "or" as two phases over the same answer: it
 * offers the remove phase first (advancing suspended cards toward casting) and
 * then the add phase over the objects still eligible, **excluding** the ones just
 * chosen to remove — so each object gets at most one of the two.
 *
 * The phase is the whole screen: the same list, opposite verb. The block names it
 * instead of asking the player to remember which half they are in.
 */
export type TimeTravelPrompt = { player: PlayerId; eligible: TargetRef[]; phase: 'remove' | 'add' };
export function timeTravelPrompt(snapshot: EngineSnapshot | null): TimeTravelPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'TimeTravelChoice') return null;
  const data = waiting.data ?? {};
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    eligible: parseTargetList(data.eligible),
    phase: (data.phase as { type?: string } | undefined)?.type === 'Add' ? 'add' : 'remove'
  };
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
 * CR 700.3: "separate into two piles, then an opponent chooses one" — the two-pile
 * primitive behind Make an Example and Fact or Fiction. The engine runs it as three
 * stages, and the block is the same block in all three because it is one flow:
 *
 *   1. **opponent** (`SeparatePilesChooseOpponent`) — who partitions. Only exists
 *      with three or more players: with a single opponent the engine skips it, so
 *      this stage is never seen in a two-player game.
 *   2. **partition** (`SeparatePilesPartition`) — the subject splits their own
 *      objects. Submitting `pile_a` is enough: pile B is derived by the engine as
 *      `eligible \ pile_a` (CR 700.3a), and an empty pile A is legal (CR 700.3d),
 *      which also makes an empty pile B legal.
 *   3. **choice** (`SeparatePilesChoice`) — the chooser picks A or B, one subject at
 *      a time (CR 101.4c).
 *
 * `pile_source` says where the objects come from — the battlefield (Make an
 * Example), the top of the library (Fact or Fiction) or an earlier exile (Boneyard
 * Parley) — so the block can say "permanentes" or "cartas" without guessing.
 */
export type PileSourceKind = 'battlefield' | 'library' | 'exile';
export type PileStage = 'opponent' | 'partition' | 'choice';
export type PileSide = 'A' | 'B';
export type PileResultView = { subject: PlayerId; pileA: ObjectId[]; pileB: ObjectId[] };
export type SeparatePilesPrompt = {
  stage: PileStage;
  /** The player answering this stage. */
  player: PlayerId;
  sourceId: ObjectId;
  /** CR 700.3: who picks a pile once the partition is in. */
  chooser: PlayerId | null;
  pileSource: PileSourceKind;
  /** `RevealedFromLibraryTop { count }` when the cards come from the library. */
  libraryCount: number | null;
  /** Stage 1: seats that may partition. */
  candidates: PlayerId[];
  /** Stage 2: objects this subject must split. */
  eligible: ObjectId[];
  /** Stage 2: who is still to partition, in APNAP order, with their own pool. */
  remainingSubjects: { player: PlayerId; eligible: ObjectId[] }[];
  /** Stage 3: the piles awaiting a choice, `current` first. */
  current: PileResultView | null;
  pending: PileResultView[];
};
export function separatePilesPrompt(snapshot: EngineSnapshot | null): SeparatePilesPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  const type = waiting?.type;
  if (type !== 'SeparatePilesChooseOpponent' && type !== 'SeparatePilesPartition' && type !== 'SeparatePilesChoice') {
    return null;
  }
  const data = waiting!.data ?? {};
  const ids = (value: unknown): ObjectId[] =>
    Array.isArray(value) ? (value as unknown[]).filter((id): id is ObjectId => typeof id === 'number') : [];
  const pile = (value: unknown): PileResultView | null => {
    if (!value || typeof value !== 'object') return null;
    const entry = value as Record<string, unknown>;
    if (typeof entry.subject !== 'number') return null;
    return { subject: entry.subject, pileA: ids(entry.pile_a), pileB: ids(entry.pile_b) };
  };
  const piles = (value: unknown): PileResultView[] =>
    Array.isArray(value) ? (value as unknown[]).map(pile).filter((entry): entry is PileResultView => entry !== null) : [];
  const rawSource = data.pile_source as Record<string, unknown> | undefined;
  const sourceKind = rawSource?.type;
  const pileSource: PileSourceKind =
    sourceKind === 'RevealedFromLibraryTop' ? 'library' : sourceKind === 'ExiledThisWay' ? 'exile' : 'battlefield';
  const libraryData = rawSource?.data as Record<string, unknown> | undefined;
  return {
    stage:
      type === 'SeparatePilesChooseOpponent' ? 'opponent' : type === 'SeparatePilesPartition' ? 'partition' : 'choice',
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : 0,
    chooser: typeof data.chooser === 'number' ? data.chooser : null,
    pileSource,
    libraryCount: typeof libraryData?.count === 'number' ? (libraryData.count as number) : null,
    candidates: ids(data.candidates),
    eligible: ids(data.eligible),
    remainingSubjects: Array.isArray(data.remaining_subjects)
      ? (data.remaining_subjects as unknown[])
          .map((entry) => {
            if (!Array.isArray(entry) || typeof entry[0] !== 'number') return null;
            return { player: entry[0] as PlayerId, eligible: ids(entry[1]) };
          })
          .filter((entry): entry is { player: PlayerId; eligible: ObjectId[] } => entry !== null)
      : [],
    current: pile(data.current),
    pending: piles(data.pending)
  };
}
/** CR 700.3: which opponent performs the partition (multiplayer only). */
export function choosePileOpponentAction(opponent: PlayerId): GameAction {
  return { type: 'ChoosePileOpponent', data: { opponent } };
}
/** CR 700.3a: pile A; the engine derives pile B as the rest of the pool. */
export function submitPilePartitionAction(pileA: ObjectId[]): GameAction {
  return { type: 'SubmitPilePartition', data: { pile_a: [...pileA] } };
}
/** CR 700.3: the chooser's pick, typed on the wire as `{"type":"A"}`. */
export function choosePileAction(side: PileSide): GameAction {
  return { type: 'ChoosePile', data: { pile: { type: side } } };
}

/**
 * CR 702.94a: miracle — the first card a player draws in a turn can carry a
 * `Miracle` keyword, and the engine then offers them a reveal as a **binary**
 * offer, not a cast: accepting emits the reveal and puts the miracle triggered
 * ability on the stack ("When you reveal this card this way, you may cast it for
 * [miracle cost]"), so opponents still get priority before anything is cast.
 *
 * The cost comes latched in the prompt (`cost`), because the granting source may
 * have left the battlefield by the time the offer resolves (CR 608.2b); it is not
 * re-read from the card. Losing the offer — declining, or the reveal being
 * impossible — consumes it either way, so nothing is remembered here.
 */
export type MiraclePrompt = {
  /** The player who drew the card and answers the offer. */
  player: PlayerId;
  /** The drawn card, still in hand until it is revealed. */
  objectId: ObjectId;
  /** CR 702.94a: the miracle cost, as the offer latched it. */
  cost?: unknown;
};
export function miraclePrompt(snapshot: EngineSnapshot | null): MiraclePrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'MiracleReveal') return null;
  const data = waiting.data ?? {};
  // A reveal that names no card has nothing to reveal, and the engine rejects a
  // cast that does not name the offered object, so there is no answer to offer.
  if (typeof data.object_id !== 'number') return null;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    objectId: data.object_id as ObjectId,
    cost: data.cost
  };
}
// Accepting the reveal is `castAsMiracleAction`, declared with the `CastOffer`
// block below: the same action answers the reveal and the cast offer that follows
// it (CR 702.94a + CR 608.2g).
/** CR 702.94a: decline — the card stays unrevealed in hand and the offer is spent. */
export function declineMiracleAction(): GameAction {
  return { type: 'DecideOptionalEffect', data: { accept: false } };
}

/**
 * CR 608.2g: **«you may cast it»** during a resolution. One `WaitingFor` variant,
 * nine shapes — the engine reuses `CastOffer` for every cast it offers while a spell
 * or ability is resolving, and each shape answers with a different action. The block
 * is one block because the question is always the same one (cast this, or not), and
 * the copy changes with the shape:
 *
 *   - `Adventure` (CR 715.3a) — which face: the creature or the Adventure half.
 *     The engine publishes a face, not a yes/no, so there is nothing to decline.
 *   - `Miracle` (CR 702.94a) — the card revealed last step, at the cost the offer
 *     latched. Declining spends the trigger and the card stays in hand.
 *   - `Madness` (CR 702.35a) — the exiled card at its madness cost; declining puts
 *     it into its owner's graveyard, which is the whole point of madness.
 *   - `Paradigm` — a list of exiled sources offering a copy, one at a time.
 *   - `Cascade` (CR 702.85a) — cast the hit for free if its mana value ends up
 *     below `sourceMv`; declining shuffles the hit and every miss to the bottom.
 *   - `Discover` (CR 701.57a) — the same, gated by the discovered value, and
 *     declining sends the hit to hand instead.
 *   - `Ripple` (CR 702.60a) — a same-named revealed card for free, with the rest of
 *     the hits still offered afterwards; declining puts everything on the bottom.
 *   - `FreeCastWindow` (CR 608.2g) — a window of candidates, optionally bounded by
 *     casts and by a running mana-value budget; closing it is the decline.
 *   - `GraveyardPaidCast` (CR 609.4b) — a graveyard card at its real cost, with the
 *     any-type-mana concession when the grant carries it.
 */
export type CastOfferShape =
  | 'adventure'
  | 'miracle'
  | 'madness'
  | 'paradigm'
  | 'cascade'
  | 'discover'
  | 'ripple'
  | 'freeWindow'
  | 'graveyardPaid';
const CAST_OFFER_SHAPES: Record<string, CastOfferShape> = {
  Adventure: 'adventure',
  Miracle: 'miracle',
  Madness: 'madness',
  Paradigm: 'paradigm',
  Cascade: 'cascade',
  Discover: 'discover',
  Ripple: 'ripple',
  FreeCastWindow: 'freeWindow',
  GraveyardPaidCast: 'graveyardPaid'
};
export type CastOfferPrompt = {
  shape: CastOfferShape;
  /** The player the offer belongs to. */
  player: PlayerId;
  /** The single card being offered (absent in `paradigm` and `freeWindow`). */
  objectId: ObjectId | null;
  /** CR 702.94a / CR 702.35a: the cost the offer latched. */
  cost?: unknown;
  /** CR 601.2b: a cost the grant adds on top of the printed one. */
  additionalCost?: unknown;
  /** CR 609.4b: "mana of any type can be spent to cast that spell". */
  anyMana: boolean;
  /** `paradigm` sources and `freeWindow` candidates, in engine order. */
  candidates: ObjectId[];
  /** Cards that go to the library bottom with the decline (cascade/discover/ripple). */
  misses: ObjectId[];
  /** CR 702.60a: same-named cards still to be offered after this one. */
  remainingHits: ObjectId[];
  /** CR 702.85a: the cascading spell's mana value — the hit must land below it. */
  sourceMv: number | null;
  /** CR 701.57a: the discovered value the hit's mana value must not exceed. */
  discoverValue: number | null;
  /** CR 608.2c: casts left in the window, or `null` for "any number of spells". */
  remainingCasts: number | null;
  /** CR 202.3: mana-value budget left in the window, or `null` for no cap. */
  mvBudget: number | null;
};
export function castOfferPrompt(snapshot: EngineSnapshot | null): CastOfferPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'CastOffer') return null;
  const data = waiting.data ?? {};
  const kind = data.kind as Record<string, unknown> | undefined;
  const shape = kind && typeof kind.type === 'string' ? CAST_OFFER_SHAPES[kind.type] : undefined;
  if (!kind || !shape) return null;
  const ids = (value: unknown): ObjectId[] =>
    Array.isArray(value) ? (value as unknown[]).filter((id): id is ObjectId => typeof id === 'number') : [];
  const number = (value: unknown): number | null => (typeof value === 'number' ? value : null);
  // Every shape names its card differently: cascade/discover/ripple/graveyard use
  // `hit_card`, adventure/miracle/madness use `object_id`.
  const single = kind.hit_card ?? kind.object_id;
  return {
    shape,
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    objectId: typeof single === 'number' ? (single as ObjectId) : null,
    cost: kind.cost,
    additionalCost: kind.additional_cost,
    anyMana: kind.mana_spend_permission != null,
    candidates: ids(kind.offers).length ? ids(kind.offers) : ids(kind.candidates),
    misses: ids(kind.exiled_misses).length ? ids(kind.exiled_misses) : ids(kind.revealed_misses),
    remainingHits: ids(kind.remaining_hits),
    sourceMv: number(kind.source_mv),
    discoverValue: number(kind.discover_value),
    remainingCasts: number(kind.remaining_casts),
    mvBudget: number(kind.remaining_mv_budget)
  };
}
/** CR 715.3a: the creature face, or the Adventure half. */
export function adventureFaceAction(creature: boolean): GameAction {
  return { type: 'ChooseAdventureFace', data: { creature } };
}
/** CR 702.94a: cast the revealed card at the latched miracle cost. */
export function castAsMiracleAction(objectId: ObjectId, cardId: number): GameAction {
  return {
    type: 'CastSpellAsMiracle',
    data: { object_id: objectId, card_id: cardId, payment_mode: { type: 'Auto' } }
  };
}
/** CR 702.35a: cast the exiled card at its madness cost. */
export function castAsMadnessAction(objectId: ObjectId, cardId: number): GameAction {
  return {
    type: 'CastSpellAsMadness',
    data: { object_id: objectId, card_id: cardId, payment_mode: { type: 'Auto' } }
  };
}
/** Paradigm: cast a copy of one of the offered exiled sources. */
export function castParadigmCopyAction(source: ObjectId): GameAction {
  return { type: 'CastParadigmCopy', data: { source } };
}
/** Paradigm: pass the turn-based offer. */
export function passParadigmOfferAction(): GameAction {
  return { type: 'PassParadigmOffer', data: {} };
}
/** CR 702.85a / CR 701.57a / CR 702.60a / CR 609.4b: the shared cast-or-decline answer. */
export function castOfferChoiceAction(shape: CastOfferShape, cast: boolean): GameAction {
  const choice = cast ? 'Cast' : 'Decline';
  const type =
    shape === 'cascade'
      ? 'CascadeChoice'
      : shape === 'discover'
        ? 'DiscoverChoice'
        : shape === 'ripple'
          ? 'RippleChoice'
          : shape === 'graveyardPaid'
            ? 'GraveyardPaidCastChoice'
            : null;
  // The other shapes answer with their own actions; asking here would be a bug.
  if (!type) throw new Error(`CastOffer ${shape} has no cast/decline answer`);
  return { type, data: { choice } };
}
/** CR 608.2c: cast one candidate of a free-cast window. */
export function castFreeCandidateAction(selection: ObjectId): GameAction {
  return { type: 'FreeCastWindowChoice', data: { selection } };
}
/** CR 608.2c: close the window with no further casts (`selection: null`). */
export function finishFreeCastWindowAction(): GameAction {
  return { type: 'FreeCastWindowChoice', data: { selection: null } };
}

/**
 * CR 701.42: meld — two permanents are exiled and, if they are the printed halves,
 * a single card comes back fused. The engine freezes *referents*, not names: the
 * prompt lists each candidate pair as `MeldSelection { source_id, partner_id,
 * expected_source, expected_partner, result }`, and the answer names the pair by
 * both object ids (`ChooseMeldPair`), because a name would not say which copy.
 *
 * Two consequences the block states instead of hiding:
 *
 *   - With exactly one legal partner the engine **does not ask**: it melds straight
 *     away, so this window only exists when several permanents could be the other
 *     half (duplicates of the same card, say).
 *   - Choosing a pair does not guarantee the meld. The instruction exiles both
 *     referents first and only then checks that the tracked cards really are the
 *     canonical halves (CR 701.42b); if they are not, nothing comes back.
 */
export type MeldChoice = {
  sourceId: ObjectId;
  partnerId: ObjectId;
  /** CR 508.4: the result enters tapped and attacking, so a destination follows. */
  attacking: boolean;
};
export type MeldPrompt = {
  player: PlayerId;
  /** The half that stays fixed across every candidate. */
  sourceId: ObjectId;
  /** Printed name of that half, as the instruction expects it. */
  expectedSource?: string;
  /** The card the pair would become. */
  result?: string;
  choices: MeldChoice[];
};
export function meldPrompt(snapshot: EngineSnapshot | null): MeldPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'MeldPairChoice') return null;
  const data = waiting.data ?? {};
  const raw = Array.isArray(data.choices) ? (data.choices as unknown[]) : [];
  const choices: MeldChoice[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const choice = entry as Record<string, unknown>;
    if (typeof choice.source_id !== 'number' || typeof choice.partner_id !== 'number') continue;
    const mode = choice.entry;
    const attacking =
      (typeof mode === 'string' && mode === 'TappedAndAttacking') ||
      (!!mode && typeof mode === 'object' && (mode as Record<string, unknown>).type === 'TappedAndAttacking');
    choices.push({
      sourceId: choice.source_id as ObjectId,
      partnerId: choice.partner_id as ObjectId,
      attacking
    });
  }
  if (!choices.length) return null;
  const first = raw[0] as Record<string, unknown>;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    sourceId: choices[0].sourceId,
    expectedSource: typeof first.expected_source === 'string' ? first.expected_source : undefined,
    result: typeof first.result === 'string' ? first.result : undefined,
    choices
  };
}
/** CR 701.42: name the pair by both object ids; the engine validates it against the offer. */
export function chooseMeldPairAction(sourceId: ObjectId, partnerId: ObjectId): GameAction {
  return { type: 'ChooseMeldPair', data: { source_id: sourceId, partner_id: partnerId } };
}

/**
 * CR 508.4: the melded permanent enters tapped and attacking, so its controller
 * chooses one defending player, planeswalker or battle. The engine publishes the
 * complete legal topology (`valid_targets`) and the prompt only exists when there
 * is more than one destination — with exactly one it enters attacking there and
 * nothing is asked.
 *
 * The context is the same `MeldSelection` the pair choice froze, so the block can
 * name the card that is entering without re-reading the battlefield.
 */
export type MeldAttackPrompt = {
  player: PlayerId;
  /** The melded permanent (the surviving half). */
  sourceId: ObjectId;
  /** The card it became, as the instruction named it. */
  result?: string;
  targets: AttackTarget[];
};
export function meldAttackPrompt(snapshot: EngineSnapshot | null): MeldAttackPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'MeldAttackTargetChoice') return null;
  const data = waiting.data ?? {};
  const context = data.context as Record<string, unknown> | undefined;
  if (!context || typeof context.source_id !== 'number') return null;
  const targets = attackTargetList(data.valid_targets);
  // The engine only pauses when it has a destination to ask about.
  if (!targets.length) return null;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    sourceId: context.source_id as ObjectId,
    result: typeof context.result === 'string' ? context.result : undefined,
    targets
  };
}
/** CR 508.4: the entering permanent attacks the chosen destination. */
export function chooseEntryAttackTargetAction(target: AttackTarget): GameAction {
  return { type: 'ChooseEntryAttackTarget', data: { target } };
}
/**
 * CR 508.4: the destinations Phase publishes are `Player`, `Planeswalker` and
 * `Battle`, each as `{ type, data }`. A malformed entry is not a destination: the
 * button it would draw could not name anyone, and the answer is that same object.
 */
function attackTargetList(raw: unknown): AttackTarget[] {
  return Array.isArray(raw)
    ? (raw as unknown[]).filter((entry): entry is AttackTarget => {
        if (!entry || typeof entry !== 'object') return false;
        const target = entry as Record<string, unknown>;
        return typeof target.type === 'string' && typeof target.data === 'number';
      })
    : [];
}
/**
 * CR 508.4: a permanent that enters the battlefield **already attacking** skipped
 * the declare-attackers step (CR 508.1), so its controller names the defending
 * player, planeswalker or battle it attacks — and CR 508.4a is what happens when
 * that destination is gone by the time the choice is applied. Ninjutsu
 * (CR 702.49c), sneak (CR 702.190b) and every "put it onto the battlefield tapped
 * and attacking" instruction land in this same window.
 *
 * This is the generic variant, not the melded one: there is no frozen
 * `MeldSelection` here, only `object_id`, which is the real permanent — so the
 * block reads the name off the battlefield instead of a published result.
 *
 * The window exists only when the legal topology has more than one destination;
 * with exactly one the engine seats the attacker there and asks nothing.
 */
export type EntryAttackPrompt = {
  player: PlayerId;
  /** The permanent that is entering attacking. */
  objectId: ObjectId;
  targets: AttackTarget[];
};
export function entryAttackPrompt(snapshot: EngineSnapshot | null): EntryAttackPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'EntryAttackTargetChoice') return null;
  const data = waiting.data ?? {};
  if (typeof data.object_id !== 'number') return null;
  const targets = attackTargetList(data.valid_targets);
  // The engine only pauses when it has a destination to ask about.
  if (!targets.length) return null;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    objectId: data.object_id as ObjectId,
    targets
  };
}

/**
 * CR 616.1: a replacement effect rewrites an event before it happens, and when
 * more than one applies the affected player decides. One `WaitingFor` serves
 * **three** structurally different prompts, and the engine publishes which one
 * (`kind`) exactly so the display layer does not re-derive it from label text:
 *
 *   - `order` (CR 616.1e): several distinct replacements apply. The player picks
 *     **one** now; per CR 616.1f the engine applies it and re-prompts for
 *     whatever is still applicable, so this is a sequence of single picks, not a
 *     sortable list. `lastAppliedDecides` says whether the last one applied alone
 *     decides the outcome (every colliding write overwrites the same field) or
 *     the effects compose (damage doublers against adders, counters, mana).
 *   - `optionalBranch`: a single "you may" replacement shown as two branches of
 *     one source — index 0 accepts, index 1 declines. Not an ordering.
 *   - `destination`: mutually exclusive destinations for a found card.
 *
 * The answer is always a **position** in the list (`ChooseReplacement { index }`),
 * which is why the prompt keeps every slot: an index has to name the same option
 * the engine means, described or not.
 */
export type ReplacementKind = 'order' | 'optional' | 'destination';
export type ReplacementOption = {
  /** Position in the engine's list — the whole of `ChooseReplacement { index }`. */
  index: number;
  /** Who causes it, when Phase names a source. */
  sourceId: ObjectId | null;
  sourceName: string | null;
  /** The engine's own wording for what this option does; `null` when it sent none. */
  description: string | null;
};
export type ReplacementPrompt = {
  player: PlayerId;
  kind: ReplacementKind;
  /** One slot per answer the engine will accept, in index order. */
  options: ReplacementOption[];
  /** CR 616.1f: whether the last replacement applied alone decides the outcome. */
  lastAppliedDecides: boolean;
  /** CR 616.1: the engine will accept a remembered answer for this prompt. */
  rememberable: boolean;
};
/** CR 616.1: the engine's own classification, read from its tag. */
function replacementKind(raw: unknown): ReplacementKind {
  const tag =
    typeof raw === 'string'
      ? raw
      : raw && typeof raw === 'object' && typeof (raw as { type?: unknown }).type === 'string'
        ? (raw as { type: string }).type
        : 'Order';
  if (tag === 'OptionalBranch') return 'optional';
  if (tag === 'SearchFoundDestination') return 'destination';
  return 'order';
}
export function replacementPrompt(snapshot: EngineSnapshot | null): ReplacementPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'ReplacementChoice') return null;
  const data = waiting.data ?? {};
  const summaries = Array.isArray(data.candidates) ? (data.candidates as unknown[]) : [];
  const described: ReplacementOption[] = summaries.map((entry, index) => {
    const candidate = entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {};
    const name = typeof candidate.source_name === 'string' && candidate.source_name ? candidate.source_name : null;
    const description =
      typeof candidate.description === 'string' && candidate.description ? candidate.description : null;
    return {
      index,
      sourceId: typeof candidate.source_id === 'number' ? (candidate.source_id as ObjectId) : null,
      sourceName: name,
      description
    };
  });
  // `candidate_count` is what the engine will accept; the summaries describe those
  // slots but are not guaranteed to fill them (`EmptyManaPool` filters). Keeping the
  // unnamed slots is what stops a legal index from having no button.
  const count = typeof data.candidate_count === 'number' ? data.candidate_count : described.length;
  const options: ReplacementOption[] = Array.from({ length: Math.max(count, described.length) }, (_, index) =>
    described[index] ?? { index, sourceId: null, sourceName: null, description: null }
  );
  if (!options.length) return null;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    kind: replacementKind(data.kind),
    options,
    lastAppliedDecides: data.last_applied_decides === true,
    rememberable: data.remember_identity != null
  };
}
/** CR 616.1: apply the replacement at `index`, or accept the branch there. */
export function chooseReplacementAction(index: number): GameAction {
  return { type: 'ChooseReplacement', data: { index } };
}

/**
 * CR 707.2 + CR 707.9: which permanent a copy effect copies. Copying does not
 * target (CR 707.9), so hexproof and shroud do not filter `valid_targets` — the
 * engine publishes the legal permanents and the table echoes them.
 *
 * The variant carries **three** purposes and the engine says which one, because
 * the answer means something different in each:
 *
 *   - `copy`: the entering object becomes a copy of the chosen permanent and takes
 *     its copiable values (Clone, Phantasmal Image, Vesuva).
 *   - `latch` (CR 707.2c): the chosen permanent's copiable values are latched onto
 *     the source Aura's host — the Aura itself never becomes the copy
 *     (Metamorphic Alteration).
 *   - `tokenSource` (CR 707.1): the chosen permanent is the copy source for a
 *     token-creation substitution (Esix, Fractal Bloom); nothing is transformed.
 *
 * `maxManaValue` is a ceiling the instruction prints: the engine has already
 * filtered `targets`, so it is a sentence, never a second filter of our own.
 */
export type CopyPurpose = 'copy' | 'latch' | 'tokenSource';
export type CopyTargetPrompt = {
  player: PlayerId;
  /** The entering object (or the effect's own permanent) the copy belongs to. */
  sourceId: ObjectId;
  purpose: CopyPurpose;
  /** The legal permanents, as Phase published them. */
  targets: ObjectId[];
  /** The instruction's mana-value ceiling, when it has one. */
  maxManaValue: number | null;
};
/** The engine's tag for the copy purpose; an absent field is a `BecomeCopy`. */
function copyPurpose(raw: unknown): CopyPurpose {
  const tag =
    typeof raw === 'string'
      ? raw
      : raw && typeof raw === 'object' && typeof (raw as { type?: unknown }).type === 'string'
        ? (raw as { type: string }).type
        : 'BecomeCopy';
  if (tag === 'PersistChosenAttribute') return 'latch';
  if (tag === 'CopyTokenSource') return 'tokenSource';
  return 'copy';
}
export function copyTargetPrompt(snapshot: EngineSnapshot | null): CopyTargetPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'CopyTargetChoice') return null;
  const data = waiting.data ?? {};
  if (typeof data.source_id !== 'number') return null;
  const targets = Array.isArray(data.valid_targets)
    ? (data.valid_targets as unknown[]).filter((id): id is ObjectId => typeof id === 'number')
    : [];
  // With nothing to copy the engine would not have raised the window.
  if (!targets.length) return null;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    sourceId: data.source_id as ObjectId,
    purpose: copyPurpose(data.purpose),
    targets,
    maxManaValue: typeof data.max_mana_value === 'number' ? data.max_mana_value : null
  };
}
// CR 707.9: the answer is a `TargetRef`, sent with the same `ChooseTarget` the
// target pickers use — `chooseCopyTargetAction({ Object: id })`, which the copy
// retarget flow already owns. That shared action is exactly why this window is
// parsed by its `WaitingFor` variant and not by the action.

/**
 * CR 117.3d + CR 117.4: the table's «resolve all» shortcut asks each priority
 * representative to consent before Phase resolves the remaining batch at once.
 * The prompt carries only `epoch` and `representative` — the run's participant
 * list, its scope and the auto-pass baseline are server-private and are cleared
 * from every viewer projection (`resolve_all_consent_run = None`), so the block
 * names the seat that is being asked and nothing else.
 *
 * `epoch` is the anti-replay guard: a delayed answer naming another epoch is
 * refused, which is why the buttons come from `legal.actions` — the engine's own
 * envelope — instead of being built from the epoch the table is looking at.
 */
export type ResolveAllPrompt = {
  /** The seat whose consent is being asked (the engine's `representative`). */
  representative: PlayerId;
  /** The proposal this answer belongs to. */
  epoch: number;
  /** Whether the engine currently offers each answer to this viewer. */
  grantOffered: boolean;
  declineOffered: boolean;
};
export function resolveAllPrompt(snapshot: EngineSnapshot | null): ResolveAllPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'ResolveAllConsent') return null;
  const data = waiting.data ?? {};
  if (typeof data.representative !== 'number') return null;
  const epoch = typeof data.epoch === 'number' ? data.epoch : null;
  const offers = resolveAllAnswers(snapshot, epoch);
  return {
    representative: data.representative,
    epoch: epoch ?? 0,
    grantOffered: offers.grant !== undefined,
    declineOffered: offers.decline !== undefined
  };
}
/** The engine's own `RespondResolveAllConsent` envelopes for one epoch. */
function resolveAllAnswers(
  snapshot: EngineSnapshot | null,
  epoch: number | null
): { grant?: GameAction; decline?: GameAction } {
  const actions = snapshot?.legal.actions ?? [];
  const forEpoch = actions.filter((action) => {
    if (action.type !== 'RespondResolveAllConsent') return false;
    return epoch === null || action.data?.epoch === epoch;
  });
  const pick = (decision: string) =>
    forEpoch.find(
      (action) => (action.data?.decision as { type?: string } | undefined)?.type === decision
    );
  return { grant: pick('Grant'), decline: pick('Decline') };
}
export function grantResolveAllAction(snapshot: EngineSnapshot | null): GameAction | undefined {
  const epoch = typeof snapshot?.state.waiting_for?.data?.epoch === 'number' ? (snapshot.state.waiting_for.data.epoch as number) : null;
  return resolveAllAnswers(snapshot, epoch).grant;
}
export function declineResolveAllAction(snapshot: EngineSnapshot | null): GameAction | undefined {
  const epoch = typeof snapshot?.state.waiting_for?.data?.epoch === 'number' ? (snapshot.state.waiting_for.data.epoch as number) : null;
  return resolveAllAnswers(snapshot, epoch).decline;
}
/** Withdrawing a consent that was already given, while the epoch is still live. */
export function revokeResolveAllAction(
  snapshot: EngineSnapshot | null,
  representative: PlayerId
): GameAction | undefined {
  return (snapshot?.legal.actions ?? []).find(
    (action) => action.type === 'RevokeResolveAllConsent' && action.data?.representative === representative
  );
}

/**
 * CR 502.3: the untap step belongs to the active player, and Phase splits the
 * question in two shapes that are **not** the same decision:
 *
 *   - `UntapChoice`: one permanent at a time, «you may choose not to untap this
 *     permanent» (Vedalken Shackles class). The answer names the permanent and a
 *     boolean, and the engine re-prompts with the rest; `chosen_not_to_untap` is
 *     what has been declined so far in this step.
 *   - `ChooseUntapSubset`: a `MaxUntapPerType` cap (Smoke, Stoic Angel, Winter Orb)
 *     leaves more eligible permanents than the cap allows, so the player **must**
 *     pick which ones untap. The answer is a subset of `group` no larger than
 *     `max`, and an empty subset is legal: everything stays tapped.
 *
 * Both are `DirectChoices` for the engine, and both are parsed by their variant —
 * `ChooseUntap` is not shared with anything else, but `SelectCards` is shared with
 * every card picker in the game.
 */
/** CR 502.1 + CR 502.3: how far the untap step had run when the prompt was raised. */
export type UntapStepProgress = 'after-turn-based-actions' | 'before-turn-based-actions';
/**
 * CR 502.1 + CR 502.2: `UntapStepProgress` is serialized **unconditionally** by the
 * writers of this engine (no `skip_serializing_if`), so its absence on the wire is a
 * fact about the writer: a build that offered the determination before phasing and
 * the day/night check. That is also the engine's own serde default, so an absent
 * field reads as `before-turn-based-actions` here instead of a third state the
 * player could not act on.
 */
function untapProgress(value: unknown): UntapStepProgress {
  return value === 'AfterTurnBasedActions' ? 'after-turn-based-actions' : 'before-turn-based-actions';
}
export type UntapPrompt = {
  player: PlayerId;
  /** Whose untap step is being asked about. */
  candidates: ObjectId[];
  /** CR 502.3: already declined in this step, in the engine's own order. */
  declined: ObjectId[];
  /** CR 502.1: where the step stood; `before` means the answer restarts its actions. */
  progress: UntapStepProgress;
};
export function untapPrompt(snapshot: EngineSnapshot | null): UntapPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'UntapChoice') return null;
  const data = waiting.data ?? {};
  const ids = (raw: unknown) =>
    Array.isArray(raw) ? (raw as unknown[]).filter((id): id is ObjectId => typeof id === 'number') : [];
  const candidates = ids(data.candidates);
  // With nothing left to ask the engine moves on by itself.
  if (!candidates.length) return null;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    candidates,
    declined: ids(data.chosen_not_to_untap),
    progress: untapProgress(data.progress)
  };
}
/** CR 502.3: untap this one, or leave it tapped. */
export function chooseUntapAction(objectId: ObjectId, untap: boolean): GameAction {
  return { type: 'ChooseUntap', data: { object_id: objectId, untap } };
}

export type UntapSubsetPrompt = {
  player: PlayerId;
  /** The over-cap permanents competing for the cap; all are tapped and eligible. */
  group: ObjectId[];
  /** CR 502.3: at most this many of `group` untap. */
  max: number;
  /** CR 502.1: where the step stood; `before` means the answer restarts its actions. */
  progress: UntapStepProgress;
};
export function untapSubsetPrompt(snapshot: EngineSnapshot | null): UntapSubsetPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'ChooseUntapSubset') return null;
  const data = waiting.data ?? {};
  const group = Array.isArray(data.group)
    ? (data.group as unknown[]).filter((id): id is ObjectId => typeof id === 'number')
    : [];
  if (!group.length) return null;
  const max = typeof data.max === 'number' ? data.max : 0;
  // A cap of zero asks nothing a player could answer.
  if (max < 1) return null;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    group,
    max,
    progress: untapProgress(data.progress)
  };
}
/**
 * CR 502.3: the chosen subset, copied. The engine accepts fewer than `max` and
 * also none at all — the complement simply stays tapped.
 */
export function untapSubsetAction(cards: ObjectId[]): GameAction {
  return selectCardsAction(cards);
}

/**
 * CR 118.3 + CR 601.2b + CR 601.2h: a cost paid by **choosing objects** is one
 * window with one answer — `SelectCards { cards }` — and a dozen meanings. The
 * engine has already filtered the candidates (`choices`) and published the
 * cardinality contract: `count` is the ceiling and `min_count` the floor, so
 * `min_count === count` is «exactly N» and `min_count < count` is «at least N»
 * (a `SacrificeForCost` with `min_count`, or a Crew-style aggregate).
 *
 * Two kinds carry their own constraint on top of the numbers and this prompt keeps
 * them verbatim instead of re-deriving: `TapCreatures { mode: Aggregate }` is the
 * «tap any number with total power ≥ N» form (CR 208.1) and `ExileAggregate` is the
 * «exile any number whose … satisfies …» form. Everything else is only the kind
 * plus the published numbers.
 *
 * CR 400.2: `choices` may be **redacted for this viewer** — `Reveal`/`Discard` lose
 * the whole list, hand-pitch exile keeps the cardinality with `0` placeholders, and
 * `Behold` drops the hand cards. A `0` is therefore not a card: `hiddenChoices`
 * counts placeholders so the block can say «no la ves» instead of inventing a name.
 */
export type PayCostKindName =
  | 'discard'
  | 'reveal'
  | 'sacrifice'
  | 'return-to-hand'
  | 'exile-from-zone'
  | 'exile-materials'
  | 'exile-permanent'
  | 'exile-from-mana-zone'
  | 'unattach'
  | 'remove-counter'
  | 'tap-creatures'
  | 'behold'
  | 'exile-aggregate'
  | 'unknown';
/** CR 601.2b + CR 605.3b: which pipeline resumes once the cost is paid. */
export type PayCostResume =
  | 'spell'
  | 'spell-cost'
  | 'mana-ability'
  | 'resolution'
  | 'team-tap'
  | 'turn-face-up'
  | 'unknown';

const PAY_COST_KINDS: Record<string, PayCostKindName> = {
  Discard: 'discard',
  Reveal: 'reveal',
  Sacrifice: 'sacrifice',
  ReturnToHand: 'return-to-hand',
  ExileFromZone: 'exile-from-zone',
  ExileMaterials: 'exile-materials',
  ExilePermanent: 'exile-permanent',
  ExileFromManaZone: 'exile-from-mana-zone',
  UnattachFrom: 'unattach',
  RemoveCounter: 'remove-counter',
  TapCreatures: 'tap-creatures',
  Behold: 'behold',
  ExileAggregate: 'exile-aggregate'
};
const PAY_COST_RESUMES: Record<string, PayCostResume> = {
  Spell: 'spell',
  SpellCost: 'spell-cost',
  ManaAbility: 'mana-ability',
  Resolution: 'resolution',
  TeamTapPayment: 'team-tap',
  TurnFaceUp: 'turn-face-up'
};
/** CR 107.1a: does `lhs <comparator> rhs` hold, for the engine's own codes? */
export function comparatorHolds(comparator: string, lhs: number, rhs: number): boolean {
  switch (comparator) {
    case 'GT': return lhs > rhs;
    case 'LT': return lhs < rhs;
    case 'LE': return lhs <= rhs;
    case 'EQ': return lhs === rhs;
    case 'NE': return lhs !== rhs;
    default: return lhs >= rhs;
  }
}
/** The engine's `Comparator`, as the glyph a player reads. */
export function comparatorText(value: unknown): string | null {
  switch (value) {
    case 'GE': return '≥';
    case 'GT': return '>';
    case 'LE': return '≤';
    case 'LT': return '<';
    case 'EQ': return '=';
    case 'NE': return '≠';
    default: return null;
  }
}
export type PayCostPrompt = {
  player: PlayerId;
  kind: PayCostKindName;
  /** CR 400.2: pre-filtered by the engine; `0` entries are redacted placeholders. */
  choices: ObjectId[];
  /** CR 118.3: ceiling of the answer (and the exact count when `minCount` equals it). */
  count: number;
  /** CR 118.3: floor; `0` means the empty answer is legal. */
  minCount: number;
  resume: PayCostResume;
  /** CR 400.2: how many entries the engine replaced with placeholders in this view. */
  hiddenChoices: number;
  /** Zone the cost takes from, when the kind publishes one. */
  zone: string | null;
  /** CR 701.20a: the shared quality two revealed cards have to meet. */
  sharedQuality: string | null;
  /** CR 122.1: counters this cost removes, and from how many objects. */
  counters: { count: number; perObject: 'single' | 'among' } | null;
  /** CR 122.1: which counters qualify (`any` or a counter-type name). */
  counterKind: string | null;
  /** CR 208.1: «tap any number with total power …» when the cost is aggregate. */
  tapAggregate: { comparator: string; symbol: string; value: number } | null;
  /** CR 118.3: «exile any number whose … » as the engine published it. */
  exileAggregate: { function: string; property: string; comparator: string; value: number } | null;
  /** CR 701.31a: behold either reveals or exiles the chosen card. */
  behold: 'choose-or-reveal' | 'exile-chosen' | null;
};
export function payCostPrompt(snapshot: EngineSnapshot | null): PayCostPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'PayCost') return null;
  const data = waiting.data ?? {};
  const kindRaw = data.kind as
    | {
        type?: unknown;
        zone?: unknown;
        shared_quality?: unknown;
        count?: unknown;
        selection?: unknown;
        counter_type?: unknown;
        mode?: unknown;
        function?: unknown;
        property?: unknown;
        comparator?: unknown;
        value?: unknown;
        action?: unknown;
      }
    | null
    | undefined;
  const kindType = typeof kindRaw?.type === 'string' ? kindRaw.type : '';
  const kind = PAY_COST_KINDS[kindType] ?? 'unknown';
  const rawChoices = Array.isArray(data.choices) ? (data.choices as unknown[]) : [];
  const choices = rawChoices.filter((id): id is ObjectId => typeof id === 'number' && id !== 0);
  const resumeRaw = data.resume as { type?: unknown } | null | undefined;
  const resumeType = typeof resumeRaw?.type === 'string' ? resumeRaw.type : '';
  const zone = typeof kindRaw?.zone === 'string' ? kindRaw.zone : null;
  const sharedQuality =
    typeof kindRaw?.shared_quality === 'string'
      ? kindRaw.shared_quality
      : kindRaw?.shared_quality != null
        ? 'publicada'
        : null;
  const countersRaw = kindRaw;
  const counters =
    kind === 'remove-counter'
      ? {
          count: typeof countersRaw?.count === 'number' ? countersRaw.count : 0,
          perObject: countersRaw?.selection === 'AmongObjects' ? ('among' as const) : ('single' as const)
        }
      : null;
  const counterTypeRaw = kindRaw?.counter_type;
  const counterKind =
    kind === 'remove-counter'
      ? typeof counterTypeRaw === 'string'
        ? 'cualquiera'
        : typeof (counterTypeRaw as { OfType?: unknown } | null)?.OfType === 'string'
          ? String((counterTypeRaw as { OfType: string }).OfType)
          : null
      : null;
  const modeRaw = kindRaw?.mode;
  const aggregateRaw =
    typeof modeRaw === 'object' && modeRaw !== null
      ? ((modeRaw as { Aggregate?: { comparator?: unknown; value?: unknown } }).Aggregate ?? null)
      : null;
  const tapAggregate =
    aggregateRaw && typeof aggregateRaw.value === 'number'
      ? {
          comparator: typeof aggregateRaw.comparator === 'string' ? aggregateRaw.comparator : 'GE',
          symbol: comparatorText(aggregateRaw.comparator) ?? '≥',
          value: aggregateRaw.value
        }
      : null;
  const exileRaw = kindRaw;
  const exileAggregate =
    kind === 'exile-aggregate' && typeof exileRaw?.value === 'number'
      ? {
          function: String(exileRaw.function ?? '—'),
          property: String(exileRaw.property ?? '—'),
          comparator: comparatorText(exileRaw.comparator) ?? '≥',
          value: exileRaw.value
        }
      : null;
  const beholdAction = kindRaw?.action;
  const behold =
    kind === 'behold'
      ? beholdAction === 'ExileChosen'
        ? ('exile-chosen' as const)
        : ('choose-or-reveal' as const)
      : null;
  const count = typeof data.count === 'number' ? data.count : choices.length;
  const minCount = typeof data.min_count === 'number' ? data.min_count : count;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    kind,
    choices,
    count,
    minCount: Math.min(minCount, count),
    resume: PAY_COST_RESUMES[resumeType] ?? 'unknown',
    hiddenChoices: rawChoices.length - choices.length,
    zone,
    sharedQuality,
    counters,
    counterKind,
    tapAggregate,
    exileAggregate,
    behold
  };
}
/** CR 118.3: the chosen objects, in the engine's own `SelectCards` envelope. */
export function payCostAction(cards: ObjectId[]): GameAction {
  return selectCardsAction(cards);
}

/**
 * CR 107.4f: Phyrexian mana may be paid with **2 life** instead of the colored
 * mana, per shard, at the moment the cost is paid (CR 118.3 + CR 119.4: the life
 * payment is limited by the current total). This is not a subset and not a
 * toggle — it is an **ordered vector with one entry per shard**, in the engine's
 * `shard_index` order, and its length MUST equal `shards.len()`.
 *
 * `options` is per shard and the engine already decided it: `ManaOnly` (no life to
 * spend, or a CR 119.8 lock), `LifeOnly` (no mana of that color is available) or
 * `ManaOrLife`. The block offers only what each shard allows, and `CancelCast` is a
 * real answer during this window (CR 601.2i).
 */
export type PhyrexianShardOption = 'mana-or-life' | 'mana-only' | 'life-only';
export type PhyrexianShardView = {
  /** The engine's `shard_index`: the position this answer occupies. */
  index: number;
  /** Printed shard color (one representative for hybrid-Phyrexian). */
  color: string;
  options: PhyrexianShardOption;
};
export type PhyrexianPaymentPrompt = {
  player: PlayerId;
  /** The spell being cast; public information (CR 400.2). */
  spellId: ObjectId;
  shards: PhyrexianShardView[];
};
const SHARD_OPTIONS: Record<string, PhyrexianShardOption> = {
  ManaOrLife: 'mana-or-life',
  ManaOnly: 'mana-only',
  LifeOnly: 'life-only'
};
export function phyrexianPaymentPrompt(snapshot: EngineSnapshot | null): PhyrexianPaymentPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'PhyrexianPayment') return null;
  const data = waiting.data ?? {};
  const raw = Array.isArray(data.shards) ? (data.shards as unknown[]) : [];
  const shards: PhyrexianShardView[] = raw.map((entry, position) => {
    const shard = (entry ?? {}) as { shard_index?: unknown; color?: unknown; options?: unknown };
    return {
      index: typeof shard.shard_index === 'number' ? shard.shard_index : position,
      color: typeof shard.color === 'string' ? shard.color : '—',
      options: SHARD_OPTIONS[String(shard.options ?? '')] ?? 'mana-or-life'
    };
  });
  // An empty vector asks nothing: the engine resolves the payment by itself.
  if (!shards.length) return null;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    spellId: typeof data.spell_object === 'number' ? (data.spell_object as ObjectId) : 0,
    shards
  };
}
/** CR 107.4f: one answer per shard, in the published order. */
export function phyrexianChoicesAction(choices: ('mana' | 'life')[]): GameAction {
  return {
    type: 'SubmitPhyrexianChoices',
    data: { choices: choices.map((choice) => ({ type: choice === 'mana' ? 'PayMana' : 'PayLife' })) }
  };
}

/**
 * CR 508.1d + CR 508.1h + CR 509.1c + CR 509.1d: a combat declaration the engine
 * already validated and priced, paused before anything is tapped or committed.
 *
 * `context` says which side of combat owes the money — `Attacking` (CR 508.1h:
 * Ghostly Prison, Propaganda, Sphere of Safety, Norn's Annex) or `Blocking`
 * (CR 509.1d: the defending player determines the total). It is internally
 * tagged (`#[serde(tag = "type")]`), so the wire form is `{ type: "Attacking" }`,
 * not a bare string. `total_cost` is the locked-in aggregate and `per_creature`
 * the breakdown the engine computed for this exact proposal: the block prints
 * both and never re-prices them, because a second price would be a second
 * opinion about a number the engine already froze (CR 508.1i–j, CR 509.1e–f).
 *
 * `pending` is the paused declaration itself, snapshotted as incarnation
 * references (CR 508.1k + CR 400.7): a creature that left and re-entered during
 * the pause is a new object and is dropped on accept, and a band or a block
 * pair is part of what the accept commits. The answer is a bare boolean —
 * `PayCombatTax { accept }` — so the block names the creatures for the player's
 * benefit and never for the engine's.
 */
export type CombatTaxContextName = 'attacking' | 'blocking' | 'unknown';
export type CombatTaxCreatureView = {
  /** The taxed creature, by the id the engine published. */
  id: ObjectId;
  /** Its own share of the locked-in total, as the engine computed it. */
  cost: unknown;
  /** CR 508.1d: the defender this attacker was declared against, when published. */
  target: AttackTarget | null;
};
export type CombatTaxPendingView =
  | { kind: 'attack'; attackers: CombatTaxCreatureView[]; bands: ObjectId[][] }
  | { kind: 'block'; pairs: [ObjectId, ObjectId][] }
  | { kind: 'unknown' };
export type CombatTaxPrompt = {
  player: PlayerId;
  context: CombatTaxContextName;
  /** The locked-in aggregate, exactly as the engine published it. */
  totalCost: unknown;
  /** The per-creature breakdown, in the engine's order. */
  perCreature: CombatTaxCreatureView[];
  pending: CombatTaxPendingView;
};
const COMBAT_TAX_CONTEXTS: Record<string, CombatTaxContextName> = {
  Attacking: 'attacking',
  Blocking: 'blocking'
};
/**
 * `CombatTaxContext` is a unit enum with `#[serde(tag = "type")]`, so the engine
 * writes `{ type: "Attacking" }`. A bare discriminant is accepted too: a
 * flattened projection must not become `unknown` and invent a third side of
 * combat. Anything else stays `unknown` and the block says so.
 */
const taggedName = (value: unknown): string =>
  typeof value === 'string'
    ? value
    : value && typeof value === 'object' && typeof (value as { type?: unknown }).type === 'string'
      ? (value as { type: string }).type
      : '';
const incarnationId = (value: unknown): ObjectId | null =>
  typeof value === 'number'
    ? (value as ObjectId)
    : value && typeof value === 'object' && typeof (value as { object_id?: unknown }).object_id === 'number'
      ? ((value as { object_id: number }).object_id as ObjectId)
      : null;
const attackTargetOf = (value: unknown): AttackTarget | null => {
  if (!value || typeof value !== 'object') return null;
  const target = value as { type?: unknown; data?: unknown };
  if (target.type === 'Player' && typeof target.data === 'number') {
    return { type: 'Player', data: target.data as PlayerId };
  }
  if ((target.type === 'Planeswalker' || target.type === 'Battle') && typeof target.data === 'number') {
    return { type: target.type, data: target.data as ObjectId };
  }
  return null;
};
export function combatTaxPrompt(snapshot: EngineSnapshot | null): CombatTaxPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'CombatTaxPayment') return null;
  const data = waiting.data ?? {};
  const rawBreakdown = Array.isArray(data.per_creature) ? (data.per_creature as unknown[]) : [];
  const perCreature: CombatTaxCreatureView[] = rawBreakdown.flatMap((entry) => {
    if (!Array.isArray(entry)) return [];
    const id = incarnationId(entry[0]);
    if (id === null) return [];
    return [{ id, cost: entry[1] ?? null, target: null }];
  });
  const rawPending = (data.pending ?? {}) as { type?: unknown; data?: unknown };
  const pendingData = (rawPending.data ?? {}) as Record<string, unknown>;
  let pending: CombatTaxPendingView = { kind: 'unknown' };
  if (rawPending.type === 'Attack') {
    const attacks = Array.isArray(pendingData.attacks) ? (pendingData.attacks as unknown[]) : [];
    const attackers: CombatTaxCreatureView[] = attacks.flatMap((entry) => {
      if (!Array.isArray(entry)) return [];
      const id = incarnationId(entry[0]);
      if (id === null) return [];
      return [{ id, cost: null, target: attackTargetOf(entry[1]) }];
    });
    const bands = Array.isArray(pendingData.bands)
      ? (pendingData.bands as unknown[]).map((band) =>
          Array.isArray(band)
            ? (band as unknown[]).flatMap((member) => {
                const id = incarnationId(member);
                return id === null ? [] : [id];
              })
            : []
        )
      : [];
    pending = { kind: 'attack', attackers, bands };
  } else if (rawPending.type === 'Block') {
    const assignments = Array.isArray(pendingData.assignments)
      ? (pendingData.assignments as unknown[])
      : [];
    const pairs: [ObjectId, ObjectId][] = assignments.flatMap((entry) => {
      if (!Array.isArray(entry)) return [];
      const blocker = incarnationId(entry[0]);
      const attacker = incarnationId(entry[1]);
      return blocker === null || attacker === null ? [] : [[blocker, attacker]];
    });
    pending = { kind: 'block', pairs };
  }
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    context: COMBAT_TAX_CONTEXTS[taggedName(data.context)] ?? 'unknown',
    totalCost: data.total_cost ?? null,
    perCreature,
    pending
  };
}
/** CR 508.1d: pay the locked-in total and commit the declaration, or decline it whole. */
export function payCombatTaxAction(accept: boolean): GameAction {
  return { type: 'PayCombatTax', data: { accept } };
}

/**
 * CR 601.2b: what one published `AbilityCost` is called, plus the mana object
 * when the cost *is* mana so the block can draw the pips the engine counted.
 *
 * A cost this table cannot name comes back unnamed. Printing a guessed number
 * would be a second price. `Sacrifice` with a `requirement` (an aggregate, or
 * "sacrifice all") is unnamed on purpose: the flattened count default is 1,
 * and 1 would be a lie about a cost that is not a count.
 */
export type NamedAbilityCost = { label: string | null; mana: unknown | null };
function joinEs(parts: string[], conjunction: 'y' | 'o'): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} ${conjunction} ${parts[parts.length - 1]}`;
}
function cardCountLabel(verb: 'Descartar' | 'Exiliar' | 'Revelar' | 'Moler', count: number): string | null {
  if (count < 1) return null;
  return `${verb} ${count} ${count === 1 ? 'carta' : 'cartas'}`;
}
export function namedAbilityCost(raw: unknown): NamedAbilityCost {
  const cost = (raw ?? {}) as Record<string, unknown>;
  const type = typeof cost.type === 'string' ? cost.type : '';
  if (type === 'Mana') {
    const text = manaText(cost.cost);
    const mana = cost.cost && typeof cost.cost === 'object' ? cost.cost : null;
    if (text) return { label: text, mana };
    // `ManaCost::zero()` is a real published cost (`{0}`), not a missing one.
    // `manaText` prints it empty; the block must not treat that as unnamed.
    if (mana && (mana as { type?: unknown }).type === 'Cost') return { label: '{0}', mana };
    return { label: null, mana: null };
  }
  if (type === 'PayLife') {
    const amount = cost.amount as { type?: string; value?: number } | undefined;
    if (amount?.type === 'Fixed' && typeof amount.value === 'number') {
      return { label: `${amount.value} ${amount.value === 1 ? 'vida' : 'vidas'}`, mana: null };
    }
    return { label: null, mana: null };
  }
  if (type === 'Sacrifice') {
    // Aggregate and "all" ride `requirement`. A missing count is not 1 then.
    if (cost.requirement !== undefined) return { label: null, mana: null };
    const count = fixedCount(cost.count) ?? 1;
    if (count < 1) return { label: null, mana: null };
    const noun = filterNoun(cost.target) ?? (count === 1 ? 'permanente' : 'permanentes');
    return { label: `Sacrificar ${count} ${noun}`, mana: null };
  }
  if (type === 'Discard' || type === 'Exile' || type === 'Reveal') {
    if (cost.count !== undefined && fixedCount(cost.count) === undefined) return { label: null, mana: null };
    const count = fixedCount(cost.count) ?? (type === 'Exile' ? null : 1);
    if (count === null) return { label: null, mana: null };
    const verb = type === 'Discard' ? 'Descartar' : type === 'Exile' ? 'Exiliar' : 'Revelar';
    return { label: cardCountLabel(verb, count), mana: null };
  }
  if (type === 'Tap') return { label: 'Girar un permanente', mana: null };
  if (type === 'Exert') return { label: 'Exertar esta criatura', mana: null };
  if (type === 'Mill') {
    const count = typeof cost.count === 'number' ? cost.count : null;
    return { label: count === null ? null : cardCountLabel('Moler', count), mana: null };
  }
  if (type === 'Blight') {
    const count = typeof cost.count === 'number' ? cost.count : null;
    if (count === null || count < 1) return { label: null, mana: null };
    return { label: `Poner ${count} ${count === 1 ? 'contador −1/−1' : 'contadores −1/−1'} en una criatura que controlas`, mana: null };
  }
  if (type === 'PayEnergy') {
    const amount = cost.amount as { type?: string; value?: number } | undefined;
    if (amount?.type === 'Fixed' && typeof amount.value === 'number' && amount.value >= 0) {
      return { label: `Pagar ${amount.value} de energía`, mana: null };
    }
    return { label: null, mana: null };
  }
  if (type === 'CollectEvidence') {
    const amount = typeof cost.amount === 'number' ? cost.amount : null;
    if (amount === null || amount < 1) return { label: null, mana: null };
    return { label: `Reunir pruebas con valor de maná total ${amount} o más`, mana: null };
  }
  if (type === 'ReturnToHand') {
    const count = typeof cost.count === 'number' ? cost.count : null;
    if (count === null || count < 1) return { label: null, mana: null };
    const noun = filterNoun(cost.filter) ?? (count === 1 ? 'permanente' : 'permanentes');
    return { label: `Devolver ${count} ${noun} a la mano`, mana: null };
  }
  if (type === 'TapCreatures') {
    const requirement = (cost.requirement ?? {}) as Record<string, unknown>;
    const kind = typeof requirement.requirement === 'string' ? requirement.requirement : '';
    const owns = (cost.filter as { controller?: unknown } | undefined)?.controller === 'You' ? ' que controlas' : '';
    if (kind === 'count' || (kind === '' && cost.requirement === undefined)) {
      const count = typeof requirement.count === 'number' ? requirement.count : kind === '' ? 1 : null;
      if (count === null || count < 1) return { label: null, mana: null };
      const noun = count === 1 ? 'criatura' : 'criaturas';
      return { label: `Girar ${count} ${noun}${owns}`, mana: null };
    }
    if (
      kind === 'aggregate'
      && requirement.stat === 'TotalPower'
      && requirement.comparator === 'GE'
      && typeof requirement.value === 'number'
    ) {
      return { label: `Girar criaturas${owns} con fuerza total ${requirement.value} o más`, mana: null };
    }
    return { label: null, mana: null };
  }
  if (type === 'Composite' || type === 'OneOf') {
    const parts = Array.isArray(cost.costs) ? cost.costs : null;
    if (!parts?.length) return { label: null, mana: null };
    const named = parts.map((part) => namedAbilityCost(part).label);
    if (named.some((label) => !label)) return { label: null, mana: null };
    return { label: joinEs(named as string[], type === 'Composite' ? 'y' : 'o'), mana: null };
  }
  return { label: null, mana: null };
}

/**
 * CR 601.2b + CR 601.2h: `WaitingFor::OptionalCostChoice`. The caster is
 * announcing an additional cost, and the answer is `DecideOptionalCost { index }`.
 *
 * The index means whatever `optional_cost_options` says, and nothing else:
 *   - `Optional` / `Kicker`: 0 pays the one live cost, 1 declines it. A kicker
 *     prompt publishes that live cost as `costs[0]` (`next_kicker_option`); a
 *     later sibling is another window, not another button in this one.
 *   - `Choice`: one pay per alternative, in the published order, and no
 *     decline. The caster must pay exactly one (Dusk Mangler's "sacrifice a
 *     creature, discard a card, or pay 4 life"). Dropping an entry would
 *     renumber the rest, so a cost this table cannot name is still a button.
 *   - `Required` is not prompted. If it arrives, the only payment is index 0.
 *
 * `origin` is a unit enum (a string on the wire) so the block can say "regalo"
 * without reading the card. `gift_kind` is internally tagged and only present
 * for Gift. `repeatable` is the bool the engine writes for `Repeatable` and
 * omits for `Once`. `times_kicked` is how many payments of this cost are
 * already announced, not a number the block may recompute.
 *
 * `CancelCast` is legal: the window carries `pending_cast` and
 * `allows_cancel_cast` is true (CR 601.2i). Nothing has been paid yet.
 */
export type OptionalCostShape = 'optional' | 'kicker' | 'choice' | 'required' | 'unknown';
export type OptionalCostOriginName =
  | 'kicker'
  | 'casualty'
  | 'offspring'
  | 'squad'
  | 'replicate'
  | 'bargain'
  | 'teamwork'
  | 'gift'
  | 'other'
  | 'unknown';
export type GiftKindName = 'card' | 'treasure' | 'food' | 'tapped-fish' | 'extra-turn' | 'unknown';
export type OptionalCostOptionView = {
  /** The index `DecideOptionalCost` must send. Not a display ordinal. */
  index: number;
  kind: 'pay' | 'decline';
  label: string | null;
  /** The mana object, when this pay option is mana. Decline has none. */
  mana: unknown | null;
};
export type OptionalCostPrompt = {
  player: PlayerId;
  shape: OptionalCostShape;
  origin: OptionalCostOriginName;
  /** CR 702.33c / CR 702.56a / CR 702.157a: the same cost may be paid again. */
  repeatable: boolean;
  /** Payments of this cost already announced. Zero when the field is absent. */
  timesKicked: number;
  /** `null` when the engine did not publish a gift kind. */
  giftKind: GiftKindName | null;
  /**
   * CR 118.9: `pending_cast.alternative_cost_election` is `Offered`, so this
   * Choice is an alternative-cost offer. Index 0 accepts it; any other index
   * declines it. The block still sends the published index, not a rewritten one.
   */
  alternativeOffered: boolean;
  spellId: ObjectId | null;
  options: OptionalCostOptionView[];
};
const OPTIONAL_COST_ORIGINS: Record<string, OptionalCostOriginName> = {
  Kicker: 'kicker',
  Casualty: 'casualty',
  Offspring: 'offspring',
  Squad: 'squad',
  Replicate: 'replicate',
  Bargain: 'bargain',
  Teamwork: 'teamwork',
  Gift: 'gift',
  Other: 'other'
};
const GIFT_KINDS: Record<string, GiftKindName> = {
  Card: 'card',
  Treasure: 'treasure',
  Food: 'food',
  TappedFish: 'tapped-fish',
  ExtraTurn: 'extra-turn'
};
function payOption(index: number, raw: unknown): OptionalCostOptionView {
  const named = namedAbilityCost(raw);
  return { index, kind: 'pay', label: named.label, mana: named.mana };
}
export function optionalCostPrompt(snapshot: EngineSnapshot | null): OptionalCostPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'OptionalCostChoice') return null;
  const data = waiting.data ?? {};
  const body = (data.cost ?? {}) as { type?: unknown; data?: unknown };
  const shapeName = typeof body.type === 'string' ? body.type : '';
  const shape: OptionalCostShape =
    shapeName === 'Optional' ? 'optional'
    : shapeName === 'Kicker' ? 'kicker'
    : shapeName === 'Choice' ? 'choice'
    : shapeName === 'Required' ? 'required'
    : 'unknown';
  const payload = body.data;
  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
  let options: OptionalCostOptionView[] = [];
  if (shape === 'optional') {
    options = [payOption(0, record.cost), { index: 1, kind: 'decline', label: null, mana: null }];
  } else if (shape === 'kicker') {
    // `costs.first()` is the live cost. A second entry is not index 2.
    const costs = Array.isArray(record.costs) ? record.costs : [];
    if (costs.length) {
      options = [payOption(0, costs[0]), { index: 1, kind: 'decline', label: null, mana: null }];
    }
  } else if (shape === 'choice') {
    const costs = Array.isArray(payload) ? payload : [];
    options = costs.map((cost, index) => payOption(index, cost));
  } else if (shape === 'required') {
    options = [payOption(0, payload)];
  }
  const originRaw = data.origin;
  const origin: OptionalCostOriginName =
    originRaw === undefined || originRaw === null
      ? 'other'
      : OPTIONAL_COST_ORIGINS[taggedName(originRaw)] ?? 'unknown';
  const giftRaw = data.gift_kind;
  const giftKind: GiftKindName | null =
    giftRaw === undefined || giftRaw === null
      ? null
      : GIFT_KINDS[taggedName(giftRaw)] ?? 'unknown';
  const pending = (data.pending_cast ?? {}) as { object_id?: unknown; alternative_cost_election?: unknown };
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    shape,
    origin,
    repeatable: record.repeatable === true,
    timesKicked: typeof data.times_kicked === 'number' && Number.isFinite(data.times_kicked) ? data.times_kicked : 0,
    giftKind,
    alternativeOffered: taggedName(pending.alternative_cost_election) === 'Offered',
    spellId: typeof pending.object_id === 'number' ? (pending.object_id as ObjectId) : null,
    options
  };
}
/** CR 601.2b: one published index. The same envelope answers a Defiler prompt. */
export function decideOptionalCostAction(index: number): GameAction {
  return { type: 'DecideOptionalCost', data: { index } };
}

/**
 * CR 601.2b: `WaitingFor::DefilerPayment`. A matching Defiler lets the caster
 * pay life to reduce the mana cost of a colored permanent spell. The price is
 * the engine's: `life_cost` and `mana_reduction` are already locked, and
 * `reach` says whether an unmatched colored unit spills into generic mana
 * (CR 118.7b) or is lost (the Defiler cycle's "only the amount of [color]
 * mana you pay").
 *
 * The answer is still `DecideOptionalCost { index }`, but the index is **not**
 * `optional_cost_options`. The casting dispatch maps `index == 0` to pay and
 * anything else is not this window's decline: the candidate list is exactly
 * 0 (pay) and 1 (decline). Insufficient life is the engine's refusal, not a
 * button this table may switch off.
 *
 * `reach` is omitted on the wire when it is the default `SpillsToGeneric`.
 * A missing field is that default, not "colored only" — a real Defiler
 * publishes `ColoredManaOnly` and a guess here would apply the wrong rule.
 *
 * `CancelCast` is legal, same as `OptionalCostChoice` (CR 601.2i).
 */
export type DefilerReachName = 'spill' | 'colored' | 'unknown';
export type DefilerPaymentPrompt = {
  player: PlayerId;
  /** `null` when the engine did not publish a number. Not zero, and not 2. */
  lifeCost: number | null;
  /** The reduction object, or `null` when it was not published. */
  manaReduction: unknown | null;
  reach: DefilerReachName;
  spellId: ObjectId | null;
};
export function defilerPaymentPrompt(snapshot: EngineSnapshot | null): DefilerPaymentPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'DefilerPayment') return null;
  const data = waiting.data ?? {};
  const reachRaw = data.reach;
  const reachName = reachRaw === undefined || reachRaw === null ? 'SpillsToGeneric' : taggedName(reachRaw);
  const reach: DefilerReachName =
    reachName === 'SpillsToGeneric' ? 'spill'
    : reachName === 'ColoredManaOnly' ? 'colored'
    : 'unknown';
  const pending = (data.pending_cast ?? {}) as { object_id?: unknown };
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    lifeCost: typeof data.life_cost === 'number' && Number.isFinite(data.life_cost) ? data.life_cost : null,
    manaReduction: data.mana_reduction === undefined ? null : data.mana_reduction,
    reach,
    spellId: typeof pending.object_id === 'number' ? (pending.object_id as ObjectId) : null
  };
}

/**
 * CR 608.2d: `WaitingFor::ChooseFromZoneChoice`. The player picks from a
 * tracked set the engine already filtered. The answer is `SelectCards`, the
 * same envelope as a search, and the confirm gate is the one Phase's
 * `ChooseFromZoneModal` uses:
 *
 *   - `up_to` false: exactly `count`. `up_to` true: `0..=count`.
 *   - `DistinctCardTypes`: the chosen cards must admit an injective assignment
 *     onto the published categories (`canAssignDistinctCardTypes`).
 *   - `TotalManaValue`: the engine checks the sum on submission. This table
 *     does not.
 *
 * A card id of `0` is the visibility redaction of a hidden zone, not a card
 * to click. Dropping a real id would be a different set; a zero is not real.
 */
export type ZoneConstraint =
  | { kind: 'none' }
  | { kind: 'distinct-types'; categories: string[] }
  | { kind: 'total-mana'; comparator: string; value: number }
  | { kind: 'unknown' };
export type ZoneReciprocal = 'produce' | 'consume' | 'unknown' | null;
export type ZoneChoicePrompt = {
  player: PlayerId;
  /** Published ids, including `0` placeholders. Order is the engine's. */
  cards: ObjectId[];
  count: number | null;
  upTo: boolean;
  constraint: ZoneConstraint;
  sourceId: ObjectId | null;
  reciprocal: ZoneReciprocal;
};
function zoneConstraint(raw: unknown): ZoneConstraint {
  if (raw === undefined || raw === null) return { kind: 'none' };
  if (!raw || typeof raw !== 'object') return { kind: 'unknown' };
  const body = raw as { type?: unknown; categories?: unknown; comparator?: unknown; value?: unknown };
  if (body.type === 'DistinctCardTypes') {
    const categories = Array.isArray(body.categories)
      ? body.categories.filter((entry): entry is string => typeof entry === 'string')
      : [];
    return { kind: 'distinct-types', categories };
  }
  if (body.type === 'TotalManaValue' && typeof body.comparator === 'string' && typeof body.value === 'number') {
    return { kind: 'total-mana', comparator: body.comparator, value: body.value };
  }
  return { kind: 'unknown' };
}
function zoneReciprocal(raw: unknown): ZoneReciprocal {
  if (raw === undefined || raw === null) return null;
  const name = taggedName(raw);
  if (name === 'Produce') return 'produce';
  if (name === 'Consume') return 'consume';
  return 'unknown';
}
export function zoneChoicePrompt(snapshot: EngineSnapshot | null): ZoneChoicePrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'ChooseFromZoneChoice') return null;
  const data = waiting.data ?? {};
  const cards = Array.isArray(data.cards)
    ? data.cards.filter((id): id is ObjectId => typeof id === 'number')
    : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    cards,
    count: typeof data.count === 'number' && Number.isFinite(data.count) ? data.count : null,
    upTo: data.up_to === true,
    constraint: zoneConstraint(data.constraint),
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : null,
    reciprocal: zoneReciprocal(data.reciprocal_role)
  };
}
/**
 * Phase's confirm gate for `DistinctCardTypes`: an injective assignment of
 * the chosen cards onto the published categories. An empty pick is valid
 * here; the count gate is separate. A card this snapshot does not carry
 * cannot be assigned.
 */
export function canAssignDistinctCardTypes(
  objects: Record<string, { card_types?: { core_types?: string[] } } | undefined>,
  selectedIds: ObjectId[],
  categories: string[]
): boolean {
  if (selectedIds.length === 0) return true;
  if (selectedIds.length > categories.length) return false;
  const cardOptions = selectedIds.map((id) => {
    const types = objects[String(id)]?.card_types?.core_types;
    if (!types) return null;
    return categories
      .map((category, index) => (types.includes(category) ? index : -1))
      .filter((index) => index >= 0);
  });
  if (cardOptions.some((options) => !options || options.length === 0)) return false;
  const sorted = [...cardOptions]
    .filter((options): options is number[] => Array.isArray(options))
    .sort((a, b) => a.length - b.length);
  const used = new Array<boolean>(categories.length).fill(false);
  const assign = (index: number): boolean => {
    if (index === sorted.length) return true;
    for (const categoryIndex of sorted[index]) {
      if (used[categoryIndex]) continue;
      used[categoryIndex] = true;
      if (assign(index + 1)) return true;
      used[categoryIndex] = false;
    }
    return false;
  };
  return assign(0);
}
/** Whether Phase's modal would enable confirm for this pick. */
export function zoneChoiceReady(
  prompt: ZoneChoicePrompt,
  selected: ObjectId[],
  objects: Record<string, { card_types?: { core_types?: string[] } } | undefined>
): boolean {
  if (prompt.count === null) return false;
  if (selected.some((id) => id === 0 || !prompt.cards.includes(id))) return false;
  if (new Set(selected).size !== selected.length) return false;
  const countValid = prompt.upTo ? selected.length <= prompt.count : selected.length === prompt.count;
  if (!countValid) return false;
  if (prompt.constraint.kind === 'distinct-types') {
    return canAssignDistinctCardTypes(objects, selected, prompt.constraint.categories);
  }
  return true;
}

/**
 * CR 712.12 / CR 712.11b: `WaitingFor::ModalFaceChoice`. The player picks which
 * face to play or cast. Phase's modal does not rebuild the action: a face
 * button exists only when `legal.actions` already contains that
 * `ChooseModalFace`, and cancel exists only when `CancelCast` does. A
 * resolution-owned choice may offer one side. An ordinary cast offers both
 * faces that are still legal, and no cancel.
 */
export type ModalFacePrompt = {
  player: PlayerId;
  objectId: ObjectId | null;
  cardId: number | null;
  /** `Auto` when the field is absent: that is serde's default, not a guess. */
  paymentMode: string;
  /** Mana added to the elected face, or `null` when the engine published none. */
  additionalCost: unknown | null;
};
export function modalFacePrompt(snapshot: EngineSnapshot | null): ModalFacePrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'ModalFaceChoice') return null;
  const data = waiting.data ?? {};
  const mode = data.payment_mode;
  const paymentMode = typeof mode === 'string'
    ? mode
    : mode && typeof mode === 'object' && typeof (mode as { type?: unknown }).type === 'string'
      ? (mode as { type: string }).type
      : 'Auto';
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    objectId: typeof data.object_id === 'number' ? (data.object_id as ObjectId) : null,
    cardId: typeof data.card_id === 'number' ? data.card_id : null,
    paymentMode,
    additionalCost: data.resolution_additional_cost === undefined ? null : data.resolution_additional_cost
  };
}
export type ModalFaceOffers = {
  front: GameAction | null;
  back: GameAction | null;
  cancel: GameAction | null;
};
/**
 * CR 118.9: the quality an Emerge cost sacrifices, from the engine's
 * description. The typed cost filter is not a second reading of that quality.
 */
export function emergeSacrificeLabel(description: unknown): string | null {
  if (!description || typeof description !== 'object') return null;
  const body = description as { type?: unknown; quality?: unknown };
  if (body.type !== 'EmergeSacrifice' || !body.quality || typeof body.quality !== 'object') return null;
  const quality = body.quality as { type?: unknown; data?: unknown };
  if (quality.type === 'Subtype') {
    return typeof quality.data === 'string' && quality.data ? `un permanente ${quality.data}` : null;
  }
  const named: Record<string, string> = {
    Artifact: 'un artefacto',
    Battle: 'una batalla',
    Card: 'una carta',
    Creature: 'una criatura',
    Enchantment: 'un encantamiento',
    Instant: 'un instantáneo',
    Kindred: 'un permanente tribal',
    Land: 'una tierra',
    Permanent: 'un permanente',
    Planeswalker: 'un planeswalker',
    Sorcery: 'un conjuro'
  };
  return typeof quality.type === 'string' ? named[quality.type] ?? null : null;
}

/** The published actions, not rebuilt ones. A missing `back_face` is not a face. */
export function modalFaceOffers(actions: GameAction[]): ModalFaceOffers {
  const faces = actions.filter((action) => action.type === 'ChooseModalFace');
  const face = (back: boolean) => faces.find((action) => action.data?.back_face === back) ?? null;
  return {
    front: face(false),
    back: face(true),
    cancel: actions.find((action) => action.type === 'CancelCast') ?? null
  };
}

function paymentModeOf(raw: unknown): string {
  if (typeof raw === 'string' && raw) return raw;
  if (raw && typeof raw === 'object' && typeof (raw as { type?: unknown }).type === 'string') {
    return (raw as { type: string }).type;
  }
  return 'Auto';
}

/**
 * CR 118.9: `WaitingFor::AlternativeCastChoice`. The caster pays the printed
 * mana cost or the keyword-granted alternative. The keyword lives on the
 * prompt and only chooses the words; the action is `ChooseAlternativeCast`
 * with `Normal` or `Alternative`, and a button exists only when that action
 * is already legal. Rebuilding the missing side would offer a cost the engine
 * had not published. `CancelCast` is not part of this candidate set; it is
 * offered only if a later writer actually publishes it.
 */
export type AlternativeCastPrompt = {
  player: PlayerId;
  objectId: ObjectId | null;
  cardId: number | null;
  /** Engine discriminant. Empty when the wire did not name one. */
  keyword: string;
  paymentMode: string;
  normalCost: unknown | null;
  /** `null` when the alternative has no mana portion. A published `{0}` stays. */
  alternativeCost: unknown | null;
  additionalCost: unknown | null;
  additionalDescription: unknown | null;
};
export function alternativeCastPrompt(snapshot: EngineSnapshot | null): AlternativeCastPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'AlternativeCastChoice') return null;
  const data = waiting.data ?? {};
  const keyword = data.keyword;
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    objectId: typeof data.object_id === 'number' ? (data.object_id as ObjectId) : null,
    cardId: typeof data.card_id === 'number' ? data.card_id : null,
    keyword: keyword && typeof keyword === 'object' && typeof (keyword as { type?: unknown }).type === 'string'
      ? (keyword as { type: string }).type
      : typeof keyword === 'string' ? keyword : '',
    paymentMode: paymentModeOf(data.payment_mode),
    normalCost: data.normal_cost === undefined ? null : data.normal_cost,
    alternativeCost: data.alternative_cost === undefined || data.alternative_cost === null ? null : data.alternative_cost,
    additionalCost: data.alternative_additional_cost === undefined || data.alternative_additional_cost === null
      ? null
      : data.alternative_additional_cost,
    additionalDescription: data.alternative_additional_cost_description === undefined
      || data.alternative_additional_cost_description === null
      ? null
      : data.alternative_additional_cost_description
  };
}
export type AlternativeCastOffers = {
  normal: GameAction | null;
  alternative: GameAction | null;
  cancel: GameAction | null;
};
/** A choice that is not the tagged `Normal` / `Alternative` is not a button. */
export function alternativeCastOffers(actions: GameAction[]): AlternativeCastOffers {
  const choices = actions.filter((action) => action.type === 'ChooseAlternativeCast');
  const choice = (type: string) => choices.find((action) => {
    const picked = action.data?.choice;
    return !!picked && typeof picked === 'object' && (picked as { type?: unknown }).type === type;
  }) ?? null;
  return {
    normal: choice('Normal'),
    alternative: choice('Alternative'),
    cancel: actions.find((action) => action.type === 'CancelCast') ?? null
  };
}

/**
 * The discriminant of a `CastingVariant`. Unit variants arrive as a string;
 * struct variants arrive externally tagged (`{ GraveyardPermission: {…} }`).
 * An internally tagged `{ type }` is accepted too, so a neighbour writer cannot
 * hide the name. Anything else is unnamed, not guessed.
 */
export function castingVariantName(raw: unknown): string {
  if (typeof raw === 'string' && raw) return raw;
  if (!raw || typeof raw !== 'object') return '';
  const body = raw as Record<string, unknown>;
  if (typeof body.type === 'string' && body.type) return body.type;
  const keys = Object.keys(body);
  return keys.length === 1 && keys[0] ? keys[0] : '';
}
function faceName(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw && typeof raw === 'object' && typeof (raw as { type?: unknown }).type === 'string') {
    return (raw as { type: string }).type;
  }
  return '';
}
export type CastingAuthority = {
  sourceId: ObjectId | null;
  frequency: string;
  slotType: string | null;
  extraMode: string | null;
  extraCost: unknown | null;
  counter: string | null;
};
function castingAuthority(raw: unknown): CastingAuthority | null {
  if (!raw || typeof raw !== 'object') return null;
  const body = raw as Record<string, unknown>;
  const announcement = (body.announcement && typeof body.announcement === 'object'
    ? body.announcement
    : {}) as Record<string, unknown>;
  const permission = (announcement.permission && typeof announcement.permission === 'object'
    ? announcement.permission
    : {}) as Record<string, unknown>;
  const extra = body.extra_cost && typeof body.extra_cost === 'object'
    ? body.extra_cost as Record<string, unknown>
    : null;
  const slot = announcement.slot_type;
  const counter = body.enters_with_counter;
  return {
    sourceId: typeof permission.source === 'number' ? permission.source as ObjectId : null,
    frequency: typeof body.frequency === 'string' ? body.frequency
      : body.frequency && typeof body.frequency === 'object' && typeof (body.frequency as { type?: unknown }).type === 'string'
        ? (body.frequency as { type: string }).type
        : '',
    slotType: typeof slot === 'string' ? slot
      : slot && typeof slot === 'object' && typeof (slot as { type?: unknown }).type === 'string'
        ? (slot as { type: string }).type
        : null,
    extraMode: extra
      ? typeof extra.mode === 'string' ? extra.mode
        : extra.mode && typeof extra.mode === 'object' && typeof (extra.mode as { type?: unknown }).type === 'string'
          ? (extra.mode as { type: string }).type
          : null
      : null,
    extraCost: extra ? extra.cost ?? null : null,
    counter: typeof counter === 'string' ? counter
      : counter && typeof counter === 'object' && typeof (counter as { type?: unknown }).type === 'string'
        ? (counter as { type: string }).type
        : null
  };
}

/**
 * CR 601.2b: `WaitingFor::CastingVariantChoice`. More than one cast permission
 * applies to the same spell from the same zone. The options are the engine's,
 * in its order, and the answer is the index of one of them. A button exists
 * only when `legal.actions` already contains that index: dropping an option
 * here would renumber the rest, and rebuilding a missing index would offer a
 * permission the engine had already refused.
 */
export type CastingVariantOption = {
  index: number;
  variant: string;
  face: string;
  manaCost: unknown | null;
  additionalCost: unknown | null;
  authority: CastingAuthority | null;
};
export type CastingVariantPrompt = {
  player: PlayerId;
  objectId: ObjectId | null;
  cardId: number | null;
  paymentMode: string;
  options: CastingVariantOption[];
};
export function castingVariantPrompt(snapshot: EngineSnapshot | null): CastingVariantPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'CastingVariantChoice') return null;
  const data = waiting.data ?? {};
  const raw = Array.isArray(data.options) ? data.options : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    objectId: typeof data.object_id === 'number' ? (data.object_id as ObjectId) : null,
    cardId: typeof data.card_id === 'number' ? data.card_id : null,
    paymentMode: paymentModeOf(data.payment_mode),
    options: raw.map((entry, index) => {
      const option = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
      return {
        index,
        variant: castingVariantName(option.variant),
        face: faceName(option.face),
        manaCost: option.mana_cost === undefined ? null : option.mana_cost,
        additionalCost: option.additional_cost === undefined || option.additional_cost === null ? null : option.additional_cost,
        authority: castingAuthority(option.authority)
      };
    })
  };
}
export type CastingVariantOffers = {
  byIndex: Map<number, GameAction>;
  cancel: GameAction | null;
};
/** An index that is not a finite number is not an option. */
export function castingVariantOffers(actions: GameAction[]): CastingVariantOffers {
  const byIndex = new Map<number, GameAction>();
  for (const action of actions) {
    if (action.type !== 'ChooseCastingVariant') continue;
    const index = action.data?.index;
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) continue;
    if (!byIndex.has(index)) byIndex.set(index, action);
  }
  return {
    byIndex,
    cancel: actions.find((action) => action.type === 'CancelCast') ?? null
  };
}

/**
 * CR 508.1g + CR 701.43d: as attackers are declared, the active player may pay
 * the optional «exert this creature as it attacks» cost, one creature at a time.
 * `attacker` is the creature being decided and `remaining` is the rest of the
 * queue for this same declaration — the same one-at-a-time loop as `UntapChoice`.
 *
 * CR 701.43d: `permission` binds **one occurrence** of the ability to a source
 * incarnation (object + incarnation, plus the printed/granted occurrence). It is
 * deliberately opaque here: the answer is `ChooseExert { exert }`, a bare boolean,
 * and the engine re-validates the permission it latched in its own state. That is
 * the opposite of a `ResolveAllConsent` epoch, where the envelope carries the
 * identity and therefore has to come from `legal.actions`: nothing the screen
 * showed can pick the wrong occurrence, because the screen never names it.
 */
export type ExertPrompt = {
  player: PlayerId;
  attacker: ObjectId;
  /** CR 508.1g: later exert candidates in this declaration, in the engine's order. */
  remaining: ObjectId[];
  /** True when the engine's opaque permission reference arrived with the prompt. */
  permissionPublished: boolean;
};
export function exertPrompt(snapshot: EngineSnapshot | null): ExertPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'ExertChoice') return null;
  const data = waiting.data ?? {};
  if (typeof data.attacker !== 'number') return null;
  const remaining = Array.isArray(data.remaining)
    ? (data.remaining as unknown[])
        .map((entry) =>
          typeof entry === 'number' ? entry : (entry as { attacker?: unknown } | null)?.attacker
        )
        .filter((id): id is ObjectId => typeof id === 'number')
    : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    attacker: data.attacker as ObjectId,
    remaining,
    permissionPublished: data.permission != null
  };
}
/** CR 701.43d: pay the exert cost for the prompted creature, or decline it. */
export function chooseExertAction(exert: boolean): GameAction {
  return { type: 'ChooseExert', data: { exert } };
}

/**
 * CR 508.1g + CR 702.154a: as a creature with enlist attacks, the active player
 * may tap **one** other untapped, nonattacking creature they control whose power
 * is less than or equal to the attacker's. `eligible` is the engine's legal tap
 * set for this occurrence — it already applied power, tapped and attacking — and
 * `remaining` is the queue of later enlist occurrences in this declaration.
 *
 * CR 702.154a: the answer is `ChooseEnlist { target }` and `null` is a real
 * answer: enlist taps «up to one», so declining is legal and must be offered.
 */
export type EnlistPrompt = {
  player: PlayerId;
  attacker: ObjectId;
  eligible: ObjectId[];
  remaining: ObjectId[];
  /** True when the engine published a lower bound-free set with entries to tap. */
  hasEligible: boolean;
};
export function enlistPrompt(snapshot: EngineSnapshot | null): EnlistPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'EnlistChoice') return null;
  const data = waiting.data ?? {};
  if (typeof data.attacker !== 'number') return null;
  const ids = (value: unknown) =>
    Array.isArray(value) ? (value as unknown[]).filter((id): id is ObjectId => typeof id === 'number') : [];
  const eligible = ids(data.eligible);
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    attacker: data.attacker as ObjectId,
    eligible,
    remaining: ids(data.remaining),
    hasEligible: eligible.length > 0
  };
}
/** CR 702.154a: tap this creature for the attacker, or `null` to decline. */
export function chooseEnlistAction(target: ObjectId | null): GameAction {
  return { type: 'ChooseEnlist', data: { target } };
}

/**
 * CR 701.44d: several permanents explore at the same time, so the player who
 * controls them chooses **the order** — one explorer per step. The engine asks
 * with the ones this player may pick (`choosable`) and the whole queue
 * (`remaining`), which can be longer: when permanents of several players explore
 * together, each player orders their own, so the difference between the two lists
 * is exactly what someone else will decide (CR 101.4).
 *
 * CR 701.44a: each explorer then reveals the top card of its controller's library
 * — a land goes to hand, anything else puts a +1/+1 counter on the creature. That
 * second half is the engine's own resolution, not a choice of this prompt, so the
 * block states it without pretending to ask.
 */
export type ExplorePrompt = {
  player: PlayerId;
  sourceId: ObjectId;
  /** The permanents this player may send to explore now. */
  choosable: ObjectId[];
  /** The whole queue, this player's picks included. */
  remaining: ObjectId[];
};
export function explorePrompt(snapshot: EngineSnapshot | null): ExplorePrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'ExploreChoice') return null;
  const data = waiting.data ?? {};
  const ids = (value: unknown): ObjectId[] =>
    Array.isArray(value) ? (value as unknown[]).filter((id): id is ObjectId => typeof id === 'number') : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : 0,
    choosable: ids(data.choosable),
    remaining: ids(data.remaining)
  };
}
/** CR 701.44d: this permanent explores next; the engine then asks again. */
export function exploreAction(id: ObjectId): GameAction {
  return { type: 'ChooseTarget', data: { target: { Object: id } } };
}

/**
 * CR 101.4 + CR 701.38a–d: a vote. The engine runs it as a **session**: every
 * voter casts its ballots in APNAP order, extra votes resolve at the moment the
 * player would vote once (CR 701.38d), and the tally only resolves when the queue
 * empties. So the prompt is the room, not one ballot: who votes now, what is
 * already tallied, and what is left to vote.
 *
 * Two ballot shapes share this prompt, and they answer differently:
 *
 *   - **Named votes** (`options` / `option_labels`): "votes for profit or
 *     security". The answer is `ChooseOption { choice }` with the lowercase
 *     canonical option; the label is what the screen shows.
 *   - **Object votes** (`candidate_objects`): Council's Judgment's "votes for a
 *     nonland permanent you don't control". The answer is `SubmitVoteCandidate
 *     { candidate_index }` — index-based, because two candidates can share a name.
 *
 * `actor` decides who may answer: `SubjectActs` is the voter itself, while
 * `Delegated(p)` hands the ballot to another seat (friend-or-foe). The block gates
 * on that resolved seat rather than on `player`.
 *
 * CR 701.38: a secret vote (`visibility: Secret`) has its running tallies and
 * ballots scrubbed for viewers until the simultaneous reveal, so the block says it
 * is secret instead of drawing zeros as if nobody had voted.
 */
export type VoteEntry = {
  /** The label the engine publishes for this option or candidate. */
  label: string;
  /** CR 707.10c-style canonical word; `null` for object-pool candidates. */
  option: string | null;
  /** Object-pool candidate; `null` for named votes. */
  candidateId: ObjectId | null;
  /** Ballots recorded for it so far (open votes only). */
  tally: number;
};
export type VotePrompt = {
  /** The voter this step belongs to (the subject, CR 701.38d). */
  player: PlayerId;
  /** Which seat may actually answer: `actor.resolve(player)`. */
  voter: PlayerId;
  /** True when another seat answers for the voter (friend-or-foe). */
  delegated: boolean;
  /** CR 701.38d: ballots this voter still owes before the turn passes. */
  remainingVotes: number;
  controller: PlayerId;
  sourceId: ObjectId;
  /** True for object-pool votes (Council's Judgment), false for named ones. */
  objectPool: boolean;
  visibility: 'open' | 'secret';
  entries: VoteEntry[];
  /** Ballots already cast, in order (open votes only). */
  ballots: { player: PlayerId; choice: number }[];
  /** Who still owes a first vote, in APNAP order, with how many. */
  remainingVoters: { player: PlayerId; votes: number }[];
};
export function votePrompt(snapshot: EngineSnapshot | null): VotePrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'VoteChoice') return null;
  const data = waiting.data ?? {};
  const text = (value: unknown): string => (typeof value === 'string' ? value : '');
  const numbers = (value: unknown): number[] =>
    Array.isArray(value) ? (value as unknown[]).filter((n): n is number => typeof n === 'number') : [];
  const strings = (value: unknown): string[] =>
    Array.isArray(value) ? (value as unknown[]).filter((s): s is string => typeof s === 'string') : [];
  const options = strings(data.options);
  const labels = strings(data.option_labels);
  const candidates = numbers(data.candidate_objects);
  const tallies = numbers(data.tallies);
  const objectPool = candidates.length > 0;
  const entries: VoteEntry[] = objectPool
    ? candidates.map((id, index) => ({
        label: labels[index] ?? '',
        option: null,
        candidateId: id,
        tally: tallies[index] ?? 0
      }))
    : options.map((option, index) => ({
        label: labels[index] ?? option,
        option,
        candidateId: null,
        tally: tallies[index] ?? 0
      }));
  const player = typeof data.player === 'number' ? data.player : snapshot!.viewer;
  const actor = data.actor as { Delegated?: unknown } | string | undefined;
  const delegatedTo = actor && typeof actor === 'object' && typeof actor.Delegated === 'number' ? actor.Delegated : null;
  return {
    player,
    voter: delegatedTo ?? player,
    delegated: delegatedTo !== null && delegatedTo !== player,
    remainingVotes: typeof data.remaining_votes === 'number' ? Math.max(1, data.remaining_votes) : 1,
    controller: typeof data.controller === 'number' ? data.controller : player,
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : 0,
    objectPool,
    visibility: data.visibility === 'Secret' ? 'secret' : 'open',
    entries,
    ballots: Array.isArray(data.ballots)
      ? (data.ballots as unknown[])
          .map((entry) => {
            if (!Array.isArray(entry) || typeof entry[0] !== 'number' || typeof entry[1] !== 'number') return null;
            return { player: entry[0] as PlayerId, choice: entry[1] as number };
          })
          .filter((entry): entry is { player: PlayerId; choice: number } => entry !== null)
      : [],
    remainingVoters: Array.isArray(data.remaining_voters)
      ? (data.remaining_voters as unknown[])
          .map((entry) => {
            if (!Array.isArray(entry) || typeof entry[0] !== 'number') return null;
            return { player: entry[0] as PlayerId, votes: typeof entry[1] === 'number' ? (entry[1] as number) : 1 };
          })
          .filter((entry): entry is { player: PlayerId; votes: number } => entry !== null)
      : []
  };
}
/** CR 701.38a: a named ballot, by the lowercase canonical option. */
export function voteAction(option: string): GameAction {
  return { type: 'ChooseOption', data: { choice: option } };
}
/** CR 701.38b: an object-pool ballot, by index — names cannot disambiguate. */
export function voteCandidateAction(index: number): GameAction {
  return { type: 'SubmitVoteCandidate', data: { candidate_index: index } };
}

/**
 * CR 707.10c + CR 722.3c + CR 702.192a: the copy target walk, which the engine
 * runs **one slot at a time**. One variant serves two operations, and the screen
 * says which one it is:
 *
 *   - `retarget` — a copy that already holds targets; its controller may choose new
 *     ones and may leave any of them unchanged (CR 707.10c).
 *   - `announce` — a freshly cast copy announces its targets (CR 601.2c). Nothing
 *     can be kept; a slot may only be declined when the text says "up to N"
 *     (CR 115.6).
 *
 * Every permission in this prompt is engine-derived at each step: `can_keep` per
 * slot, `can_keep_rest` for the whole walk, `can_decline` for optional slots, and
 * the legal alternatives. The screen renders them and never recomputes a legality
 * rule of its own; `picks` is the decided prefix, so progress is visible without
 * caching a half-answer (the engine re-prompts after every slot).
 *
 * A walk may open with an announcing-opponent election instead of a slot
 * (CR 601.2c + CR 115.1, CR 707.12): then `target_slots` is empty and the
 * question is which opponent announces that target group.
 */
export type CopySlot = {
  current: TargetRef | null;
  /** CR 707.10c: what this position could become, as the engine lists it. */
  alternatives: TargetRef[];
  /** CR 707.10c: keeping the announced target still completes legally. */
  canKeep: boolean;
  /** CR 115.6: declining an optional slot still completes (announcement walk). */
  canDecline: boolean;
};
export type CopyRetargetPrompt = {
  player: PlayerId;
  /** CR 112.2: the copy's controller, when a different seat answers this prompt. */
  controller: PlayerId | null;
  copyId: ObjectId;
  slots: CopySlot[];
  mode: 'retarget' | 'announce';
  /** Position awaiting an answer; `picks.length` when the payload says so. */
  currentSlot: number;
  /** The decided prefix, index-aligned with `slots`. */
  picks: (TargetRef | null)[];
  /** CR 707.10c: keeping every remaining position completes a legal final set. */
  canKeepRest: boolean;
  /** CR 601.2c + CR 115.1: set while no slot is answered. */
  announcer: { candidates: PlayerId[]; choiceIndex: number; choiceCount: number } | null;
};
export function copyRetargetPrompt(snapshot: EngineSnapshot | null): CopyRetargetPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'CopyRetarget') return null;
  const data = waiting.data ?? {};
  /** A target as the wire wrote it, back into the `{Player}` / `{Object}` shape. */
  const copyTargetOf = (value: unknown): TargetRef | null => {
    const parsed = parseTarget(value);
    if (!parsed) return null;
    return parsed.kind === 'player' ? playerTarget(parsed.id) : objectTarget(parsed.id);
  };
  const slots: CopySlot[] = Array.isArray(data.target_slots)
    ? (data.target_slots as unknown[]).map((entry) => {
        const slot = (entry ?? {}) as Record<string, unknown>;
        return {
          current: copyTargetOf(slot.current),
          alternatives: parseTargetList(slot.legal_alternatives),
          canKeep: slot.can_keep === true,
          canDecline: slot.can_decline === true
        };
      })
    : [];
  const rawPicks = Array.isArray(data.picks) ? (data.picks as unknown[]) : [];
  const election = data.announcer_election as Record<string, unknown> | null | undefined;
  const candidateIds = (value: unknown): PlayerId[] =>
    Array.isArray(value) ? (value as unknown[]).filter((id): id is PlayerId => typeof id === 'number') : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    controller: typeof data.controller === 'number' ? data.controller : null,
    copyId: typeof data.copy_id === 'number' ? (data.copy_id as ObjectId) : 0,
    slots,
    mode: data.mode === 'Announce' ? 'announce' : 'retarget',
    currentSlot:
      typeof data.current_slot === 'number' ? Math.max(0, data.current_slot) : rawPicks.length,
    picks: rawPicks.map((pick) => copyTargetOf(pick)),
    canKeepRest: data.can_keep_rest === true,
    announcer: election
      ? {
          candidates: candidateIds(election.candidates),
          choiceIndex: typeof election.choice_index === 'number' ? election.choice_index : 1,
          choiceCount: typeof election.choice_count === 'number' ? election.choice_count : 1
        }
      : null
  };
}
/** One slot's answer: `null` keeps the announced target (CR 707.10c). */
export function chooseCopyTargetAction(target: TargetRef | null): GameAction {
  return { type: 'ChooseTarget', data: { target } };
}
/** CR 707.10c: keep every remaining position, which the engine gates itself. */
export function keepCopyTargetsAction(): GameAction {
  return { type: 'KeepAllCopyTargets' };
}
/** CR 601.2c + CR 115.1: which opponent announces the next target group. */
export function chooseCopyAnnouncerAction(player: PlayerId): GameAction {
  return { type: 'ChooseAnnouncingOpponent', data: { opponent: player } };
}

/**
 * CR 107.1c + CR 608.2d: "remove any number of counters" (Rhys, the Evermore;
 * Tetravus) and "remove up to N counters" (Hex Parasite's announced X).
 *
 * A different question again from moving counters: they leave the source and
 * nothing arrives anywhere. The engine publishes the **budget** — the per-type
 * counts actually on the source — and, when the text caps the removal, `max_total`
 * across every kind, already bounded by what is there. `None` is the uncapped
 * "any number", so the block says "sin tope" instead of inventing one.
 *
 * Its validator refuses a zero count, a repeated type, more of a type than the
 * source has, and a total over the cap; the empty selection is legal, because zero
 * counters is a legal number of counters (CR 107.1c). `counter_type` narrows the
 * pool to one kind when the effect names it, and the engine has already done that
 * filtering: the block never re-filters what arrives.
 */
export type RemoveCountersPrompt = {
  player: PlayerId;
  sourceId: ObjectId;
  /** Set when the effect names the kind it removes (Tetravus: +1/+1 counters). */
  counterType: string | null;
  available: CounterOffer[];
  /** CR 608.2d: the most counters in total; `null` is the uncapped "any number". */
  maxTotal: number | null;
};
export function removeCountersPrompt(snapshot: EngineSnapshot | null): RemoveCountersPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'RemoveCountersChoice') return null;
  const data = waiting.data ?? {};
  // Counters are flat strings on the wire (`P1P1`, `charge`, `vow`); the object
  // shape is tolerated by `counterTypeName` because older payloads wrote it.
  const available: CounterOffer[] = Array.isArray(data.available)
    ? (data.available as unknown[])
        .map((entry) => {
          if (!Array.isArray(entry) || typeof entry[1] !== 'number') return null;
          // An empty name is not a counter name, so it is dropped like junk.
          const type = counterTypeName(entry[0]);
          return type ? { type, count: entry[1] as number } : null;
        })
        .filter((entry): entry is CounterOffer => entry !== null)
    : [];
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : 0,
    counterType: counterTypeName(data.counter_type),
    available,
    maxTotal: typeof data.max_total === 'number' ? Math.max(0, data.max_total) : null
  };
}
export type CounterRemovalSelection = { counterType: string; count: number };
export function removeCountersAction(selections: CounterRemovalSelection[]): GameAction {
  return {
    type: 'ChooseCountersToRemove',
    data: {
      selections: selections.map(({ counterType, count }) => ({ counter_type: counterType, count }))
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
  P1P1: '+1/+1', M1M1: '−1/−1', loyalty: 'lealtad', defense: 'defensa', stun: 'aturdimiento', charge: 'carga', lore: 'relato', time: 'tiempo', shield: 'escudo', finality: 'finalidad',
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

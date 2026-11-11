import type { AttackTarget, EngineSnapshot, GameAction, GameObject, ObjectId, PlayerId, TargetRef } from '#lib/engine/types.ts';

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
 * CR 608.2d: "you may" asks the controller whether to perform the instruction.
 * The engine answers it with a plain accept/decline, and — when the prompt
 * carries a `may_trigger_key` — lets the player stop being asked: for that exact
 * instance, or (only when the engine publishes the capability) for every
 * occurrence printed on the same card.
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
};
export function optionalEffectPrompt(snapshot: EngineSnapshot | null): OptionalEffectPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || waiting.type !== 'OptionalEffectChoice') return null;
  const data = waiting.data ?? {};
  return {
    player: typeof data.player === 'number' ? data.player : snapshot!.viewer,
    sourceId: typeof data.source_id === 'number' ? (data.source_id as ObjectId) : 0,
    subjectId: typeof data.decision_subject_id === 'number' ? (data.decision_subject_id as ObjectId) : undefined,
    description: typeof data.description === 'string' && data.description ? data.description : undefined,
    rememberable: data.may_trigger_key != null,
    sameCardAvailable: data.may_trigger_key != null && data.same_card_may_trigger_choice_available === true
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
const COUNTERS: Record<string, string> = { PlusOnePlusOne: '+1/+1', MinusOneMinusOne: '−1/−1', Loyalty: 'lealtad', Defense: 'defensa', Charge: 'carga', Flying: 'vuelo', Shield: 'escudo', Stun: 'aturdimiento', Finality: 'finalidad' };
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

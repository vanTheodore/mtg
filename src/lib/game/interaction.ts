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
export type DiscardPrompt = { count: number; cards: ObjectId[]; player: PlayerId };
export function discardPrompt(snapshot: EngineSnapshot | null): DiscardPrompt | null {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting || (waiting.type !== 'DiscardToHandSize' && waiting.type !== 'ConniveDiscard')) return null;
  const data = waiting.data ?? {};
  const cards = (data.cards ?? []) as ObjectId[];
  const count = typeof data.count === 'number' ? data.count : 0;
  return { count, cards, player: typeof data.player === 'number' ? data.player : snapshot!.viewer };
}
/** The answer to a discard prompt: exactly the cards the interface collected. */
export function discardSelection(cards: ObjectId[]): GameAction {
  return { type: 'SelectCards', data: { cards } };
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

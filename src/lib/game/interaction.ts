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
  const groups = Object.values(s.legal.by_object).flat();
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
export function combatRole(s: EngineSnapshot | null, id: ObjectId): string | undefined {
  const c = s?.state.combat;
  if (c?.attackers.some((a) => a.object_id === id)) return 'Atacando';
  if (Object.entries(c?.blockers ?? {}).some(([, attackers]) => attackers.includes(id))) return 'Bloqueando';
  return undefined;
}
export function permanentStates(o: GameObject, combat?: string): string[] {
  if (isHiddenObject(o)) return [];
  const states: string[] = [];
  if (combat) states.push(combat);
  if (o.tapped) states.push('Girada');
  if (o.damage_marked) states.push(`${o.damage_marked} daño`);
  if (o.transformed) states.push('Transformada');
  if (o.attachments?.length) states.push(`${o.attachments.length} adjuntos`);
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
export function objectSelectLabel(s: EngineSnapshot | null, id: ObjectId): string | undefined {
  if (!s) return undefined;
  if (targetAction(s, objectTarget(id))) return 'Elegir como objetivo';
  if (manaActions(s, id).length) return 'Producir maná';
  if (attackTargets(s, id).length) return 'Seleccionar atacante';
  if (blockTargets(s, id).length) return 'Seleccionar bloqueadora';
  if (s.state.waiting_for.type === 'DeclareBlockers' && s.state.combat?.attackers.some((a) => a.object_id === id)) return 'Elegir atacante para bloquear';
  return undefined;
}

import type { AttackTarget, EngineSnapshot, GameObject, ObjectId, TargetRef } from '#lib/engine/types.ts';
import { parseTarget } from '#lib/game/interaction.ts';
import type { Point } from './arc.ts';

/**
 * The line layer of the table: what Phase draws between cards.
 *
 * Projection only. Every line starts from a point the DOM actually occupies
 * (`data-card-id` / `data-player-id`) and ends at a target the **engine**
 * published. No legality is evaluated here: if Phase does not offer the target,
 * no line exists. That keeps the overlay an honest drawing of the snapshot
 * instead of a second rules authority written in TypeScript.
 */

/** Measured screen anchors, keyed by the numeric id as a string. */
export interface Anchors {
  objects: Record<string, Point>;
  players: Record<string, Point>;
}

export const EMPTY_ANCHORS: Anchors = { objects: {}, players: {} };

export type LineKind =
  | 'target'        // legal target offered by Phase for the pending choice
  | 'chosen'        // slot already chosen in the current target selection
  | 'stack'         // a stack object's declared target
  | 'attack'        // committed attacker → defender
  | 'attack-draft'  // attacker selected locally, not yet declared
  | 'block'         // committed blocker → attacker
  | 'block-draft';  // block pair selected locally, not yet declared

export interface BoardLine {
  key: string;
  kind: LineKind;
  from: Point;
  to: Point;
  /** Committed attackers that are blocked are drawn dashed (Phase convention). */
  dashed: boolean;
  /** Screen-reader-free tooltip text: the overlay itself is decorative. */
  label: string;
}

const KIND_LABEL: Record<LineKind, string> = {
  target: 'Objetivo posible',
  chosen: 'Objetivo elegido',
  stack: 'Objetivo en la pila',
  attack: 'Atacante',
  'attack-draft': 'Atacante por declarar',
  block: 'Bloqueadora',
  'block-draft': 'Bloqueo por declarar'
};

export interface BoardLinesOptions {
  /** Local attack draft: attacker id → destination (`session.attacks`). */
  attacks?: Record<string, AttackTarget>;
  /** Local block draft: blocker id → attacker id (`session.blocks`). */
  blocks?: Record<string, ObjectId>;
}

function objectPoint(anchors: Anchors, id: ObjectId): Point | undefined {
  return anchors.objects[String(id)];
}

function playerPoint(anchors: Anchors, id: number): Point | undefined {
  return anchors.players[String(id)];
}

function targetPoint(anchors: Anchors, target: unknown): Point | undefined {
  const parsed = parseTarget(target);
  if (!parsed) return undefined;
  return parsed.kind === 'player' ? playerPoint(anchors, parsed.id) : objectPoint(anchors, parsed.id);
}

function targetLabel(snapshot: EngineSnapshot, target: unknown): string {
  const parsed = parseTarget(target);
  if (!parsed) return 'objetivo';
  if (parsed.kind === 'player') return `Jugador ${parsed.id + 1}`;
  return (snapshot.state.objects[String(parsed.id)] as GameObject | undefined)?.name ?? `permanente ${parsed.id}`;
}

function attackTargetPoint(anchors: Anchors, target: AttackTarget): Point | undefined {
  return target.type === 'Player' ? playerPoint(anchors, target.data) : objectPoint(anchors, target.data);
}

function attackTargetLabel(snapshot: EngineSnapshot, target: AttackTarget): string {
  if (target.type === 'Player') return `Jugador ${target.data + 1}`;
  return (snapshot.state.objects[String(target.data)] as GameObject | undefined)?.name ?? target.type;
}

function sameTarget(a: unknown, b: unknown): boolean {
  const x = parseTarget(a);
  const y = parseTarget(b);
  return !!x && !!y && x.kind === y.kind && x.id === y.id;
}

/**
 * The object the player is currently casting/choosing for.
 *
 * Phase sends it in `waiting_for.data.pending_cast`; when the prompt is a
 * trigger or an activated ability there is no pending cast and the top of the
 * stack is the source. `undefined` means the caller should fall back to the
 * acting seat — an arc that starts at the player still tells the truth about
 * *what* is being aimed.
 */
export function targetingSourceId(snapshot: EngineSnapshot | null): ObjectId | undefined {
  const waiting = snapshot?.state.waiting_for;
  if (!waiting) return undefined;
  const pending = waiting.data?.pending_cast?.object_id;
  if (typeof pending === 'number') return pending;
  const stack = snapshot?.state.stack ?? [];
  for (let i = stack.length - 1; i >= 0; i--) {
    const entry = stack[i] as { source_id?: number } | undefined;
    if (typeof entry?.source_id === 'number') return entry.source_id;
  }
  return undefined;
}

/**
 * Arcs from the pending choice's source to every target Phase offers.
 *
 * The legal set comes from `waiting_for.data.selection.current_legal_targets`,
 * which is the same list the accessible picker in `DecisionPanel` renders. If a
 * snapshot predates that field, the `ChooseTarget` legal actions are used — both
 * are engine-authored, never a local guess.
 */
export function targetingLines(
  snapshot: EngineSnapshot | null,
  anchors: Anchors
): BoardLine[] {
  const waiting = snapshot?.state.waiting_for;
  if (!snapshot || !waiting) return [];
  if (waiting.type !== 'TargetSelection' && waiting.type !== 'TriggerTargetSelection') return [];

  const viewer = snapshot.viewer;
  // A snapshot can describe another seat's decision during the hot-seat
  // handoff. Drawing its targets would paint arcs for a player who is not
  // allowed to act, so the prompt must belong to the viewer being shown.
  const asked = waiting.data?.player;
  if (typeof asked === 'number' && asked !== viewer) return [];
  const sourceId = targetingSourceId(snapshot);
  const from = (sourceId !== undefined ? objectPoint(anchors, sourceId) : undefined) ?? playerPoint(anchors, viewer);
  if (!from) return [];

  const selection = waiting.data?.selection;
  const chosen = (selection?.selected_slots ?? []).filter((slot): slot is TargetRef => !!slot);
  const offered: unknown[] = selection?.current_legal_targets?.length
    ? [...selection.current_legal_targets]
    : snapshot.legal.actions
      .filter((action) => action.type === 'ChooseTarget' && action.data?.target)
      .map((action) => action.data!.target);
  const legal = offered.filter((target) => !chosen.some((slot) => sameTarget(slot, target)));

  const lines: BoardLine[] = [];
  chosen.forEach((target, index) => {
    const to = targetPoint(anchors, target);
    if (!to) return;
    lines.push({
      key: `chosen:${index}`,
      kind: 'chosen',
      from,
      to,
      dashed: false,
      label: `${KIND_LABEL.chosen}: ${targetLabel(snapshot, target)}`
    });
  });
  legal.forEach((target, index) => {
    const to = targetPoint(anchors, target);
    if (!to) return;
    lines.push({
      key: `target:${index}`,
      kind: 'target',
      from,
      to,
      dashed: true,
      label: `${KIND_LABEL.target}: ${targetLabel(snapshot, target)}`
    });
  });
  return lines;
}

type StackEntry = { id?: number; source_id?: ObjectId; controller?: number };
type StackTargetDetail = { targets?: { label?: string; target?: unknown }[]; source_name?: string };

/** Arcs from each stack object to the targets it declared (Phase `StackTargetArcs`). */
export function stackLines(snapshot: EngineSnapshot | null, anchors: Anchors): BoardLine[] {
  if (!snapshot) return [];
  const details = (snapshot.derived?.stack_entry_details ?? {}) as Record<string, StackTargetDetail>;
  const lines: BoardLine[] = [];
  (snapshot.state.stack as StackEntry[] | undefined)?.forEach((entry, index) => {
    const id = entry.id ?? index;
    const detail = details[String(id)];
    if (!detail?.targets?.length) return;
    const from = (entry.source_id !== undefined ? objectPoint(anchors, entry.source_id) : undefined)
      ?? playerPoint(anchors, entry.controller ?? snapshot.viewer);
    if (!from) return;
    detail.targets.forEach((slot, slotIndex) => {
      const to = targetPoint(anchors, slot.target);
      if (!to) return;
      lines.push({
        key: `stack:${id}:${slotIndex}`,
        kind: 'stack',
        from,
        to,
        dashed: false,
        label: `${KIND_LABEL.stack}: ${slot.label || targetLabel(snapshot, slot.target)}`
      });
    });
  });
  return lines;
}

/**
 * Combat lines: committed attackers and blocks plus the local drafts.
 *
 * Committed state is read from Phase (`state.combat`): `attackers` for the
 * arrows and `blocker_to_attacker` for the blocks — the same field
 * `combatRole` uses, so a blocker that is labelled in the card is also drawn.
 */
export function combatLines(
  snapshot: EngineSnapshot | null,
  anchors: Anchors,
  options: BoardLinesOptions = {}
): BoardLine[] {
  if (!snapshot) return [];
  const combat = snapshot.state.combat;
  const lines: BoardLine[] = [];
  const committedAttackers = new Set<ObjectId>();

  for (const attacker of combat?.attackers ?? []) {
    committedAttackers.add(attacker.object_id);
    const from = objectPoint(anchors, attacker.object_id);
    const to = attackTargetPoint(anchors, attacker.attack_target);
    if (!from || !to) continue;
    lines.push({
      key: `attack:${attacker.object_id}`,
      kind: 'attack',
      from,
      to,
      dashed: attacker.blocked === true,
      label: `${KIND_LABEL.attack}: ${attackTargetLabel(snapshot, attacker.attack_target)}`
    });
  }

  for (const [attackerKey, target] of Object.entries(options.attacks ?? {})) {
    const attackerId = Number(attackerKey);
    if (committedAttackers.has(attackerId)) continue;
    const from = objectPoint(anchors, attackerId);
    const to = attackTargetPoint(anchors, target);
    if (!from || !to) continue;
    lines.push({
      key: `attack-draft:${attackerId}`,
      kind: 'attack-draft',
      from,
      to,
      dashed: true,
      label: `${KIND_LABEL['attack-draft']}: ${attackTargetLabel(snapshot, target)}`
    });
  }

  for (const [blockerKey, attackerIds] of Object.entries(combat?.blocker_to_attacker ?? {})) {
    const blockerId = Number(blockerKey);
    const from = objectPoint(anchors, blockerId);
    if (!from) continue;
    for (const attackerId of attackerIds ?? []) {
      const to = objectPoint(anchors, attackerId);
      if (!to) continue;
      lines.push({
        key: `block:${blockerId}:${attackerId}`,
        kind: 'block',
        from,
        to,
        dashed: false,
        label: `${KIND_LABEL.block}: ${snapshot.state.objects[String(blockerId)]?.name ?? 'criatura'}`
      });
    }
  }

  for (const [blockerKey, attackerId] of Object.entries(options.blocks ?? {})) {
    const blockerId = Number(blockerKey);
    if (combat?.blocker_to_attacker && Object.prototype.hasOwnProperty.call(combat.blocker_to_attacker, String(blockerId))) continue;
    const from = objectPoint(anchors, blockerId);
    const to = objectPoint(anchors, attackerId);
    if (!from || !to) continue;
    lines.push({
      key: `block-draft:${blockerId}`,
      kind: 'block-draft',
      from,
      to,
      dashed: true,
      label: `${KIND_LABEL['block-draft']}: ${snapshot.state.objects[String(attackerId)]?.name ?? 'atacante'}`
    });
  }

  return lines;
}

/** Every line layer, in draw order: blocks under attacks, targets on top. */
export function boardLines(
  snapshot: EngineSnapshot | null,
  anchors: Anchors,
  options: BoardLinesOptions = {}
): BoardLine[] {
  return [
    ...stackLines(snapshot, anchors),
    ...combatLines(snapshot, anchors, options),
    ...targetingLines(snapshot, anchors)
  ];
}

#!/usr/bin/env bun
/**
 * Client work per interaction, not in idle.
 *
 * Every click in Mesa re-derives presentation from the engine's snapshot: the
 * combat role of each permanent, its badges, whether it can be selected, the
 * legal action behind it, and the log lines of the last event burst. That work
 * runs synchronously inside the click, so it is the part that can be measured
 * without a browser — paint and layout cannot.
 *
 * The snapshots here are shaped exactly like the ones `engine.worker.ts` returns
 * (`style`, `battlefield`, `objects`, `combat` with `blocker_to_attacker`, …)
 * but generated, so the cost can be swept over board sizes. This measures the
 * UI's own functions; it says nothing about the GPU.
 *
 * Usage: bun scripts/measure-interaction.ts [--json]
 */
import {
  combatRole, objectSelectLabel, permanentStates, keywordLabel, blockDeclaration, secondActivation
} from '../src/lib/game/interaction.ts';
import { summarizeEvents } from '../src/lib/game/events.ts';
import type { EngineSnapshot, GameObject } from '../src/lib/engine/types.ts';

const json = process.argv.includes('--json');

interface Built {
  snapshot: EngineSnapshot;
  /** Ids on the battlefield, in board order. */
  board: number[];
  hand: number[];
  events: unknown[];
}

/** A Phase-shaped snapshot with `size` permanents, half of them tapped. */
function build(size: number, seedCombat = false): Built {
  const objects: Record<string, GameObject> = {};
  const battlefield: number[] = [];
  const hand: number[] = [];
  const attackers: { object_id: number; defending_player: number; attack_target: { type: 'Player'; data: number }; blocked: boolean }[] = [];
  const blockerToAttacker: Record<string, number[]> = {};

  for (let index = 0; index < size; index += 1) {
    const id = 100 + index;
    const isLand = index % 3 === 0;
    objects[String(id)] = {
      id, card_id: id, owner: 0, controller: 0, zone: 'Battlefield',
      name: isLand ? `Tierra ${index}` : `Criatura ${index}`,
      tapped: seedCombat && index % 2 === 0,
      power: isLand ? null : 2, toughness: isLand ? null : 2,
      damage_marked: seedCombat && !isLand && index % 5 === 0 ? 1 : 0,
      counters: index % 7 === 0 && !isLand ? { PlusOnePlusOne: 1 } : {},
      keywords: index % 4 === 0 && !isLand ? ['Flying'] : [],
      attachments: index % 11 === 0 && !isLand ? [{ id: 900 + index }] : []
    } as unknown as GameObject;
    battlefield.push(id);
    if (seedCombat && !isLand && index % 4 === 1) {
      attackers.push({ object_id: id, defending_player: 1, attack_target: { type: 'Player', data: 1 }, blocked: true });
      blockerToAttacker[String(id + 1)] = [id];
    }
  }
  for (let index = 0; index < 7; index += 1) {
    const id = 500 + index;
    objects[String(id)] = { id, card_id: id, owner: 0, controller: 0, zone: 'Hand', name: `Carta ${index}` } as unknown as GameObject;
    hand.push(id);
  }

  const byObject: Record<string, unknown[]> = {};
  for (const id of hand) byObject[String(id)] = [{ type: 'PlayLand', data: { object_id: id, card_id: id } }];
  for (const id of battlefield.slice(0, Math.ceil(size / 4))) {
    byObject[String(id)] = [{ type: 'TapLandForMana', data: { selection: { source: { object_id: id } } } }];
  }

  const snapshot = {
    ok: true, viewer: 0, seed: 7, revision: 120, actions_applied: 120, metrics: {},
    state: {
      turn_number: 6, active_player: 0, priority_player: 0, phase: 'DeclareBlockers',
      waiting_for: seedCombat
        ? { type: 'DeclareBlockers', data: { valid_blocker_ids: battlefield.slice(1, 4), valid_block_targets: { [String(battlefield[1])]: attackers.map((a) => a.object_id) } } }
        : { type: 'Priority', data: { player: 0 } },
      players: [], battlefield, stack: [], exile: [], objects,
      combat: { attackers, blocker_assignments: {}, blocker_to_attacker: blockerToAttacker }
    },
    derived: { battlefield_keyword_badges: Object.fromEntries(battlefield.map((id) => [String(id), [{ type: 'Flying' }]])) },
    legal: { actions: [], spell_costs: {}, by_object: byObject }
  } as unknown as EngineSnapshot;

  const events: unknown[] = [];
  for (let index = 0; index < 6; index += 1) {
    events.push({ type: 'DamageDealt', data: { object_id: battlefield[index] ?? 100, amount: 2, is_combat: true, target: { Player: 1 } } });
    events.push({ type: 'LifeChanged', data: { player_id: 1, amount: -2 } });
  }
  if (attackers.length) events.push({ type: 'BlockersDeclared', data: { assignments: attackers.map((a) => [a.object_id + 1, a.object_id]) } });

  return { snapshot, board: battlefield, hand, events };
}

/** One rendered pass over the board, exactly what the components derive. */
function renderPass(input: Built): number {
  const { snapshot, board } = input;
  const badges = (snapshot.derived as { battlefield_keyword_badges?: Record<string, unknown[]> }).battlefield_keyword_badges ?? {};
  const objects = snapshot.state.objects;
  let checksum = 0;
  for (const id of board) {
    const object = objects[String(id)]!;
    checksum += combatRole(snapshot, id)?.length ?? 0;
    checksum += permanentStates(object, combatRole(snapshot, id)).length;
    checksum += objectSelectLabel(snapshot, id)?.length ?? 0;
    for (const keyword of badges[String(id)] ?? []) checksum += keywordLabel(keyword).length;
  }
  return checksum;
}

const time = (fn: () => void, iterations: number) => {
  for (let index = 0; index < 3; index += 1) fn(); // warm-up
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) fn();
  return ((performance.now() - started) / iterations) * 1000; // µs
};

const sizes = [8, 20, 40, 80];
const rows = sizes.map((size) => {
  const plain = build(size);
  const combat = build(size, true);
  const renderPlain = time(() => renderPass(plain), 400);
  const renderCombat = time(() => renderPass(combat), 400);
  let id = 0;
  const log = time(() => {
    summarizeEvents(combat.events, combat.snapshot.state.objects, 120, () => ++id);
  }, 400);
  const declare = time(() => {
    blockDeclaration(Object.fromEntries(combat.board.slice(0, 3).map((attacker, index) => [String(attacker + 1), attacker])));
  }, 400);
  const commit = time(() => {
    secondActivation(plain.snapshot, plain.hand[0]!);
  }, 400);
  return {
    permanents: size,
    render_us: Number(renderPlain.toFixed(1)),
    render_combat_us: Number(renderCombat.toFixed(1)),
    log_us: Number(log.toFixed(1)),
    declare_us: Number(declare.toFixed(2)),
    commit_us: Number(commit.toFixed(2)),
    per_permanent_us: Number((renderCombat / size).toFixed(2))
  };
});

if (json) {
  console.log(JSON.stringify({ generated_at: new Date().toISOString(), rows }, null, 2));
} else {
  console.log('Mesa · trabajo de cliente por interacción (µs, sin navegador)\n');
  console.log('  permanentes   render   render+combate   registro   declarar   confirmar   µs/permanente');
  for (const row of rows) {
    console.log(`  ${String(row.permanents).padStart(10)}   ${String(row.render_us).padStart(6)}   ${String(row.render_combat_us).padStart(14)}   ${String(row.log_us).padStart(8)}   ${String(row.declare_us).padStart(8)}   ${String(row.commit_us).padStart(9)}   ${String(row.per_permanent_us).padStart(13)}`);
  }
  const worst = rows[rows.length - 1]!;
  console.log(`\n  Tablero de ${worst.permanents} permanentes: ${worst.render_combat_us} µs por acción de la UI` +
    ` (${worst.per_permanent_us} µs por permanente).`);
  console.log('  Incluye: rol de combate, badges, seleccionable y log de 13 eventos.');
  console.log('  NO incluye: layout, pintado ni la llamada al motor (necesitan navegador).');
}

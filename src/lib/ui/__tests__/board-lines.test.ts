import { describe, expect, test } from 'bun:test';
import type { EngineSnapshot, GameObject } from '#lib/engine/types.ts';
import { boardLines, combatLines, stackLines, targetingLines, targetingSourceId, type Anchors } from '#lib/ui/board-lines.ts';

const anchors: Anchors = {
  players: { '0': { x: 100, y: 900 }, '1': { x: 100, y: 100 } },
  objects: {
    '100': { x: 400, y: 700 }, // attacker, viewer's creature
    '101': { x: 500, y: 700 }, // second attacker
    '200': { x: 400, y: 300 }, // opponent's creature
    '201': { x: 500, y: 300 }, // opponent's blocker
    '300': { x: 600, y: 500 }  // spell source on the stack
  }
};

function object(id: number, overrides: Partial<GameObject> = {}): GameObject {
  return { id, card_id: id, owner: 0, controller: 0, zone: 'Battlefield', name: `Carta ${id}`, ...overrides };
}

function snapshot(overrides: Partial<EngineSnapshot> = {}): EngineSnapshot {
  const objects: Record<string, GameObject> = {};
  for (const id of [100, 101, 200, 201, 300]) objects[String(id)] = object(id);
  return {
    ok: true,
    viewer: 0,
    seed: 42,
    revision: 1,
    actions_applied: 0,
    state: {
      turn_number: 3,
      active_player: 0,
      priority_player: 0,
      phase: 'PreCombatMain',
      waiting_for: { type: 'Priority' },
      players: [
        { id: 0, life: 20, mana_pool: { total: 0, white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 }, hand: [], library_count: 30, graveyard: [], exile: [], is_eliminated: false, poison_counters: 0, energy: 0, lands_played_this_turn: 0 },
        { id: 1, life: 20, mana_pool: { total: 0, white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 }, hand: [], library_count: 30, graveyard: [], exile: [], is_eliminated: false, poison_counters: 0, energy: 0, lands_played_this_turn: 0 }
      ],
      battlefield: [100, 101, 200, 201],
      stack: [],
      exile: [],
      objects,
      combat: null
    },
    derived: {},
    legal: { actions: [], spell_costs: {}, by_object: {} },
    metrics: {},
    ...overrides
  } as EngineSnapshot;
}

describe('targeting lines', () => {
  const base = snapshot();

  test('draws one arc per legal target from the pending cast', () => {
    const withPrompt = snapshot({
      state: {
        ...base.state,
        waiting_for: {
          type: 'TargetSelection',
          data: {
            pending_cast: { object_id: 300, cost: null },
            selection: { current_slot: 0, current_legal_targets: [{ Player: 1 }, { Object: 200 }] }
          }
        }
      }
    });
    const lines = targetingLines(withPrompt, anchors);
    expect(lines).toHaveLength(2);
    expect(lines.map((line) => line.kind)).toEqual(['target', 'target']);
    expect(lines[0].from).toEqual({ x: 600, y: 500 });
    expect(lines[0].to).toEqual({ x: 100, y: 100 });
    expect(lines[0].dashed).toBe(true);
    expect(lines[1].to).toEqual({ x: 400, y: 300 });
    expect(lines[1].label).toContain('Carta 200');
  });

  test('falls back to the legal ChooseTarget actions when the slot list is absent', () => {
    const withActions = snapshot({
      state: { ...base.state, waiting_for: { type: 'TargetSelection', data: {} } },
      legal: {
        actions: [
          { type: 'ChooseTarget', data: { target: { Player: 1 } } },
          { type: 'ChooseTarget', data: { target: { Object: 200 } } },
          { type: 'PassPriority' }
        ],
        spell_costs: {},
        by_object: {}
      }
    });
    expect(targetingLines(withActions, anchors)).toHaveLength(2);
  });

  test('already chosen slots are drawn as chosen and not offered twice', () => {
    const withChosen = snapshot({
      state: {
        ...base.state,
        waiting_for: {
          type: 'TargetSelection',
          data: {
            pending_cast: { object_id: 300, cost: null },
            selection: {
              current_slot: 1,
              selected_slots: [{ Object: 200 }],
              current_legal_targets: [{ Player: 1 }, { Object: 200 }]
            }
          }
        }
      }
    });
    const lines = targetingLines(withChosen, anchors);
    expect(lines.filter((line) => line.kind === 'chosen')).toHaveLength(1);
    expect(lines.filter((line) => line.kind === 'target')).toHaveLength(1);
    expect(lines.find((line) => line.kind === 'target')?.to).toEqual({ x: 100, y: 100 });
  });

  test('no source anchor falls back to the acting seat instead of vanishing', () => {
    const noSource = snapshot({
      state: {
        ...base.state,
        waiting_for: {
          type: 'TriggerTargetSelection',
          data: { selection: { current_slot: 0, current_legal_targets: [{ Player: 1 }] } }
        }
      }
    });
    const lines = targetingLines(noSource, anchors);
    expect(lines).toHaveLength(1);
    expect(lines[0].from).toEqual({ x: 100, y: 900 });
  });

  test('another seat\'s prompt draws nothing for this viewer', () => {
    const otherSeat = snapshot({
      state: {
        ...base.state,
        waiting_for: {
          type: 'TargetSelection',
          data: { player: 1, selection: { current_slot: 0, current_legal_targets: [{ Object: 100 }] } }
        }
      }
    });
    expect(targetingLines(otherSeat, anchors)).toEqual([]);
  });

  test('no prompt means no lines', () => {
    expect(targetingLines(base, anchors)).toEqual([]);
    expect(targetingLines(null, anchors)).toEqual([]);
  });

  test('targetingSourceId prefers the pending cast and otherwise reads the stack', () => {
    expect(targetingSourceId(snapshot({
      state: { ...base.state, waiting_for: { type: 'TargetSelection', data: { pending_cast: { object_id: 300, cost: null } } } }
    }))).toBe(300);
    expect(targetingSourceId(snapshot({
      state: { ...base.state, stack: [{ id: 9, source_id: 100 }], waiting_for: { type: 'TriggerTargetSelection' } }
    }))).toBe(100);
    expect(targetingSourceId(base)).toBeUndefined();
  });
});

describe('stack lines', () => {
  test('draws each declared target of a stack entry', () => {
    const withStack = snapshot({
      state: {
        ...snapshot().state,
        stack: [{ id: 7, source_id: 300, controller: 0 }]
      },
      derived: {
        stack_entry_details: {
          '7': { source_name: 'Rayo', targets: [{ label: 'Jugador 2', target: { Player: 1 } }, { label: 'Carta 200', target: { Object: 200 } }] }
        }
      }
    });
    const lines = stackLines(withStack, anchors);
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.kind === 'stack')).toBe(true);
    expect(lines[0].from).toEqual({ x: 600, y: 500 });
    expect(lines[0].label).toBe('Objetivo en la pila: Jugador 2');
  });

  test('a hidden target with no anchor is not invented', () => {
    const withStack = snapshot({
      state: { ...snapshot().state, stack: [{ id: 7, source_id: 300 }] },
      derived: { stack_entry_details: { '7': { targets: [{ target: { Object: 999 } }] } } }
    });
    expect(stackLines(withStack, anchors)).toEqual([]);
  });
});

describe('combat lines', () => {
  const inCombat = snapshot({
    state: {
      ...snapshot().state,
      phase: 'DeclareBlockers',
      waiting_for: { type: 'DeclareBlockers' },
      combat: {
        attackers: [
          { object_id: 100, defending_player: 1, attack_target: { type: 'Player', data: 1 }, blocked: true },
          { object_id: 101, defending_player: 1, attack_target: { type: 'Player', data: 1 }, blocked: false }
        ],
        blocker_assignments: { '100': [201] },
        blocker_to_attacker: { '201': [100] }
      }
    }
  });

  test('committed attackers point at their declared target and blocked ones are dashed', () => {
    const lines = combatLines(inCombat, anchors).filter((line) => line.kind === 'attack');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ dashed: true, to: { x: 100, y: 100 } });
    expect(lines[1]).toMatchObject({ dashed: false });
  });

  test('committed blocks are read from blocker_to_attacker, not a missing field', () => {
    const blocks = combatLines(inCombat, anchors).filter((line) => line.kind === 'block');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].from).toEqual({ x: 500, y: 300 });
    expect(blocks[0].to).toEqual({ x: 400, y: 700 });
  });

  test('local drafts are drawn separately and never duplicate a committed line', () => {
    const lines = combatLines(inCombat, anchors, {
      attacks: { '100': { type: 'Player', data: 1 }, '101': { type: 'Player', data: 1 } },
      blocks: { '201': 100 }
    });
    expect(lines.filter((line) => line.kind === 'attack-draft')).toEqual([]);
    expect(lines.filter((line) => line.kind === 'block-draft')).toEqual([]);
    expect(lines.filter((line) => line.kind === 'attack')).toHaveLength(2);
  });

  test('draft-only combat produces dashed preview arcs', () => {
    const lines = combatLines(snapshot(), anchors, {
      attacks: { '100': { type: 'Player', data: 1 } },
      blocks: { '200': 100 }
    });
    expect(lines.map((line) => line.kind).sort()).toEqual(['attack-draft', 'block-draft']);
    expect(lines.every((line) => line.dashed)).toBe(true);
  });

  test('a planeswalker target is anchored on the permanent, not the player', () => {
    const walker = snapshot({
      state: {
        ...snapshot().state,
        combat: {
          attackers: [{ object_id: 100, defending_player: 1, attack_target: { type: 'Planeswalker', data: 200 }, blocked: false }]
        }
      }
    });
    const [line] = combatLines(walker, anchors).filter((entry) => entry.kind === 'attack');
    expect(line.to).toEqual({ x: 400, y: 300 });
  });

  test('missing anchors drop the line instead of drawing at zero', () => {
    expect(combatLines(inCombat, { objects: {}, players: {} })).toEqual([]);
  });
});

describe('board lines', () => {
  test('layers combine in draw order', () => {
    const combined = snapshot({
      state: {
        ...snapshot().state,
        stack: [{ id: 7, source_id: 300 }],
        waiting_for: { type: 'TargetSelection', data: { selection: { current_slot: 0, current_legal_targets: [{ Player: 1 }] } } },
        combat: { attackers: [{ object_id: 100, defending_player: 1, attack_target: { type: 'Player', data: 1 }, blocked: false }] }
      },
      derived: { stack_entry_details: { '7': { targets: [{ target: { Object: 200 } }] } } }
    });
    const kinds = boardLines(combined, anchors).map((line) => line.kind);
    expect(kinds.indexOf('stack')).toBeLessThan(kinds.indexOf('attack'));
    expect(kinds.indexOf('attack')).toBeLessThan(kinds.indexOf('target'));
  });

  test('an empty table draws nothing', () => {
    expect(boardLines(null, anchors)).toEqual([]);
  });
});

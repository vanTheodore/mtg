import { describe, expect, test } from 'bun:test';
import type { EngineSnapshot, GameAction, GameObject } from '#lib/engine/types.ts';
import {
  SPECIALIST_DECISIONS, cardConsumesSource, projectDecision, stableKey
} from '#lib/game/decisionProjection.ts';

/**
 * Estados sintéticos de la capa de presentación. No son reglas de Magic: son
 * DTO con la forma que publica el puente WASM, suficientes para comprobar que
 * la proyección clasifica y conserva lo que Phase envía. Los estados de motor
 * real viven en `static/e2e-scenarios` (GameScenario) y se ejercen en Chromium.
 */
function snapshot(patch: (s: EngineSnapshot) => void = () => {}): EngineSnapshot {
  const value: EngineSnapshot = {
    ok: true, viewer: 0, seed: 42, revision: 1, actions_applied: 0,
    state: {
      turn_number: 2, active_player: 0, priority_player: 0, phase: 'PreCombatMain',
      waiting_for: { type: 'Priority', data: { player: 0 } },
      players: [], battlefield: [], stack: [], exile: [], objects: {}, combat: null
    },
    derived: {},
    legal: { actions: [{ type: 'PassPriority' }], spell_costs: {}, by_object: {} },
    metrics: {}
  };
  patch(value);
  return value;
}

const actionsOf = (types: string[]): GameAction[] => types.map((type) => ({ type }));

describe('UX-DECISION · proyección de decisiones', () => {
  test('prioridad con pila vacía: una acción principal, sin prometer cambio de fase', () => {
    const projection = projectDecision({ snapshot: snapshot() })!;
    expect(projection.primary?.label).toBe('Pasar');
    expect(projection.primary?.action.type).toBe('PassPriority');
    expect(projection.context.intent).toBe('Jugar');
    expect(projection.context.consequence).toContain('no garantiza un cambio de fase');
    expect(projection.context.viewerHasPriority).toBe(true);
    expect(projection.integrity.ok).toBe(true);
  });

  test('prioridad con hechizos pendientes: pasar permite respuestas y condiciona la resolución', () => {
    const s = snapshot((v) => {
      v.state.stack = [{ name: 'Rayo' }];
      v.legal.actions = [{ type: 'PassPriority' }, { type: 'CastSpell', data: { object_id: 7 } }];
    });
    const projection = projectDecision({ snapshot: s })!;
    expect(projection.primary?.label).toBe('Pasar · permitir respuestas');
    expect(projection.context.stackCount).toBe(1);
    expect(projection.context.consequence).toContain('sólo se resolverá cuando todos');
    expect(projection.tiers.strategic.map((a) => a.action.type)).toContain('CastSpell');
  });

  test('respuesta durante el turno rival: el contexto nombra al jugador activo', () => {
    const s = snapshot((v) => {
      v.state.active_player = 0;
      v.state.priority_player = 1;
      v.viewer = 1;
      v.state.waiting_for = { type: 'Priority', data: { player: 1 } };
    });
    const projection = projectDecision({ snapshot: s })!;
    expect(projection.context.viewerHasPriority).toBe(true);
    expect(projection.context.intent).toBe('Responder');
    expect(projection.context.consequence).toContain('turno del Jugador 1');
    expect(projection.primary?.label).toBe('Pasar');
  });

  test('integridad: ninguna acción legal global queda sin superficie', () => {
    const s = snapshot((v) => {
      v.legal.actions = actionsOf([
        'PassPriority', 'CancelCast', 'SetPriorityPassingMode', 'ChooseOption',
        'DeclareAttackers', 'TapLandForMana', 'ChooseManaColor', 'UntapLandForMana',
        'MulliganDecision', 'ChooseTarget', 'Foretell', 'CompanionToHand'
      ]);
      v.legal.by_object = { '7': [{ type: 'CastSpell' }, { type: 'ActivateAbility' }] };
    });
    const projection = projectDecision({ snapshot: s })!;
    expect(projection.integrity.ok).toBe(true);
    expect(projection.integrity.unclassified).toEqual([]);
    expect(projection.integrity.total).toBe(12);
    expect(projection.integrity.byObject).toBe(2);
    const all = [
      ...(projection.primary ? [projection.primary] : []),
      ...projection.tiers.strategic, ...projection.tiers.secondary,
      ...projection.tiers.advanced, ...projection.tiers.cancel
    ];
    for (const type of ['CancelCast', 'SetPriorityPassingMode', 'ChooseOption', 'DeclareAttackers', 'TapLandForMana', 'Foretell', 'CompanionToHand']) {
      expect(all.some((a) => a.action.type === type)).toBe(true);
    }
    expect(projection.tiers.cancel[0].action.type).toBe('CancelCast');
    expect(projection.tiers.advanced.some((a) => a.action.type === 'SetPriorityPassingMode')).toBe(true);
  });

  test('varias elecciones estratégicas no se convierten en una selección automática', () => {
    const s = snapshot((v) => {
      v.state.objects = { '7': { id: 7, name: 'Rayo' } as GameObject, '8': { id: 8, name: 'Montaña' } as GameObject };
      v.legal.actions = [
        { type: 'PassPriority' },
        { type: 'CastSpell', data: { object_id: 7 } },
        { type: 'CastSpell', data: { object_id: 8, payment_mode: { type: 'Manual' } } },
        { type: 'ChooseOption', data: { index: 0 } },
        { type: 'ChooseOption', data: { index: 1 } }
      ];
    });
    const projection = projectDecision({ snapshot: s })!;
    expect(projection.primary?.action.type).toBe('PassPriority');
    expect(projection.tiers.strategic.filter((a) => a.action.type === 'CastSpell')).toHaveLength(2);
    expect(projection.tiers.strategic.filter((a) => a.action.type === 'ChooseOption')).toHaveLength(2);
    // UX-DECISION 1.1: sin carta elegida no se deriva ningún comando de pago
    // del primer CastSpell publicado.
    expect(projection.tiers.secondary.some((a) => a.startsCast)).toBe(false);
    expect(projection.tiers.advanced.some((a) => a.startsCast)).toBe(false);
  });

  test('maná: el pago manual es una preferencia derivada, no una acción dominante', () => {
    const s = snapshot((v) => {
      v.state.waiting_for = { type: 'ManaPayment', data: { player: 0 } };
      v.legal.actions = [{ type: 'PassPriority' }, { type: 'TapLandForMana', data: { object_id: 3 } }];
    });
    const projection = projectDecision({ snapshot: s })!;
    expect(projection.primary?.label).toBe('Confirmar pago');
    expect(projection.context.intent).toBe('Pagar');
    const manual = projection.tiers.secondary.find((a) => a.origin === 'preference');
    expect(manual).toBeUndefined(); // no hay CastSpell legal en esta ventana
    expect(projection.integrity.ok).toBe(true);
  });

  test('maná sacrificial: se ofrece el modo del DTO sin simular previsualización', () => {
    const s = snapshot((v) => {
      v.state.objects = { '7': { id: 7, name: 'Rayo' } as GameObject };
      v.legal.actions = [{ type: 'PassPriority' }, { type: 'CastSpell', data: { object_id: 7 } }];
    });
    const projection = projectDecision({ snapshot: s, selectedId: 7 })!;
    const avoid = projection.tiers.advanced.find((a) => a.startsCast);
    expect(avoid).toBeDefined();
    expect(avoid!.label).toContain('Lanzar Rayo');
    expect(avoid!.label).toContain('evitando fuentes sacrificiales');
    expect(avoid!.startsCast).toBe(true);
    expect(avoid!.boundObjectId).toBe(7);
    expect((avoid!.action.data?.payment_mode as { type?: string })?.type).toBe('AutoExceptSacrificialMana');
    expect(avoid!.hint).toContain('no las previsualiza');
    // La acción original del motor no se muta: la proyección es pura.
    expect(s.legal.actions[1].data?.payment_mode).toBeUndefined();
    expect(projection.integrity.ok).toBe(true);
  });

  test('UX-DECISION 1.1 · pago vinculado a la segunda carta lanzable, no a la primera', () => {
    const first = { type: 'CastSpell', data: { object_id: 7, card_id: 7, targets: [], payment_mode: { type: 'Auto' } } };
    const second = { type: 'CastSpell', data: { object_id: 8, card_id: 8, targets: [{ Player: 1 }], payment_mode: { type: 'Auto' } } };
    const s = snapshot((v) => {
      v.state.objects = { '7': { id: 7, name: 'Primera' } as GameObject, '8': { id: 8, name: 'Segunda' } as GameObject };
      v.legal.actions = [{ type: 'PassPriority' }, first, second];
    });
    const projection = projectDecision({ snapshot: s, selectedId: 8 })!;
    const manual = projection.tiers.secondary.find((a) => a.startsCast)!;
    expect(manual.boundObjectId).toBe(8);
    expect(manual.boundCastKey).toBeDefined();
    expect(manual.label).toContain('Segunda');
    // Payload exacto que `session.dispatch` entrega a `EngineClient.action`
    // (éste lo clona con JSON antes de postMessage): sólo cambia payment_mode.
    expect(JSON.parse(JSON.stringify(manual.action))).toEqual({
      type: 'CastSpell',
      data: { object_id: 8, card_id: 8, targets: [{ Player: 1 }], payment_mode: { type: 'Manual' } }
    });
    expect(JSON.parse(JSON.stringify(first))).toEqual({ type: 'CastSpell', data: { object_id: 7, card_id: 7, targets: [], payment_mode: { type: 'Auto' } } });
    // Y sin carta elegida no se deriva ningún comando de pago.
    const unbound = projectDecision({ snapshot: s })!;
    expect(unbound.tiers.secondary.some((a) => a.startsCast)).toBe(false);
    expect(unbound.tiers.advanced.some((a) => a.startsCast)).toBe(false);
  });

  test('UX-DECISION 1.1 · dos alternativas de una carta exigen la alternativa explícita', () => {
    const base = { type: 'CastSpell', data: { object_id: 7, card_id: 7, targets: [], payment_mode: { type: 'Auto' } } };
    const adventure = { type: 'CastSpell', data: { object_id: 7, card_id: 7, face: 'Adventure', targets: [], payment_mode: { type: 'Auto' } } };
    const s = snapshot((v) => {
      v.state.objects = { '7': { id: 7, name: 'Doble cara' } as GameObject };
      v.legal.actions = [{ type: 'PassPriority' }, base, adventure];
    });
    // La carta elegida no identifica la alternativa: no se adivina la primera.
    const ambiguous = projectDecision({ snapshot: s, selectedId: 7 })!;
    expect(ambiguous.tiers.secondary.some((a) => a.startsCast)).toBe(false);
    expect(ambiguous.tiers.advanced.some((a) => a.startsCast)).toBe(false);
    // Con la alternativa elegida, el payload conserva su `face`.
    const chosen = projectDecision({ snapshot: s, selectedId: 7, selectedCastKey: 'CastSpell:{"card_id":7,"face":"Adventure","object_id":7,"payment_mode":{"type":"Auto"},"targets":[]}' })!;
    const manual = chosen.tiers.secondary.find((a) => a.startsCast)!;
    expect(JSON.parse(JSON.stringify(manual.action))).toEqual({
      type: 'CastSpell',
      data: { object_id: 7, card_id: 7, face: 'Adventure', targets: [], payment_mode: { type: 'Manual' } }
    });
  });

  test('UX-DECISION 1.1 · una acción que consume su carta no se presenta como confirmación inexistente', () => {
    const s = snapshot((v) => {
      v.state.objects = { '5': { id: 5, name: 'Ciclante', abilities: [{ consumes_source: true }] } as unknown as GameObject };
      v.legal.actions = [{ type: 'PassPriority' }, { type: 'ActivateAbility', data: { source_id: 5, ability_index: 0 } }];
    });
    const projection = projectDecision({ snapshot: s })!;
    const cycling = projection.tiers.secondary.find((a) => a.confirmation === 'card-consuming')!;
    // El contrato es la pulsación explícita de su propio botón: no hay un
    // segundo paso de confirmación y la etiqueta no debe prometerlo.
    expect(cycling.label).not.toContain('confirmación');
    expect(cycling.hint).toContain('inspeccionar nunca lo ejecuta');
    expect(projection.primary?.action.type).toBe('PassPriority');
  });

  test('objetivos: progreso y etiqueta de ranura salen del DTO de Phase', () => {
    const s = snapshot((v) => {
      v.state.waiting_for = {
        type: 'TargetSelection',
        data: {
          player: 0, target_slots: [{}, {}, {}], mode_labels: ['Criatura', 'Jugador', null],
          selection: { current_slot: 1, current_legal_targets: [{ Player: 1 }], selected_slots: [{ Player: 0 }] }
        }
      };
      v.legal.actions = [{ type: 'ChooseTarget', data: { target: { Player: 1 } } }];
    });
    const projection = projectDecision({ snapshot: s })!;
    expect(projection.context.targetProgress).toEqual({ current: 2, total: 3, label: 'Jugador' });
    expect(projection.context.needed.some((line) => line.includes('Objetivo 2 de 3'))).toBe(true);
    expect(projection.context.consequence).toContain('lista accesible');
    expect(projection.integrity.ok).toBe(true);
  });

  test('combate: confirma el borrador y conserva las declaraciones del motor', () => {
    const attackers = snapshot((v) => {
      v.state.waiting_for = { type: 'DeclareAttackers', data: { player: 0, attacker_constraints: { '9': {} } } };
      v.legal.actions = [{ type: 'DeclareAttackers', data: { attacks: [[9, { type: 'Player', data: 1 }]] } }];
    });
    const attackProjection = projectDecision({
      snapshot: attackers, attackDraft: { '9': { type: 'Player', data: 1 } }
    })!;
    expect(attackProjection.primary?.label).toBe('Confirmar ataque (1)');
    expect(attackProjection.primary?.origin).toBe('draft');
    expect(attackProjection.context.needed.some((line) => line.includes('obligaciones de ataque'))).toBe(true);
    expect(attackProjection.tiers.strategic.some((a) => a.action.type === 'DeclareAttackers')).toBe(true);

    const blockers = snapshot((v) => {
      v.state.waiting_for = { type: 'DeclareBlockers', data: { player: 0, block_requirements: { '9': { count: 2 } } } };
      v.legal.actions = [{ type: 'DeclareBlockers', data: { assignments: [] } }];
    });
    expect(projectDecision({ snapshot: blockers })!.primary?.label).toBe('No bloquear');
    expect(projectDecision({ snapshot: blockers, blockDraft: { '11': 9 } })!.primary?.label).toBe('Confirmar bloqueos (1)');
  });

  test('KeepExactPermanentsChoice: el especialista conserva exacta y «hasta N»', () => {
    for (const minimum of [null, 0, 2]) {
      const s = snapshot((v) => {
        v.state.waiting_for = {
          type: 'KeepExactPermanentsChoice',
          data: { player: 0, required_count: 3, minimum_count: minimum, eligible: [1, 2, 3, 4] }
        };
        v.legal.actions = [{ type: 'SelectCards', data: { cards: [1, 2, 3] } }];
      });
      const projection = projectDecision({ snapshot: s, specialistActive: true })!;
      expect(projection.primary).toBeNull();
      expect(projection.specialistActive).toBe(true);
      expect(projection.context.obligatory).toBe(true);
      expect(projection.integrity.ok).toBe(true);
    }
  });

  test('cycling y channel: consumes_source impide el auto-despacho por inspección', () => {
    const s = snapshot((v) => {
      v.state.objects = {
        '5': { id: 5, name: 'Ciclante', abilities: [{ consumes_source: true }, { consumes_source: false }] } as unknown as GameObject
      };
      v.legal.actions = [
        { type: 'PassPriority' },
        { type: 'ActivateAbility', data: { source_id: 5, ability_index: 0 } },
        { type: 'ActivateAbility', data: { source_id: 5, ability_index: 1 } }
      ];
    });
    expect(cardConsumesSource({ type: 'ActivateAbility', data: { source_id: 5, ability_index: 0 } }, s.state.objects)).toBe(true);
    expect(cardConsumesSource({ type: 'ActivateAbility', data: { source_id: 5, ability_index: 1 } }, s.state.objects)).toBe(false);
    const projection = projectDecision({ snapshot: s })!;
    const cycling = projection.tiers.secondary.find((a) => stableKey(a.action).includes('ability_index'));
    expect(cycling?.confirmation).toBe('card-consuming');
    expect(projection.primary?.action.type).toBe('PassPriority');
    expect(projection.integrity.ok).toBe(true);
  });

  test('sugerencias del motor: se leen de derived, nunca se calculan aquí', () => {
    const s = snapshot((v) => {
      v.derived = {
        combat_damage_suggestion: { assignments: [] },
        mana_ability_payment: { options: [] },
        named_choice_suggestions: ['Sí', 'No']
      };
    });
    const projection = projectDecision({ snapshot: s })!;
    expect(projection.context.engineSuggestions).toEqual({ combatDamage: true, manaPayment: true, namedChoices: 2 });
  });

  test('pureza: mutar el snapshot de entrada no altera la proyección', () => {
    const s = snapshot((v) => { v.legal.actions = [{ type: 'PassPriority' }, { type: 'ChooseOption', data: { index: 0 } }]; });
    const first = projectDecision({ snapshot: s })!;
    const copy = JSON.parse(JSON.stringify(first));
    s.legal.actions[1] = { type: 'ChooseOption', data: { index: 99 } };
    s.state.phase = 'Cleanup';
    const second = projectDecision({ snapshot: snapshot((v) => { v.legal.actions = [{ type: 'PassPriority' }, { type: 'ChooseOption', data: { index: 0 } }]; }) })!;
    expect(JSON.parse(JSON.stringify(second))).toEqual(copy);
    expect(first.context.phase).toBe('PreCombatMain');
    expect(first.tiers.strategic[0].action.data?.index).toBe(0);
  });

  test('cobertura de WaitingFor: el panel sigue representando todos los tipos especializados', async () => {
    const source = await Bun.file(new URL('../../components/DecisionPanel.svelte', import.meta.url)).text();
    const match = source.match(/const REPRESENTED = new Set\(\[([^\]]+)\]\)/);
    expect(match).not.toBeNull();
    const declared = new Set([...match![1].matchAll(/'([^']+)'/g)].map((m) => m[1]));
    for (const kind of SPECIALIST_DECISIONS) expect(declared.has(kind)).toBe(true);
    expect(declared.size).toBeGreaterThanOrEqual(SPECIALIST_DECISIONS.size);
  });

  test('ningún tipo especializado promueve una acción principal genérica cuando el especialista está activo', () => {
    for (const kind of SPECIALIST_DECISIONS) {
      const s = snapshot((v) => {
        v.state.waiting_for = { type: kind, data: { player: 0 } };
        v.legal.actions = [{ type: 'PassPriority' }, { type: 'ChooseOption', data: { index: 0 } }];
      });
      const projection = projectDecision({ snapshot: s, specialistActive: true })!;
      expect(projection.primary, kind).toBeNull();
      expect(projection.integrity.ok, kind).toBe(true);
    }
  });
});

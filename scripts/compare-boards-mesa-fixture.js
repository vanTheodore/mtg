/** Browser-side Mesa fixture: installs a snapshot into the dev-served
 *  `session` singleton so `/` renders its real board with no engine behind it.
 *  Injected by `scripts/compare-boards-shots.ts` through `page.addScriptTag`,
 *  which is why it uses a dynamic import of the module URL Vite already serves.
 *
 *  Every value below is typed in TypeScript against `#lib/engine/types.ts` at
 *  the call site; nothing is produced by the components. */
(async () => {
  const { session } = await import('/src/lib/game/session.svelte.ts');

  const VIEWER = 0;
  const objects = {};
  let next = 1;
  const put = (object) => {
    objects[String(object.id)] = object;
    return object.id;
  };
  const land = (owner, name, tapped = false) =>
    put({
      id: next++, card_id: next, owner, controller: owner, zone: 'Battlefield', name,
      tapped, card_types: { supertypes: ['Basic'], core_types: ['Land'], subtypes: [name] },
      mana_cost: null, oracle_text: null, display_visible_to_viewer: true
    });
  const creature = (owner, name, power, toughness) =>
    put({
      id: next++, card_id: next, owner, controller: owner, zone: 'Battlefield', name,
      power, toughness,
      card_types: { supertypes: [], core_types: ['Creature'], subtypes: [] },
      mana_cost: '{1}{G}', oracle_text: null, display_visible_to_viewer: true
    });
  const inHand = (owner, name, cost) =>
    put({
      id: next++, card_id: next, owner, controller: owner, zone: 'Hand', name,
      card_types: { supertypes: [], core_types: ['Creature'], subtypes: [] },
      mana_cost: cost, oracle_text: null, display_visible_to_viewer: true,
      power: 2, toughness: 2,
      printed_ref: { oracle_id: `oracle-${name.toLowerCase().replace(/\W+/g, '-')}`, face_name: name }
    });

  const myField = [land(0, 'Plains', true), land(0, 'Plains'), land(0, 'Forest'),
                   creature(0, 'Savannah Lions', 2, 1), creature(0, 'Grizzly Bears', 2, 2)];
  const theirField = [land(1, 'Swamp'), land(1, 'Swamp'), land(1, 'Swamp', true),
                      creature(1, 'Walking Corpse', 2, 2), creature(1, 'Sengir Vampire', 4, 4)];
  const hand = [inHand(0, 'Savannah Lions', '{W}'), inHand(0, 'Serra Angel', '{3}{W}{W}'),
                inHand(0, 'Giant Growth', '{G}'), inHand(0, 'Plains', null), inHand(0, 'Plains', null),
                inHand(0, 'Forest', null), inHand(0, 'Grizzly Bears', '{1}{G}')];
  const graveyard = [put({ id: 900, card_id: 900, owner: 0, controller: 0, zone: 'Graveyard',
    name: 'Lightning Bolt', card_types: { core_types: ['Instant'] }, display_visible_to_viewer: true })];

  const player = (id, handIds, graveIds) => ({
    id, life: 20, mana_pool: { total: 0, colors: [] }, hand: handIds, library_count: 33,
    graveyard: graveIds, exile: [], is_eliminated: false, poison_counters: 0, energy: 0,
    lands_played_this_turn: 0
  });

  session.snapshot = {
    ok: true,
    viewer: VIEWER,
    seed: 42,
    revision: 8,
    actions_applied: 8,
    outcome: null,
    state: {
      turn_number: 1,
      active_player: 0,
      priority_player: 0,
      phase: 'PreCombatMain',
      waiting_for: {
        type: 'Priority',
        data: {
          player: 0,
          // The engine recommends a pass exactly when there is nothing to do;
          // an empty action list is the engine's own answer, so auto-pass is
          // switched off below rather than faked.
          actions: [{ type: 'PassPriority' }]
        }
      },
      players: [player(0, hand, graveyard), player(1, [], [])],
      battlefield: [...myField, ...theirField],
      stack: [],
      exile: [],
      objects,
      combat: null
    },
    derived: { stack_entry_details: {}, blocker_assignment_pairs: [] },
    legal: {
      actions: [{ type: 'PassPriority' }],
      spell_costs: {},
      by_object: {}
    },
    auto_pass_recommended: false,
    metrics: {}
  };
  session.modeLabel = 'Fixture de capturas';
  session.status = 'ready';
  // Auto-pass stays ON, as it ships, so the first-run coach tip is part of the
  // picture. Nothing can dispatch from here: the snapshot reports
  // `auto_pass_recommended: false`, which is the only thing `autoPassPending`
  // reads besides the preference, and there is no engine behind the fixture.
  session.autoPass = true;
  window.__mesaFixtureInstalled = true;
})();

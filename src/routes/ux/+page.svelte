<script lang="ts">
  /**
   * Laboratorio de interfaz — a deterministic fixture for the Phase UX layers.
   *
   * This route does **not** run rules: it installs a hand-written snapshot so
   * the target/combat arcs, the zone piles and the seat header can be reviewed
   * without the WASM engine. The real game is `/`, and the fidelity tests still
   * run against Phase there. The same convention as `/stress`.
   */
  import { onMount } from 'svelte';
  import ArenaSurface from '#lib/components/ArenaSurface.svelte';
  import Battlefield from '#lib/components/Battlefield.svelte';
  import Hand from '#lib/components/Hand.svelte';
  import PlayerPanel from '#lib/components/PlayerPanel.svelte';
  import StackPanel from '#lib/components/StackPanel.svelte';
  import StatusDock from '#lib/components/StatusDock.svelte';
  import PhaseStopBar from '#lib/components/PhaseStopBar.svelte';
  import MobilePhaseChip from '#lib/components/MobilePhaseChip.svelte';
  import CoachTip from '#lib/components/CoachTip.svelte';
  import HistoryPanel from '#lib/components/HistoryPanel.svelte';
  import BoardOverlay from '#lib/components/BoardOverlay.svelte';
  import Settings from '#lib/components/Settings.svelte';
  import CardActionMenu from '#lib/components/CardActionMenu.svelte';
  import DamageAssignment from '#lib/components/DamageAssignment.svelte';
  import { session } from '#lib/game/session.svelte.ts';
  import { attackTargets } from '#lib/game/interaction.ts';
  import AttackTargetPicker from '#lib/components/AttackTargetPicker.svelte';
  import DiscardPrompt from '#lib/components/DiscardPrompt.svelte';
  import type { EngineSnapshot, GameObject, PlayerView } from '#lib/engine/types.ts';

  type Scene = 'targets' | 'combat' | 'idle' | 'damage' | 'attackers' | 'cleanup' | 'discard' | 'discardUpTo';
  const SCENES: { value: Scene; label: string }[] = [
    { value: 'targets', label: 'Objetivos y pila' },
    { value: 'combat', label: 'Combate declarado' },
    { value: 'attackers', label: 'Declarar atacantes' },
    { value: 'damage', label: 'Asignación de daño' },
    { value: 'cleanup', label: 'Limpieza: descartar' },
    { value: 'discard', label: 'Descartar dos cartas' },
    { value: 'discardUpTo', label: 'Descartar hasta dos' },
    { value: 'idle', label: 'Mesa sin líneas' }
  ];
  const isScene = (value: string | null): value is Scene => SCENES.some((entry) => entry.value === value);
  const SCENE_SUMMARY: Record<Scene, string> = {
    targets: 'TargetSelection · pila con un hechizo',
    combat: 'DeclareBlockers · un bloqueo asignado',
    attackers: 'DeclareAttackers · un atacante con dos destinos',
    cleanup: 'DiscardToHandSize · limpieza de fin de turno',
    discard: 'DiscardChoice · descartar exactamente dos',
    discardUpTo: 'DiscardChoice · descartar hasta dos',
    damage: 'AssignCombatDamage · un bloqueador',
    idle: 'Priority · sin líneas'
  };
  let scene = $state<Scene>('targets');

  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initial = params.get('scene');
  if (isScene(initial)) scene = initial;
  onMount(() => {
    const fromUrl = new URLSearchParams(location.search).get('scene');
    if (isScene(fromUrl)) scene = fromUrl;
  });

  /** Where the card menu opened, in viewport coordinates (fixture parity with Board). */
  let menuAnchor = $state<DOMRect | null>(null);

  /** Same rule as `Board.svelte`: selecting an attacker with more than one legal
   *  defender opens the anchored picker; a single defender assigns directly. */
  $effect(() => {
    const id = session.selected;
    if (id === null || session.attackPicker !== null || session.cardMenu !== null) return;
    if (session.snapshot?.state.waiting_for.type !== 'DeclareAttackers') return;
    if (attackTargets(session.snapshot, id).length < 2) return;
    const card = document.querySelector<HTMLElement>(`[data-card-id="${id}"]`);
    if (card) session.openAttackPicker(id, card.getBoundingClientRect());
  });

  const MANA = { total: 0, white: 0, blue: 0, black: 0, red: 0, green: 0, colorless: 0 };

  function permanent(id: number, owner: number, name: string, types: string[], extra: Partial<GameObject> = {}): GameObject {
    return {
      id, card_id: id, owner, controller: owner, zone: 'Battlefield', name,
      card_types: { core_types: types }, ...extra
    };
  }

  function pileCard(id: number, owner: number, name: string, zone: string): GameObject {
    return { id, card_id: id, owner, controller: owner, zone, name, card_types: { core_types: ['Instant'] }, oracle_text: 'Carta de prueba para revisar la vista de zona.' };
  }

  const viewerField = [
    permanent(100, 0, 'Grizzly Bears', ['Creature'], { power: 2, toughness: 2, mana_cost: '{1}{G}', summoning_sick: false }),
    permanent(101, 0, 'Savannah Lions', ['Creature'], { power: 2, toughness: 1, mana_cost: '{W}' }),
    ...Array.from({ length: 3 }, (_, i) => permanent(102 + i, 0, 'Forest', ['Land'], { tapped: i === 0 }))
  ];
  const rivalField = [
    // A planeswalker gives the picker a second kind of defender besides the
    // seat, which is the case upstream's per-attacker map exists for.
    permanent(205, 1, 'Chandra, Torch of Defiance', ['Planeswalker'], { counters: { loyalty: 4 } }),
    permanent(200, 1, 'Grizzly Bears', ['Creature'], { power: 2, toughness: 2, mana_cost: '{1}{G}' }),
    permanent(201, 1, 'Grizzly Bears', ['Creature'], { power: 2, toughness: 2, mana_cost: '{1}{G}' }),
    ...Array.from({ length: 2 }, (_, i) => permanent(202 + i, 1, 'Island', ['Land']))
  ];
  const viewerGrave = [pileCard(110, 0, 'Lightning Bolt', 'Graveyard'), pileCard(111, 0, 'Shock', 'Graveyard')];
  // The object that asks for the discard, so the panel can name it. It lives in
  // `objects` only: listing it in a zone would change the pile counts the lab
  // asserts elsewhere.
  const discardSource = { ...pileCard(310, 0, 'Mind Rot', 'Graveyard'), oracle_text: 'El jugador objetivo descarta dos cartas.' };
  const viewerExile = [pileCard(112, 0, 'Giant Growth', 'Exile')];
  const rivalGrave = [pileCard(210, 1, 'Counterspell', 'Graveyard')];
  const rivalExile: GameObject[] = [];
  const stackObject: GameObject = {
    id: 300, card_id: 300, owner: 0, controller: 0, zone: 'Stack', name: 'Lightning Bolt',
    card_types: { core_types: ['Instant'] }, mana_cost: '{R}', oracle_text: 'Lightning Bolt deals 3 damage to any target.'
  };
  const hand = [
    { id: 1000, card_id: 1000, owner: 0, controller: 0, zone: 'Hand', name: 'Mountain', card_types: { core_types: ['Land'] }, mana_cost: undefined },
    { id: 1001, card_id: 1001, owner: 0, controller: 0, zone: 'Hand', name: 'Grizzly Bears', card_types: { core_types: ['Creature'] }, power: 2, toughness: 2, mana_cost: '{1}{G}' },
    { id: 1002, card_id: 1002, owner: 0, controller: 0, zone: 'Hand', name: 'Shock', card_types: { core_types: ['Instant'] }, mana_cost: '{R}' }
  ] as GameObject[];
  const rivalHandIds = [2000, 2001, 2002];
  const rivalHand = rivalHandIds.map((id) => ({
    id, card_id: id, owner: 1, controller: 1, zone: 'Hand', name: 'Carta oculta', display_visible_to_viewer: false
  })) as GameObject[];

  const objects = $derived(Object.fromEntries(
    [...viewerField, ...rivalField, ...viewerGrave, ...viewerExile, ...rivalGrave, ...(stackObject ? [stackObject] : []), discardSource, ...hand, ...rivalHand]
      .map((object) => [String(object.id), object])
  ));

  function playerView(player: PlayerView): PlayerView {
    return {
      ...player,
      hand: player.id === 0 ? hand.map((card) => card.id) : rivalHandIds,
      graveyard: player.id === 0 ? viewerGrave.map((card) => card.id) : rivalGrave.map((card) => card.id),
      exile: player.id === 0 ? viewerExile.map((card) => card.id) : rivalExile.map((card) => card.id)
    };
  }

  const seats = $derived([
    playerView({ id: 0, life: 20, mana_pool: { ...MANA, total: 2, green: 2 }, hand: [], library_count: 33, graveyard: [], exile: [], is_eliminated: false, poison_counters: 0, energy: 1, lands_played_this_turn: 1 }),
    playerView({ id: 1, life: 17, mana_pool: { ...MANA }, hand: [], library_count: 34, graveyard: [], exile: [], is_eliminated: false, poison_counters: 1, energy: 0, lands_played_this_turn: 0 })
  ]);

  function waiting() {
    if (scene === 'targets') {
      return {
        type: 'TargetSelection',
        data: {
          player: 0,
          pending_cast: { object_id: 300, cost: { type: 'Red', amount: 1 } },
          selection: {
            current_slot: 0,
            current_legal_targets: [{ Player: 1 }, { Object: 200 }]
          }
        }
      };
    }
    if (scene === 'attackers') {
      // Shape taken from `WaitingFor::DeclareAttackers` in the pinned engine.
      // The per-attacker map is the authority: 100 may aim at the seat or at the
      // planeswalker, 101 only at the seat.
      const seat = { type: 'Player', data: 1 };
      const walker = { type: 'Object', data: 205 };
      return {
        type: 'DeclareAttackers',
        data: {
          player: 0,
          valid_attacker_ids: [100, 101],
          valid_attack_targets: [seat, walker],
          valid_attack_targets_by_attacker: { '100': [seat, walker], '101': [seat] },
          attacker_constraints: {}
        }
      };
    }
    if (scene === 'cleanup') {
      // Shape taken from `WaitingFor::DiscardToHandSize`: only the player, how
      // many cards are over the maximum and which ones Phase will accept.
      return { type: 'DiscardToHandSize', data: { player: 0, count: 2, cards: hand.map((card) => card.id) } };
    }
    if (scene === 'discard' || scene === 'discardUpTo') {
      // Shape taken from `WaitingFor::DiscardChoice` in the pinned engine: a
      // discard effect names the cards it accepts and (optionally) allows fewer.
      return {
        type: 'DiscardChoice',
        data: {
          player: 0,
          count: 2,
          cards: hand.map((card) => card.id),
          source_id: 310,
          up_to: scene === 'discardUpTo'
        }
      };
    }
    if (scene === 'combat') return { type: 'DeclareBlockers', data: { player: 1 } };
    if (scene === 'damage') {
      // Shape taken from `WaitingFor::AssignCombatDamage` in the pinned engine:
      // one attacker with trample-ish excess over a single blocker.
      return {
        type: 'AssignCombatDamage',
        data: {
          player: 0,
          attacker_id: 100,
          total_damage: 3,
          blockers: [{ blocker_id: 200, lethal_minimum: 2 }],
          assignment_modes: [],
          trample: 'Normal',
          defending_player: 1,
          attack_target: { type: 'Player', data: 1 }
        }
      };
    }
    return { type: 'Priority', data: { player: 0 } };
  }

  function snapshot(): EngineSnapshot {
    return {
      ok: true,
      viewer: 0,
      seed: 42,
      revision: scene === 'combat' ? 12 : scene === 'idle' ? 20 : 8,
      actions_applied: scene === 'combat' ? 12 : 8,
      state: {
        turn_number: 4,
        active_player: 0,
        priority_player: 0,
        phase: scene === 'cleanup' ? 'Cleanup'
          : scene === 'discard' || scene === 'discardUpTo' ? 'PreCombatMain'
          : scene === 'combat' ? 'DeclareBlockers'
          : scene === 'damage' ? 'CombatDamage'
          : scene === 'attackers' ? 'DeclareAttackers'
          : 'PreCombatMain',
        waiting_for: waiting(),
        players: seats,
        battlefield: [...viewerField, ...rivalField].map((object) => object.id),
        stack: scene === 'targets' ? [{ id: 7, source_id: 300, controller: 0 }] : [],
        exile: [],
        objects: objects as Record<string, GameObject>,
        combat: scene === 'combat' || scene === 'damage'
          ? {
              attackers: [
                { object_id: 100, defending_player: 1, attack_target: { type: 'Player', data: 1 }, blocked: true },
                { object_id: 101, defending_player: 1, attack_target: { type: 'Player', data: 1 }, blocked: false }
              ],
              blocker_assignments: { '201': [100] },
              blocker_to_attacker: { '201': [100] }
            }
          : null
      },
      derived: {
        stack_entry_details: scene === 'targets'
          ? {
              '7': {
                source_name: 'Lightning Bolt',
                kind_label: 'Hechizo',
                controller: 0,
                ability_description: '3 puntos de daño a cualquier objetivo.',
                targets: [
                  { label: 'Jugador 2', target: { Player: 1 } },
                  { label: 'Grizzly Bears', target: { Object: 200 } }
                ]
              }
            }
          : {},
        blocker_assignment_pairs: scene === 'combat' ? [[201, 100]] : []
      },
      legal: {
        actions: scene === 'targets'
          ? [
              { type: 'ChooseTarget', data: { target: { Player: 1 } } },
              { type: 'ChooseTarget', data: { target: { Object: 200 } } },
              { type: 'CancelCast' }
            ]
          : scene === 'damage'
            ? [
                { type: 'AssignCombatDamage', data: { mode: 'Normal', assignments: [[200, 2]], trample_damage: 1, controller_damage: 0 } },
                { type: 'AssignCombatDamage', data: { mode: 'AsThoughUnblocked', assignments: [], trample_damage: 0, controller_damage: 0 } }
              ]
            : [{ type: 'PassPriority' }],
        spell_costs: {},
        // Actions the menu must show. In the real table these arrive from
        // `legal.by_object`; the fixture copies the shape, not the rules.
        by_object: {
          '100': [{ type: 'ActivateAbility', data: { object_id: 100, ability_index: 0 } }],
          '1001': [{ type: 'CastSpell', data: { object_id: 1001 } }]
        }
      },
      metrics: {}
    } as unknown as EngineSnapshot;
  }

  // Install the fixture snapshot. The component tree reads it exactly like a
  // real snapshot: nothing here shortcuts the engine contract.
  $effect(() => {
    session.snapshot = snapshot();
  });
  // Navigating away must not leave the fixture in the singleton the real board
  // reads: going back to `/` has to show the start screen, not this snapshot.
  $effect(() => () => {
    session.snapshot = null;
    session.modeLabel = '';
  });
</script>

<svelte:head><title>Mesa · laboratorio de interfaz</title></svelte:head>

<!-- Same gestures as the real table: the lab has to test the menu the game
     uses, not a variant of it. -->
<svelte:window
  oncontextmenu={(event) => {
    if (document.querySelector('dialog[open]')) return;
    const card = (event.target as HTMLElement | null)?.closest?.('[data-card-id]') as HTMLElement | null;
    if (!card) return;
    event.preventDefault();
    menuAnchor = card.getBoundingClientRect();
    session.selected = Number(card.getAttribute('data-card-id'));
    session.openCardMenu(Number(card.getAttribute('data-card-id')));
  }}
  onkeydown={(event) => {
    if (!(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) return;
    if (document.querySelector('dialog[open]')) return;
    const card = (event.target as HTMLElement | null)?.closest?.('[data-card-id]') as HTMLElement | null;
    if (!card) return;
    event.preventDefault();
    menuAnchor = card.getBoundingClientRect();
    session.selected = Number(card.getAttribute('data-card-id'));
    session.openCardMenu(Number(card.getAttribute('data-card-id')));
  }}
/>

<div id="mesa-ux" class="app ux" data-board-style="arena" data-chrome="arena" style="--card-w: min(148px, calc((100vw - 6rem) / 2)); --arena-base-card-w: 124px">
  <ArenaSurface color="green" />

  <header class="topbar">
    <div class="brand">
      <span class="mark" aria-hidden="true">M</span>
      <div>
        <h1>Laboratorio de interfaz</h1>
        <p>Fixture del puerto Phase → Svelte. No ejecuta reglas; la partida real está en <a href="/">/</a>.</p>
      </div>
    </div>
    <div class="controls">
      <label>Escena
        <select bind:value={scene} aria-label="Escena del laboratorio">
          {#each SCENES as entry (entry.value)}
            <option value={entry.value}>{entry.label}</option>
          {/each}
        </select>
      </label>
      <Settings />
    </div>
  </header>

  <p class="lede">
    Las líneas son dibujos de la instantánea del motor: dorado = objetivo ofrecido, violeta = objetivo declarado en la pila,
    rojo = atacante, cian = bloqueo. Selecciona una zona del asiento para abrir su visor.
  </p>

  <main class="layout" data-board-region>
    {#if rivalHand.length}
      <div class="rival-hand" role="group" aria-label="Mano oculta de Jugador 2" style={`--fan-mid: ${(rivalHand.length - 1) / 2}`}>
        {#each rivalHand as card, i (card.id)}
          <div class="mini-back" aria-hidden="true" style={`--i: ${i}`}></div>
        {/each}
        <span class="fan-count" aria-hidden="true">{rivalHand.length}</span>
      </div>
    {/if}
    <PlayerPanel player={seats[1]} showHand />
    <Battlefield objects={rivalField} metas={{}} owner={1} side="opponent" label="Campo de batalla · Jugador 2" />

    <!-- Same rail as the real table: arena.css places `.middle` in the sticky
         right column on short desktops and back in the flow elsewhere. -->
    <PhaseStopBar phase={snapshot().state.phase} turn={4} activePlayer={0} />
    <MobilePhaseChip phase={snapshot().state.phase} turn={4} activePlayer={0} />

    <div class="middle">
      <div class="center">
        {#if scene === 'damage'}<DamageAssignment />{/if}
        {#if scene === 'cleanup' || scene === 'discard' || scene === 'discardUpTo'}<DiscardPrompt />{/if}
        <StackPanel />
        <HistoryPanel compact />
      </div>
    </div>

    <Battlefield objects={viewerField} metas={{}} owner={0} side="player" label="Tu campo de batalla · Jugador 1" />
    <PlayerPanel player={seats[0]} />

    <!-- Mismo cromo que la mesa real, para que el laboratorio enseñe lo que se
         juega: estado de prioridad, mano y control total. -->
    <CoachTip />
    <StatusDock />
  </main>

  <BoardOverlay />
  {#if session.cardMenu !== null}
    <CardActionMenu objectId={session.cardMenu} anchor={menuAnchor} onclose={() => session.closeCardMenu()} />
  {/if}
  {#if session.attackPicker !== null}
    <AttackTargetPicker objectId={session.attackPicker.id} anchor={session.attackPicker.anchor} onclose={() => session.closeAttackPicker()} />
  {/if}
  <!-- Same click contract as the real hand (`Board.svelte` leaves `Hand` its own
       default): a card the engine is asking for is an answer to that prompt, not
       something to inspect. Without this the discard scenes could not be used. -->
  <Hand objects={hand} metas={{}} title="Tu mano · Jugador 1" onselect={(id) => session.selectObject(id)} />


  <footer class="metrics">
    <span>Escena: {scene}</span>
    <span>revisión {snapshot().revision}</span>
    <span>{SCENE_SUMMARY[scene]}</span>
  </footer>
</div>

<style>
  /* The fixture needs the same card budget the real board sets inline; without
     it arena.css' short-viewport rule computes an invalid --card-w and every
     face collapses to its shrink-to-fit width (measured: 4 px). */
  /* The real board's `.app` rules are scoped to Board.svelte; the fixture needs
     the same column flow so the hand sits under the table instead of being
     clipped by arena.css' `overflow: clip`. */
  /*
   * The real table is a 100dvh surface that shrinks its own layout and clips
   * overflow (arena.css `.app.app[data-board-style="arena"]:has(> .layout)`).
   * The lab is a document: it carries the same Arena styling but must grow so a
   * fixture taller than one screen scrolls instead of painting the viewer's
   * seat over the hand. An id outranks those class-based rules without
   * `!important`.
   */
  #mesa-ux { height: auto; overflow: visible; }
  #mesa-ux > .layout { flex: 0 0 auto; }
  .ux {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: .8rem;
    min-height: 100vh;
    padding: .8rem clamp(.6rem, 2vw, 1.4rem);
    max-width: 1800px;
    margin: 0 auto;
  }
  /* Plain text over a painting is unreadable: give the lede the same surface
     the real table's notices use. */
  .lede { background: color-mix(in srgb, var(--surface) 92%, transparent); border: 1px solid color-mix(in srgb, var(--line) 76%, transparent); border-radius: 12px; padding: .5rem .8rem; }
  .topbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: .8rem; }
  .brand { display: flex; align-items: center; gap: .65rem; }
  .mark { width: 2.4rem; height: 2.4rem; border-radius: 10px; background: var(--accent); color: var(--accent-ink); display: grid; place-items: center; font-weight: 800; font-size: 1.2rem; }
  h1 { margin: 0; font-size: 1.15rem; }
  .brand p { margin: 0; font-size: .74rem; color: var(--ink-muted); max-width: 46ch; }
  .brand a { color: var(--focus); }
  .controls { display: flex; align-items: center; gap: .8rem; flex-wrap: wrap; }
  .controls label { display: flex; align-items: center; gap: .4rem; font-size: .78rem; color: var(--ink-muted); }
  .controls select { background: var(--surface-2); border: 1px solid var(--line); color: var(--ink); border-radius: 8px; padding: .25rem .4rem; }
  .lede { margin: 0; font-size: .82rem; color: var(--ink-muted); max-width: 90ch; }
  /* The fixture is taller than one screen once the hand is added; without this
     the flex column shrinks the table and the seats overlap the hand (measured:
     layout 568 px tall with seat 0 painted at y = 801). A lab may scroll. */
  .layout { display: grid; min-width: 0; flex: none; }
  .center { display: grid; gap: .5rem; min-width: 0; }
  .rival-hand { display: flex; gap: .3rem; overflow: hidden; padding: .2rem; }
  .mini-back { width: 34px; height: 48px; border-radius: 5px; background: repeating-linear-gradient(45deg, var(--surface-3), var(--surface-3) 5px, var(--surface-2) 5px, var(--surface-2) 10px); border: 1px solid var(--line); }
  @media (max-width: 640px) {
    /* At ≤1099 px arena.css turns `.app > .topbar` into a two-column grid and
       the scene picker does not fit beside the title at 320 px (measured:
       42 px of horizontal document overflow). An id outranks that rule. */
    #mesa-ux > .topbar { display: flex; flex-direction: column; align-items: stretch; }
    .controls { justify-content: space-between; }
    .controls select { max-width: 100%; }
  }
  .metrics { display: flex; flex-wrap: wrap; gap: .8rem; font-size: .72rem; color: var(--ink-muted); font-family: var(--mono); background: color-mix(in srgb, var(--surface) 90%, transparent); border-radius: 10px; padding: .25rem .6rem; }
</style>

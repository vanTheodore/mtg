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
  import ChooseXPrompt from '#lib/components/ChooseXPrompt.svelte';
  import TriggerOrderPrompt from '#lib/components/TriggerOrderPrompt.svelte';
  import ModeChoicePrompt from '#lib/components/ModeChoicePrompt.svelte';
  import SearchPrompt from '#lib/components/SearchPrompt.svelte';
  import DigPrompt from '#lib/components/DigPrompt.svelte';
  import OptionalEffectPrompt from '#lib/components/OptionalEffectPrompt.svelte';
  import PayAmountPrompt from '#lib/components/PayAmountPrompt.svelte';
  import RevealPrompt from '#lib/components/RevealPrompt.svelte';
  import UnlessPrompt from '#lib/components/UnlessPrompt.svelte';
  import PairPrompt from '#lib/components/PairPrompt.svelte';
  import TokenHostPrompt from '#lib/components/TokenHostPrompt.svelte';
  import UnlessBranchPrompt from '#lib/components/UnlessBranchPrompt.svelte';
  import TributePrompt from '#lib/components/TributePrompt.svelte';
  import WardSacrificePrompt from '#lib/components/WardSacrificePrompt.svelte';
  import StartingPlayerPrompt from '#lib/components/StartingPlayerPrompt.svelte';
  import ScryPrompt from '#lib/components/ScryPrompt.svelte';
  import TapPowerPrompt from '#lib/components/TapPowerPrompt.svelte';
  import EquipPrompt from '#lib/components/EquipPrompt.svelte';
  import StationPrompt from '#lib/components/StationPrompt.svelte';
  import type { EngineSnapshot, GameObject, PlayerView } from '#lib/engine/types.ts';

  type Scene = 'targets' | 'combat' | 'idle' | 'damage' | 'attackers' | 'cleanup' | 'discard' | 'discardUpTo' | 'chooseX' | 'triggerOrder' | 'modeChoice' | 'search' | 'dig' | 'optional' | 'pay' | 'opponent' | 'reveal' | 'unless' | 'pair' | 'host' | 'branches' | 'tribute' | 'ward' | 'wardPower' | 'startingPlayer' | 'scry' | 'surveil' | 'crew' | 'saddle' | 'equip' | 'station';
  const SCENES: { value: Scene; label: string }[] = [
    { value: 'targets', label: 'Objetivos y pila' },
    { value: 'combat', label: 'Combate declarado' },
    { value: 'attackers', label: 'Declarar atacantes' },
    { value: 'damage', label: 'Asignación de daño' },
    { value: 'cleanup', label: 'Limpieza: descartar' },
    { value: 'discard', label: 'Descartar dos cartas' },
    { value: 'discardUpTo', label: 'Descartar hasta dos' },
    { value: 'chooseX', label: 'Elegir X' },
    { value: 'triggerOrder', label: 'Ordenar disparos' },
    { value: 'modeChoice', label: 'Elegir modos' },
    { value: 'search', label: 'Buscar en la biblioteca' },
    { value: 'dig', label: 'Mirar y guardar' },
    { value: 'optional', label: 'Efecto opcional' },
    { value: 'pay', label: 'Pagar una cantidad' },
    { value: 'opponent', label: 'Decide un oponente' },
    { value: 'reveal', label: 'Revelar una carta' },
    { value: 'unless', label: 'Pagar o aceptar' },
    { value: 'pair', label: 'Emparejar (soulbond)' },
    { value: 'host', label: 'Destinatario de una ficha' },
    { value: 'branches', label: 'Pagar uno de dos costes' },
    { value: 'tribute', label: 'Tributo: lo paga un oponente' },
    { value: 'ward', label: 'Guardia: un permanente' },
    { value: 'wardPower', label: 'Guardia: poder total' },
    { value: 'startingPlayer', label: 'Quién empieza' },
    { value: 'scry', label: 'Adivinar (scry)' },
    { value: 'surveil', label: 'Vigilar (surveil)' },
    { value: 'crew', label: 'Tripular (crew)' },
    { value: 'saddle', label: 'Montar (saddle)' },
    { value: 'equip', label: 'Equipar' },
    { value: 'station', label: 'Estación (station)' },
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
    chooseX: 'ChooseXValue · X entre 0 y 5',
    triggerOrder: 'OrderTriggers · tres disparos simultáneos',
    modeChoice: 'ModeChoice · hechizo modal, dos de tres modos',
    search: 'SearchChoice · tutor de una criatura',
    dig: 'DigChoice · mirar tres, guardar una',
    optional: 'OptionalEffectChoice · «puedes robar una carta»',
    pay: 'PayAmountChoice · ventana de vida 1–4',
    opponent: 'OpponentMayChoice · deciden los oponentes en orden de turno',
    reveal: 'RevealChoice · revelar una tierra o no revelar',
    unless: 'UnlessPayment · pagar {3} o contrahechizo',
    pair: 'PairChoice · emparejar con otra criatura o no emparejar',
    host: 'ChooseTokenHost · una ficha elige entre dos criaturas',
    branches: 'UnlessPaymentChooseCost · sacrificar o descartar',
    tribute: 'TributeChoice · un oponente decide si se paga',
    ward: 'WardSacrificeChoice · CR 702.21b, un permanente por vuelta',
    wardPower: 'WardSacrificeChoice · CR 118.12a, poder total mínimo',
    startingPlayer: 'ChooseStartingPlayer · CR 103.1, la tirada elige',
    scry: 'ScryChoice · CR 701.22a, lo que no se queda va al fondo',
    surveil: 'SurveilChoice · CR 701.25a, lo que no se queda va al cementerio',
    crew: 'CrewVehicle · CR 702.122a, girar criaturas por su aportación',
    saddle: 'SaddleMount · CR 702.171a, montar no es tripular',
    equip: 'EquipTarget · CR 702.6a, elegir a quién se anexa',
    station: 'StationTarget · CR 702.184a, una criatura, un número',
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
    // A third creature so a scene can ask «with which one?» and have two answers.
    permanent(105, 0, 'Elvish Mystic', ['Creature'], { power: 1, toughness: 1, mana_cost: '{G}' }),
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
  // The spell waiting for its X. It also lives only in `objects`: the prompt
  // names it, no zone has to hold it.
  const xSpell = {
    id: 320, card_id: 320, owner: 0, controller: 0, zone: 'Stack', name: 'Fireball',
    card_types: { core_types: ['Sorcery'] }, mana_cost: '{X}{R}',
    oracle_text: 'Fireball deals X damage divided as you choose among any number of targets.'
  } as GameObject;
  // The Tribute creature. Like the spell waiting for its X it lives only in
  // `objects`: the prompt names it, no zone has to hold it, and the pile and
  // battlefield counts the rest of the lab asserts stay put.
  const tributeCreature = {
    id: 330, card_id: 330, owner: 1, controller: 1, zone: 'Battlefield',
    name: 'Fanatic of Xenagos', card_types: { core_types: ['Creature'], subtypes: ['Minotaur'] },
    mana_cost: '{1}{R}{G}', power: 3, toughness: 3,
    oracle_text: 'Tribute 1 (As this creature enters, an opponent of your choice may put a +1/+1 counter on it.)'
  } as GameObject;
  // Crew, saddle and equip name a permanent the fixture does not need on a
  // battlefield row: like the spell waiting for its X, they live only in
  // `objects`, so no pile count moves.
  //
  // Each one is a card the engine itself quotes — `Smogbelcher Chariot` with
  // Crew 3 and `Ornery Tumblewagg` with Saddle 2 in `tests/integration`, and
  // `Bonesplitter` as an Equipment in `layers.rs` — and carries only what those
  // literals state: the name, the type and the verbatim text. Mana cost and
  // printed P/T are left out rather than guessed; the block never needs them,
  // and its numbers come from the engine's `contributions`, not from the face.
  const smogbelcherChariot = {
    id: 340, card_id: 340, owner: 0, controller: 0, zone: 'Battlefield',
    name: 'Smogbelcher Chariot', card_types: { core_types: ['Artifact'], subtypes: ['Vehicle'] },
    oracle_text: 'Menace, deathtouch, lifelink\nWhenever Smogbelcher Chariot attacks, target creature that crewed it this turn perpetually gains your choice of menace, deathtouch, or lifelink.\nCrew 3'
  } as GameObject;
  const bonesplitter = {
    id: 341, card_id: 341, owner: 0, controller: 0, zone: 'Battlefield',
    name: 'Bonesplitter', card_types: { core_types: ['Artifact'], subtypes: ['Equipment'] }
  } as GameObject;
  const orneryTumblewagg = {
    id: 342, card_id: 342, owner: 0, controller: 0, zone: 'Battlefield',
    name: 'Ornery Tumblewagg', card_types: { core_types: ['Creature'], subtypes: ['Mount'] },
    oracle_text: 'At the beginning of combat on your turn, put a +1/+1 counter on target creature.\nWhenever this creature attacks while saddled, double the number of +1/+1 counters on target creature.\nSaddle 2 (Tap any number of other creatures you control with total power 2 or more: This Mount becomes saddled until end of turn. Saddle only as a sorcery.)'
  } as GameObject;
  // CR 702.184a: the Spacecraft, with the Station text the engine quotes verbatim
  // in `tests/integration/stack_entry_node_reach.rs`. Its thresholds («1+», «8+»)
  // are the card's, which is why the pick matters: the tapped creature's power is
  // how many charge counters arrive.
  const entropicBattlecruiser = {
    id: 343, card_id: 343, owner: 0, controller: 0, zone: 'Battlefield',
    name: 'Entropic Battlecruiser',
    card_types: { core_types: ['Artifact'], subtypes: ['Spacecraft'] },
    oracle_text: 'Station (Tap another creature you control: Put charge counters equal to its power on this Spacecraft. Station only as a sorcery. It\'s an artifact creature at 8+.)\n1+ | Whenever an opponent discards a card, they lose 3 life.\n8+ | Flying, deathtouch\nWhenever this Spacecraft attacks, each opponent discards a card. Each opponent who can\'t loses 3 life.'
  } as GameObject;
  // A modal card for the mode scene: Fireball is not modal, and the lab should
  // not teach the wrong example.
  const modeSpell = {
    id: 321, card_id: 321, owner: 0, controller: 0, zone: 'Stack', name: 'Selesnya Charm',
    card_types: { core_types: ['Instant'] }, mana_cost: '{G}{W}',
    oracle_text: 'Elige dos: la criatura objetivo obtiene +2/+2; gana vigilancia; ganas 3 vidas.'
  } as GameObject;
  // Cards only the library knows: the search prompt names them, no zone lists
  // them, so the pile counts the rest of the lab asserts stay put.
  const searchPool = [
    { id: 400, card_id: 400, owner: 0, controller: 0, zone: 'Library', name: 'Llanowar Elves', card_types: { core_types: ['Creature'], subtypes: ['Elf', 'Druid'] }, mana_cost: '{G}' },
    { id: 401, card_id: 401, owner: 0, controller: 0, zone: 'Library', name: 'Grizzly Bears', card_types: { core_types: ['Creature'], subtypes: ['Bear'] }, mana_cost: '{1}{G}' },
    { id: 402, card_id: 402, owner: 0, controller: 0, zone: 'Library', name: 'Shock', card_types: { core_types: ['Instant'] }, mana_cost: '{R}' },
    { id: 403, card_id: 403, owner: 0, controller: 0, zone: 'Library', name: 'Island', card_types: { core_types: ['Land'], subtypes: ['Island'] } }
  ] as GameObject[];
  const xCost = (generic: number, red: number) => ({ type: 'Cost', generic, shards: Array.from({ length: red }, () => 'Red') });
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
    [...viewerField, ...rivalField, ...viewerGrave, ...viewerExile, ...rivalGrave, ...(stackObject ? [stackObject] : []), discardSource, xSpell, modeSpell, tributeCreature, smogbelcherChariot, bonesplitter, orneryTumblewagg, entropicBattlecruiser, ...searchPool, ...hand, ...rivalHand]
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
    if (scene === 'crew' || scene === 'saddle') {
      // Shape taken from `CrewVehicle` / `SaddleMount`: the permanent being paid
      // for, the threshold, and one contribution per eligible creature — in the
      // engine's order, aligned index-for-index.
      return scene === 'crew'
        ? {
            type: 'CrewVehicle',
            data: {
              player: 0,
              vehicle_id: 340,
              crew_power: 3,
              eligible_creatures: [100, 101, 105],
              contributions: [2, 2, 1]
            }
          }
        : {
            type: 'SaddleMount',
            data: {
              player: 0,
              mount_id: 342,
              saddle_power: 2,
              eligible_creatures: [100, 101, 105],
              contributions: [2, 2, 1]
            }
          };
    }
    if (scene === 'station') {
      // `StationTarget`: the Spacecraft and the untapped creatures the engine
      // will accept — one pick, no contributions list, because the number is the
      // chosen creature's power and arrives with the resolution.
      return { type: 'StationTarget', data: { player: 0, spacecraft_id: 343, eligible_creatures: [100, 101, 105] } };
    }
    if (scene === 'equip') {
      // `EquipTarget`: the equipment and the permanents it may attach to.
      return { type: 'EquipTarget', data: { player: 0, equipment_id: 341, valid_targets: [101, 105] } };
    }
    if (scene === 'scry' || scene === 'surveil') {
      // Shape taken from `ScryChoice` / `SurveilChoice`: the seat and the cards it
      // looked at, in library order. The cards are library-only in this fixture,
      // so no pile count moves.
      return {
        type: scene === 'scry' ? 'ScryChoice' : 'SurveilChoice',
        data: { player: 0, cards: scene === 'scry' ? [400, 401, 402] : [401, 403] }
      };
    }
    if (scene === 'startingPlayer') {
      // Shape taken from `WaitingFor::ChooseStartingPlayer`: the roll winner and
      // the seats the engine will accept, in seat order.
      return { type: 'ChooseStartingPlayer', data: { player: 0, candidates: [0, 1] } };
    }
    if (scene === 'ward' || scene === 'wardPower') {
      // Shape taken from `WaitingFor::WardSacrificeChoice`. Without a threshold
      // Phase lists one candidate per permanent; with one it lists the single
      // set it found, and the legal list below mirrors that.
      return {
        type: 'WardSacrificeChoice',
        data: {
          player: 0,
          permanents: scene === 'ward' ? [101, 105] : [100, 101, 105],
          remaining: 1,
          min_total_power: scene === 'wardPower' ? 3 : null,
          pending_effect: { ability: {} }
        }
      };
    }
    if (scene === 'tribute') {
      // Shape taken from `WaitingFor::TributeChoice`: the deciding seat, the
      // entering creature and how many +1/+1 counters the tribute is worth.
      return { type: 'TributeChoice', data: { player: 0, source_id: 330, count: 1 } };
    }
    if (scene === 'branches') {
      // Shape taken from `WaitingFor::UnlessPaymentChooseCost`: the punisher class
      // the engine documents with Tergrid's Lantern ("loses N life unless they
      // sacrifice a nonland permanent or discard a card"). `SacrificeCost` is
      // flattened onto the tag, so `count` and `target` sit next to `type`.
      return {
        type: 'UnlessPaymentChooseCost',
        data: {
          player: 0,
          costs: [
            {
              type: 'Sacrifice',
              target: { type: 'Typed', type_filters: ['Permanent'] },
              count: 1
            },
            { type: 'Discard', count: { type: 'Fixed', value: 1 }, filter: null }
          ],
          pending_ability: { ability: {} },
          effect_description: 'pierde 3 vidas',
          remaining_choices: [],
          chosen: []
        }
      };
    }
    if (scene === 'host') {
      // Shape taken from `WaitingFor::ChooseTokenHost` in the pinned engine: the
      // stamped entrants as `TargetRef`, already filtered by the engine.
      return {
        type: 'ChooseTokenHost',
        data: {
          player: 0,
          source_id: 100,
          // `TargetRef` has no tag wrapper: the key itself is the discriminant.
          legal_targets: [{ Object: 101 }, { Object: 105 }],
          pending_ability: { ability: {} }
        }
      };
    }
    if (scene === 'pair') {
      // Shape taken from `WaitingFor::PairChoice` in the pinned engine (CR
      // 702.95a): the entering creature and the unpaired creatures it may join.
      return {
        type: 'PairChoice',
        data: { player: 0, source_id: 100, choices: [101, 105] }
      };
    }
    if (scene === 'unless') {
      // Shape taken from `WaitingFor::UnlessPayment` in the pinned engine: an
      // `AbilityCost` (here `Mana {3}`, the Mana Leak pattern) and the effect the
      // engine will run if the payer declines.
      return {
        type: 'UnlessPayment',
        data: {
          player: 0,
          cost: { type: 'Mana', cost: { generic: 3, shards: [] } },
          pending_effect: { ability: { kind: 'Spell' } },
          effect_description: 'contrarrestar el hechizo',
          remaining: []
        }
      };
    }
    if (scene === 'reveal') {
      // Shape taken from `WaitingFor::RevealChoice` in the pinned engine: the
      // reveal-land pattern, where declining is a real answer (CR 701.20a).
      return {
        type: 'RevealChoice',
        // The reveal-land pattern reads a card from the hand, so the fixture uses
        // the hand's own objects rather than the library pool.
        data: { player: 0, cards: [1000, 1001, 1002], optional: true, decline_runs_continuation: true }
      };
    }
    if (scene === 'opponent') {
      // Shape taken from `WaitingFor::OpponentMayChoice` in the pinned engine:
      // the seat being asked, the source it does not control and who is left.
      return {
        type: 'OpponentMayChoice',
        data: {
          player: 0,
          source_id: 205,
          decision_subject_id: 205,
          description: 'Puedes sacrificar una tierra.',
          remaining: [1]
        }
      };
    }
    if (scene === 'pay') {
      // Shape taken from `WaitingFor::PayAmountChoice` in the pinned engine:
      // `resource: Life` (CR 119.4), a window the engine owns and the source.
      return {
        type: 'PayAmountChoice',
        data: {
          player: 0,
          resource: { type: 'Life' },
          min: 1,
          max: 4,
          accumulated: 0,
          source_id: 100
        }
      };
    }
    if (scene === 'optional') {
      // Shape taken from `WaitingFor::OptionalEffectChoice` in the pinned
      // engine: the instruction's own wording, its source and the memory key.
      return {
        type: 'OptionalEffectChoice',
        data: {
          player: 0,
          source_id: 100,
          decision_subject_id: 100,
          description: 'Puedes robar una carta.',
          may_trigger_key: { player: 0, source_id: 100, origin: { type: 'Printed', trigger_index: 0 } },
          same_card_may_trigger_choice_available: true
        }
      };
    }
    if (scene === 'dig') {
      // Shape taken from `WaitingFor::DigChoice` in the pinned engine: the cards
      // looked at, the ones that pass the filter and where each pile goes.
      return {
        type: 'DigChoice',
        data: {
          player: 0,
          library_owner: 0,
          cards: searchPool.slice(0, 3).map((card) => card.id),
          keep_count: 1,
          up_to: false,
          selectable_cards: searchPool.slice(0, 2).map((card) => card.id),
          kept_destination: 'Hand',
          rest_destination: 'Graveyard'
        }
      };
    }
    if (scene === 'search') {
      // Shape taken from `WaitingFor::SearchChoice` in the pinned engine: the
      // legal choices and the window the searcher may answer within.
      return {
        type: 'SearchChoice',
        data: {
          player: 0,
          library_owner: 0,
          cards: searchPool.map((card) => card.id),
          count: 1,
          reveal: true,
          up_to: false,
          allows_partial_find: false,
          constraint: { type: 'None' }
        }
      };
    }
    if (scene === 'modeChoice') {
      // Shape taken from `WaitingFor::ModeChoice` in the pinned engine: the
      // modal window, the mode texts and the modes Phase already rules out.
      return {
        type: 'ModeChoice',
        data: {
          player: 0,
          modal: {
            min_choices: 2,
            max_choices: 2,
            mode_count: 3,
            mode_descriptions: [
              'La criatura objetivo obtiene +2/+2 hasta el final del turno.',
              'La criatura objetivo gana la habilidad de vigilancia hasta el final del turno.',
              'Ganas 3 vidas.'
            ],
            allow_repeat_modes: false
          },
          pending_cast: { object_id: 321, cost: { type: 'Cost', generic: 0, shards: ['Green', 'White'] } },
          unavailable_modes: [2]
        }
      };
    }
    if (scene === 'triggerOrder') {
      // Shape taken from `WaitingFor::OrderTriggers` in the pinned engine:
      // summaries the engine derived, and the indices it accepts a permutation of.
      return {
        type: 'OrderTriggers',
        data: {
          player: 0,
          triggers: [
            { source_id: 1000, source_name: 'Soul Warden', description: 'Ganas 1 vida.' },
            { source_id: 1001, source_name: "Ajani's Pridemate", description: 'Pon un contador +1/+1 sobre esta criatura.' },
            { source_id: 2000, source_name: 'Dina, Soul Steeper', description: 'Cada oponente pierde 1 vida.' }
          ]
        }
      };
    }
    if (scene === 'chooseX') {
      // Shape taken from `WaitingFor::ChooseXValue` in the pinned engine: the
      // window the caster may announce, the spell, and the cost of each value.
      return {
        type: 'ChooseXValue',
        data: {
          player: 0,
          min: 0,
          max: 5,
          pending_cast: { object_id: 320, cost: xCost(1, 1) },
          x_cost_previews: [[0, xCost(1, 1)], [3, xCost(4, 1)], [5, xCost(6, 1)]]
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
          : scene === 'chooseX' ? 'PreCombatMain'
          : scene === 'triggerOrder' ? 'PreCombatMain'
          : scene === 'modeChoice' ? 'PreCombatMain'
          : scene === 'search' ? 'PreCombatMain'
          : scene === 'dig' ? 'PreCombatMain'
          : scene === 'optional' ? 'PreCombatMain'
          : scene === 'pay' ? 'PreCombatMain'
          : scene === 'opponent' ? 'PreCombatMain'
          : scene === 'reveal' ? 'PreCombatMain'
          : scene === 'unless' ? 'PreCombatMain'
          : scene === 'pair' ? 'PreCombatMain'
          : scene === 'host' ? 'PreCombatMain'
          : scene === 'branches' ? 'PreCombatMain'
          : scene === 'tribute' ? 'PreCombatMain'
          : scene === 'ward' || scene === 'wardPower' ? 'PreCombatMain'
          : scene === 'startingPlayer' ? 'Beginning'
          : scene === 'scry' || scene === 'surveil' ? 'PreCombatMain'
          : scene === 'crew' || scene === 'saddle' || scene === 'equip' || scene === 'station' ? 'PreCombatMain'
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
            : scene === 'ward'
              ? [
                  { type: 'SelectCards', data: { cards: [101] } },
                  { type: 'SelectCards', data: { cards: [105] } }
                ]
              : scene === 'wardPower'
                ? [{ type: 'SelectCards', data: { cards: [100, 105] } }]
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

<!--
  The same two switches as `Board.svelte`: the board style and — only while the
  arena chrome is on — `data-chrome="arena"`, which `arena.css` uses to keep the
  chrome dark over the art on purpose. Without this the laboratory could not
  show the classic chrome, and the classic chrome is the one that follows the
  global theme, so a light/dark review had nothing to review.
-->
<div
  id="mesa-ux"
  class="app ux"
  data-board-style={session.boardStyle}
  data-chrome={session.boardStyle === 'arena' ? 'arena' : undefined}
  style="--card-w: min(148px, calc((100vw - 6rem) / 2)); --arena-base-card-w: 124px">
  {#if session.boardStyle === 'arena'}
    <ArenaSurface color="green" />
  {/if}

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
        {#if scene === 'chooseX'}<ChooseXPrompt />{/if}
        {#if scene === 'triggerOrder'}<TriggerOrderPrompt />{/if}
        {#if scene === 'modeChoice'}<ModeChoicePrompt />{/if}
        {#if scene === 'search'}<SearchPrompt />{/if}
        {#if scene === 'dig'}<DigPrompt />{/if}
        {#if scene === 'optional'}<OptionalEffectPrompt />{/if}
        {#if scene === 'pay'}<PayAmountPrompt />{/if}
        {#if scene === 'opponent'}<OptionalEffectPrompt />{/if}
        {#if scene === 'reveal'}<RevealPrompt />{/if}
        {#if scene === 'unless'}<UnlessPrompt />{/if}
        {#if scene === 'pair'}<PairPrompt />{/if}
        {#if scene === 'host'}<TokenHostPrompt />{/if}
        {#if scene === 'branches'}<UnlessBranchPrompt />{/if}
        {#if scene === 'tribute'}<TributePrompt />{/if}
        {#if scene === 'ward' || scene === 'wardPower'}<WardSacrificePrompt />{/if}
        {#if scene === 'startingPlayer'}<StartingPlayerPrompt />{/if}
        {#if scene === 'scry' || scene === 'surveil'}<ScryPrompt />{/if}
        {#if scene === 'crew' || scene === 'saddle'}<TapPowerPrompt />{/if}
        {#if scene === 'equip'}<EquipPrompt />{/if}
        {#if scene === 'station'}<StationPrompt />{/if}
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
  /* A long scene label is an option, not a layout decision: a native select
     sizes itself to its widest option, so an option added later could widen the
     chrome past the window (measured: 30 px of overflow at 320 px the first time
     a label grew). `min-width: 0` lets the flex chain shrink and the select
     ellipsise instead. */
  .brand { min-width: 0; }
  .controls { display: flex; align-items: center; gap: .8rem; flex-wrap: wrap; min-width: 0; max-width: 100%; }
  .controls label { display: flex; align-items: center; gap: .4rem; min-width: 0; font-size: .78rem; color: var(--ink-muted); }
  .controls select { max-width: 100%; min-width: 0; background: var(--surface-2); border: 1px solid var(--line); color: var(--ink); border-radius: 8px; padding: .25rem .4rem; }
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

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
  import MultiTargetPrompt from '#lib/components/MultiTargetPrompt.svelte';
  import DistributePrompt from '#lib/components/DistributePrompt.svelte';
  import MoveCountersPrompt from '#lib/components/MoveCountersPrompt.svelte';
  import RetargetPrompt from '#lib/components/RetargetPrompt.svelte';
  import ChooseObjectsPrompt from '#lib/components/ChooseObjectsPrompt.svelte';
  import ProliferatePrompt from '#lib/components/ProliferatePrompt.svelte';
  import TimeTravelPrompt from '#lib/components/TimeTravelPrompt.svelte';
  import CategoryPrompt from '#lib/components/CategoryPrompt.svelte';
  import CopyChosenPrompt from '#lib/components/CopyChosenPrompt.svelte';
  import KeepPowerPrompt from '#lib/components/KeepPowerPrompt.svelte';
  import KeepExactPrompt from '#lib/components/KeepExactPrompt.svelte';
  import RemoveCountersPrompt from '#lib/components/RemoveCountersPrompt.svelte';
  import CopyRetargetPrompt from '#lib/components/CopyRetargetPrompt.svelte';
  import VotePrompt from '#lib/components/VotePrompt.svelte';
  import ExploreChoicePrompt from '#lib/components/ExploreChoicePrompt.svelte';
  import MiracleRevealPrompt from '#lib/components/MiracleRevealPrompt.svelte';
  import CastOfferPrompt from '#lib/components/CastOfferPrompt.svelte';
  import SeparatePilesPrompt from '#lib/components/SeparatePilesPrompt.svelte';
  import type { EngineSnapshot, GameObject, PlayerView } from '#lib/engine/types.ts';

  type Scene = 'targets' | 'combat' | 'idle' | 'damage' | 'attackers' | 'cleanup' | 'discard' | 'discardUpTo' | 'chooseX' | 'triggerOrder' | 'modeChoice' | 'search' | 'dig' | 'optional' | 'pay' | 'opponent' | 'reveal' | 'unless' | 'pair' | 'host' | 'branches' | 'tribute' | 'ward' | 'wardPower' | 'startingPlayer' | 'scry' | 'surveil' | 'crew' | 'saddle' | 'equip' | 'station' | 'multiTarget' | 'multiTargetExact' | 'distribute' | 'distributeAnnounced' | 'moveCounters' | 'retarget' | 'retargetSingle' | 'chooseObjects' | 'chooseObjectsRecipient' | 'proliferate' | 'timeTravelRemove' | 'timeTravelAdd' | 'category' | 'categoryForAll' | 'copyChosen' | 'copyChosenNeighbor' | 'keepPower' | 'keepPowerForAll' | 'keepExact' | 'keepExactVow' | 'removeCounters' | 'removeCountersCapped' | 'copyRetarget' | 'copyAnnounce' | 'vote' | 'voteObject' | 'explore' | 'exploreShared' | 'pilePartition' | 'pileChoice' | 'miracle' | 'castOffer' | 'castOfferCascade' | 'castOfferWindow';
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
    { value: 'multiTarget', label: 'Objetivos: hasta dos' },
    { value: 'multiTargetExact', label: 'Objetivos: exactamente dos' },
    { value: 'distribute', label: 'Reparto: 5 entre candidatos' },
    { value: 'distributeAnnounced', label: 'Reparto: todos los objetivos' },
    { value: 'moveCounters', label: 'Mover contadores' },
    { value: 'retarget', label: 'Cambiar objetivos: todos' },
    { value: 'retargetSingle', label: 'Cambiar objetivos: uno' },
    { value: 'chooseObjects', label: 'Elegir permanentes: cualquiera' },
    { value: 'chooseObjectsRecipient', label: 'Elegir receptor del daño' },
    { value: 'proliferate', label: 'Proliferar' },
    { value: 'timeTravelRemove', label: 'Viaje en el tiempo: quitar' },
    { value: 'timeTravelAdd', label: 'Viaje en el tiempo: poner' },
    { value: 'category', label: 'Conservar uno de cada tipo' },
    { value: 'categoryForAll', label: 'Conservar por todos' },
    { value: 'copyChosen', label: 'Copiar la elegida' },
    { value: 'copyChosenNeighbor', label: 'Copiar del vecino' },
    { value: 'keepPower', label: 'Conservar por fuerza' },
    { value: 'keepPowerForAll', label: 'Conservar por fuerza: todos' },
    { value: 'keepExact', label: 'Conservar exactos' },
    { value: 'keepExactVow', label: 'Conservar exactos con voto' },
    { value: 'removeCounters', label: 'Quitar contadores' },
    { value: 'removeCountersCapped', label: 'Quitar contadores con tope' },
    { value: 'copyRetarget', label: 'Objetivos de la copia' },
    { value: 'copyAnnounce', label: 'La copia anuncia objetivos' },
    { value: 'vote', label: 'Votación' },
    { value: 'voteObject', label: 'Votación sobre permanentes' },
    { value: 'explore', label: 'Quién explora' },
    { value: 'exploreShared', label: 'Explorar entre dos jugadores' },
    { value: 'pilePartition', label: 'Separar en dos montones' },
    { value: 'pileChoice', label: 'Elegir un montón' },
    { value: 'miracle', label: 'Milagro' },
    { value: 'castOffer', label: 'Lanzar: milagro' },
    { value: 'castOfferCascade', label: 'Lanzar: cascada' },
    { value: 'castOfferWindow', label: 'Lanzar: ventana gratuita' },
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
    multiTarget: 'MultiTargetSelection · CR 601.2c, hasta dos de tres',
    multiTargetExact: 'MultiTargetSelection · CR 601.2c, cuenta fija',
    distribute: 'DistributeAmong · CR 608.2d, se puede dejar fuera',
    distributeAnnounced: 'DistributeAmong · CR 601.2d, todos reciben',
    moveCounters: 'MoveCountersDistribution · CR 122.5, salen del origen',
    retarget: 'RetargetChoice · CR 115.7a, un pozo por posición',
    retargetSingle: 'RetargetChoice · CR 115.7a, «change the target»',
    chooseObjects: 'ChooseObjectsSelection · CR 608.2c, «esos» es el conjunto',
    chooseObjectsRecipient: 'ChooseObjectsSelection · CR 115.10a, sin objetivo',
    proliferate: 'ProliferateChoice · CR 701.34a, otra de cada clase',
    timeTravelRemove: 'TimeTravelChoice · CR 701.56a, primera mitad: quitar',
    timeTravelAdd: 'TimeTravelChoice · CR 701.56a, segunda mitad: poner',
    category: 'CategoryChoice · CR 101.4, un permanente por tipo',
    categoryForAll: 'CategoryChoice · CR 101.4, elige por los demás',
    copyChosen: 'EachPlayerCopyChosenSelection · CR 707.2, el orden manda',
    copyChosenNeighbor: 'EachPlayerCopyChosenSelection · CR 102.1, del vecino',
    keepPower: 'KeepWithinTotalPowerChoice · CR 107.1c, tope de fuerza',
    keepPowerForAll: 'KeepWithinTotalPowerChoice · CR 101.4, por todos',
    keepExact: 'KeepExactPermanentsChoice · CR 701.21a, exactamente tres',
    keepExactVow: 'KeepExactPermanentsChoice · CR 122.1, contador de voto',
    removeCounters: 'RemoveCountersChoice · CR 107.1c, cualquier número',
    removeCountersCapped: 'RemoveCountersChoice · CR 608.2d, hasta N en total',
    copyRetarget: 'CopyRetarget · CR 707.10c, objetivos nuevos',
    copyAnnounce: 'CopyRetarget · CR 707.12, la copia anuncia',
    vote: 'VoteChoice · CR 701.38, voto con nombre',
    voteObject: 'VoteChoice · CR 701.38b, voto sobre objetos',
    explore: 'ExploreChoice · CR 701.44d, el orden lo eliges tú',
    exploreShared: 'ExploreChoice · CR 101.4, cada jugador ordena los suyos',
    pilePartition: 'SeparatePilesPartition · CR 700.3a, dos montones',
    pileChoice: 'SeparatePilesChoice · CR 700.3, elegir lado',
    miracle: 'MiracleReveal · CR 702.94a, revelar o no',
    castOffer: 'CastOffer · CR 608.2g, milagro',
    castOfferCascade: 'CastOffer · CR 702.85a, cascada',
    castOfferWindow: 'CastOffer · CR 608.2g, ventana de lanzamiento',
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
  // CR 601.2c: two multi-target prompts, each with a card the engine quotes
  // verbatim in its own tests. `Frost Breath` says "up to two", so the window is
  // 0..2 and declining is legal; `Grusilda, Monster Masher` says "two", so the
  // count is fixed. They live only in `objects`, like the spell waiting for its X.
  const frostBreath = {
    id: 350, card_id: 350, owner: 0, controller: 0, zone: 'Stack',
    name: 'Frost Breath', card_types: { core_types: ['Instant'], subtypes: ['Spell'] },
    oracle_text: 'Tap up to two target creatures. Those creatures don\'t untap during their controller\'s next untap step.'
  } as GameObject;
  const grusilda = {
    id: 351, card_id: 351, owner: 0, controller: 0, zone: 'Battlefield',
    name: 'Grusilda, Monster Masher',
    card_types: { core_types: ['Creature'], subtypes: ['Zombie', 'Wizard'] },
    oracle_text: '{3}{B}{R}, {T}: Put two target creature cards from graveyards onto the battlefield combined into one creature under your control. (Its power is equal to their total power, its toughness is equal to their total toughness, and it has their names, mana costs, types, text boxes, etc.)'
  } as GameObject;
  // The two creature cards her ability can name: graveyard-only in `objects`, so
  // no pile count the rest of the lab asserts moves.
  const graveElves = {
    id: 352, card_id: 352, owner: 0, controller: 0, zone: 'Graveyard',
    name: 'Llanowar Elves', card_types: { core_types: ['Creature'], subtypes: ['Elf', 'Druid'] }
  } as GameObject;
  const graveBears = {
    id: 353, card_id: 353, owner: 0, controller: 0, zone: 'Graveyard',
    name: 'Grizzly Bears', card_types: { core_types: ['Creature'], subtypes: ['Bear'] }
  } as GameObject;
  // CR 122.5: the counter source, with the text the engine quotes in
  // `tests/integration/issue_680_shalai_upkeep_move.rs`.
  const forgottenAncient = {
    id: 344, card_id: 344, owner: 0, controller: 0, zone: 'Battlefield',
    name: 'Forgotten Ancient',
    card_types: { core_types: ['Creature'], subtypes: ['Elemental'] },
    // CR 701.34a: a permanent that already carries a counter is what proliferate
    // can pick — the same three +1/+1 the move-counter scene moves.
    counters: { P1P1: 3 },
    oracle_text: 'Whenever a player casts a spell, you may put a +1/+1 counter on this creature.\nAt the beginning of your upkeep, you may move any number of +1/+1 counters from this creature onto other creatures.'
  } as GameObject;
  // CR 107.1c: the card the engine tests for the total-power keep window, with its
  // verbatim text (`tests/integration/slaughter_the_strong_total_power_4380.rs`).
  const slaughterTheStrong = {
    id: 373, card_id: 373, owner: 0, controller: 0, zone: 'Stack',
    name: 'Slaughter the Strong',
    card_types: { core_types: ['Sorcery'] },
    oracle_text: 'Each player chooses any number of creatures they control with total power 4 or less, then sacrifices all other creatures they control.'
  } as GameObject;
  // CR 701.44d: "each Merfolk creature you control explores" — the clause the
  // parser's own test uses (`explore_all`), with Merfolk taken from the 10E data in
  // `data/mtgjson/10E.es.json` (real names, types and printed P/T). They live only
  // in `objects`: the prompt names them, no battlefield row changes, and the pile
  // counts the rest of the lab asserts stay put.
  const merfolkLooter = {
    id: 390, card_id: 390, owner: 0, controller: 0, zone: 'Battlefield',
    name: 'Merfolk Looter', card_types: { core_types: ['Creature'], subtypes: ['Merfolk', 'Rogue'] },
    power: 1, toughness: 1
  } as GameObject;
  const rootwaterCommando = {
    id: 391, card_id: 391, owner: 0, controller: 0, zone: 'Battlefield',
    name: 'Rootwater Commando', card_types: { core_types: ['Creature'], subtypes: ['Merfolk'] },
    power: 2, toughness: 2
  } as GameObject;
  const rootwaterMatriarch = {
    id: 392, card_id: 392, owner: 0, controller: 0, zone: 'Battlefield',
    name: 'Rootwater Matriarch', card_types: { core_types: ['Creature'], subtypes: ['Merfolk'] },
    power: 2, toughness: 3
  } as GameObject;
  const rivalMerfolkLooter = {
    id: 393, card_id: 393, owner: 1, controller: 1, zone: 'Battlefield',
    name: 'Merfolk Looter', card_types: { core_types: ['Creature'], subtypes: ['Merfolk', 'Rogue'] },
    power: 1, toughness: 1
  } as GameObject;
  const rivalRootwaterCommando = {
    id: 394, card_id: 394, owner: 1, controller: 1, zone: 'Battlefield',
    name: 'Rootwater Commando', card_types: { core_types: ['Creature'], subtypes: ['Merfolk'] },
    power: 2, toughness: 2
  } as GameObject;
  // CR 702.94a: the first card drawn in a turn with miracle. `Terminus` is the
  // printed wording the keyword asks for — the reveal offer names the card while it
  // is still in hand, and the miracle cost ({W}) is not its mana cost ({4}{W}{W}).
  // It lives only in `objects`, like the other prompt-only cards.
  const terminus = {
    id: 395, card_id: 395, owner: 0, controller: 0, zone: 'Hand',
    name: 'Terminus', card_types: { core_types: ['Sorcery'] },
    mana_cost: { type: 'Cost', shards: ['White', 'White'], generic: 4 },
    oracle_text: 'Put all creatures on the bottom of their owners\u2019 libraries.\nMiracle {W}'
  } as GameObject;
  // CR 608.2g: the free-cast window (Invoke Calamity) offers instants and sorceries
  // from the controller's graveyard. Two real cheap ones, in `objects` only.
  const graveShock = {
    id: 396, card_id: 396, owner: 0, controller: 0, zone: 'Graveyard',
    name: 'Shock', card_types: { core_types: ['Instant'] },
    mana_cost: { type: 'Cost', shards: ['Red'], generic: 0 },
    oracle_text: 'Shock deals 2 damage to any target.'
  } as GameObject;
  const graveGrowth = {
    id: 397, card_id: 397, owner: 0, controller: 0, zone: 'Graveyard',
    name: 'Giant Growth', card_types: { core_types: ['Instant'] },
    mana_cost: { type: 'Cost', shards: ['Green'], generic: 0 },
    oracle_text: 'Target creature gets +3/+3 until end of turn.'
  } as GameObject;
  // CR 101.4 + CR 701.38: the two ballot shapes. `Emissary Green` is the attack
  // trigger whose named vote the engine tests end to end (`emissary_green.rs`,
  // verbatim text); the object-pool shape carries the very clause the engine's own
  // vote test parses for Council's Judgment (the inner sentence, which is what the
  // engine reads — the fixture never claims more text than that).
  const emissaryGreen = {
    id: 385, card_id: 385, owner: 0, controller: 0, zone: 'Battlefield',
    name: 'Emissary Green',
    card_types: { core_types: ['Creature'] }, power: 3, toughness: 3,
    oracle_text: 'Whenever Emissary Green attacks, starting with you, each player votes for profit or security. You create a number of Treasure tokens equal to twice the number of profit votes. Put a number of +1/+1 counters on each creature you control equal to the number of security votes.'
  } as GameObject;
  const councilsJudgment = {
    id: 386, card_id: 386, owner: 1, controller: 1, zone: 'Stack',
    name: "Council's Judgment", card_types: { core_types: ['Sorcery'] },
    oracle_text: "Starting with you, each player votes for a nonland permanent you don't control. Exile each permanent with the most votes or tied for most votes."
  } as GameObject;
  // CR 707.10c + CR 707.12: one walk, two operations. `Twincast` is the engine's
  // no-rider control for the copy-retarget clause, and `Mizzix's Mastery` is the
  // real way a copied spell reaches the announcement walk (its copy of `Frost
  // Breath` is announced slot by slot). The copies themselves are the objects on
  // the stack: a copy keeps the printed name and text of what it copies.
  const twincast = {
    id: 382, card_id: 382, owner: 0, controller: 0, zone: 'Stack',
    name: 'Twincast', card_types: { core_types: ['Instant'] },
    oracle_text: 'Copy target instant or sorcery spell. You may choose new targets for the copy.'
  } as GameObject;
  const shockCopy = {
    id: 380, card_id: 380, owner: 0, controller: 0, zone: 'Stack',
    name: 'Shock', card_types: { core_types: ['Instant'] },
    oracle_text: 'Shock deals 2 damage to any target.'
  } as GameObject;
  const mizzixsMastery = {
    id: 384, card_id: 384, owner: 0, controller: 0, zone: 'Stack',
    name: "Mizzix's Mastery", card_types: { core_types: ['Sorcery'] },
    oracle_text: "Exile target card that's an instant or sorcery from your graveyard. For each card exiled this way, copy it, and you may cast the copy without paying its mana cost. Exile Mizzix's Mastery."
  } as GameObject;
  const frostBreathCopy = {
    id: 383, card_id: 383, owner: 0, controller: 0, zone: 'Stack',
    name: 'Frost Breath', card_types: { core_types: ['Instant'] },
    oracle_text: "Tap up to two target creatures. Those creatures don't untap during their controller's next untap step."
  } as GameObject;
  // CR 701.21a + CR 122.1: the two cards the engine tests for the exact keeper.
  // Verbatim text from `tests/integration/promise_of_loyalty.rs`: `Razia's
  // Purification` fixes the number at three, and `Promise of Loyalty` owes the kept
  // creature a vow counter, which is placed before the sacrifice.
  const raziasPurification = {
    id: 374, card_id: 374, owner: 0, controller: 0, zone: 'Stack',
    name: "Razia's Purification",
    card_types: { core_types: ['Sorcery'] },
    oracle_text: 'Each player chooses three permanents they control, then sacrifices the rest.'
  } as GameObject;
  const promiseOfLoyalty = {
    id: 375, card_id: 375, owner: 0, controller: 0, zone: 'Stack',
    name: 'Promise of Loyalty',
    card_types: { core_types: ['Sorcery'] },
    oracle_text: "Each player puts a vow counter on a creature they control and sacrifices the rest. Each of those creatures can't attack you or planeswalkers you control for as long as it has a vow counter on it."
  } as GameObject;
  // CR 107.1c + CR 608.2d: the two shapes of "remove counters", with the verbatim
  // text each one comes from in `tests/integration/rhys_evermore_remove_counters.rs`.
  // `Rhys, the Evermore` removes *any number* (no cap); `Hex Parasite` removes
  // *up to X*, so its cap is the announced X and the engine already bounded it by
  // what the source carries. Both live only in `objects`, and the bearers carry the
  // counters the engine's own tests give them: three +1/+1 and two charge for Rhys,
  // two +1/+1 and one charge for Hex Parasite.
  const rhysEvermore = {
    id: 376, card_id: 376, owner: 0, controller: 0, zone: 'Battlefield',
    name: 'Rhys, the Evermore',
    card_types: { core_types: ['Creature'], subtypes: ['Elf', 'Warrior'] },
    oracle_text: '{W}, {T}: Remove any number of counters from target creature you control. Activate only as a sorcery.'
  } as GameObject;
  const hexParasite = {
    id: 377, card_id: 377, owner: 0, controller: 0, zone: 'Battlefield',
    name: 'Hex Parasite',
    card_types: { core_types: ['Creature'], subtypes: ['Insect'] },
    oracle_text: '{X}{B/P}: Remove up to X counters from target permanent. For each counter removed this way, this creature gets +1/+0 until end of turn. ({B/P} can be paid with either {B} or 2 life.)'
  } as GameObject;
  const counterBearer = {
    id: 378, card_id: 378, owner: 0, controller: 0, zone: 'Battlefield',
    name: 'Counter Bearer', card_types: { core_types: ['Creature'] },
    power: 2, toughness: 2, counters: { P1P1: 3, charge: 2 }
  } as GameObject;
  const rivalCounterBearer = {
    id: 379, card_id: 379, owner: 1, controller: 1, zone: 'Battlefield',
    name: 'Counter Bearer', card_types: { core_types: ['Creature'] },
    power: 2, toughness: 2, counters: { P1P1: 2, charge: 1 }
  } as GameObject;
  // CR 707.2: the phenomenon whose body is one `EachPlayerCopyChosen` — the
  // verbatim text is the one in `oracle_effect/tests.rs`
  // (`each_player_copy_chosen_human_time_lord_trigger`).
  const metaCrisis = {
    id: 372, card_id: 372, owner: 0, controller: 0, zone: 'Command',
    name: 'Human—Time Lord Meta-Crisis',
    card_types: { core_types: ['Phenomenon'] }
  } as GameObject;
  // CR 101.4: the two shapes of the category choice. `Cataclysm` keeps one of each
  // type per player; `Tragic Arrogance` has the controller choose for everyone.
  // Both live only in `objects` (they are the source of the effect, not a
  // battlefield row), and carry only what the engine's own comments state.
  const cataclysm = {
    id: 370, card_id: 370, owner: 0, controller: 0, zone: 'Stack',
    name: 'Cataclysm', card_types: { core_types: ['Sorcery'] }
  } as GameObject;
  const tragicArrogance = {
    id: 371, card_id: 371, owner: 0, controller: 0, zone: 'Stack',
    name: 'Tragic Arrogance', card_types: { core_types: ['Sorcery'] }
  } as GameObject;
  // CR 701.56a: the two halves of time travel need objects with time counters.
  // `Ancestral Vision` and `Lotus Bloom` are the canonical suspend cards, and they
  // live only in `objects` (their `zone` is Exile but they are not in `state.exile`),
  // so no pile count the rest of the lab asserts moves.
  const suspendedVision = {
    id: 360, card_id: 360, owner: 0, controller: 0, zone: 'Exile',
    name: 'Ancestral Vision',
    card_types: { core_types: ['Sorcery'] },
    counters: { time: 4 }
  } as GameObject;
  const suspendedLotus = {
    id: 361, card_id: 361, owner: 0, controller: 0, zone: 'Exile',
    name: 'Lotus Bloom',
    card_types: { core_types: ['Artifact'] },
    counters: { time: 3 }
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
    [...viewerField, ...rivalField, ...viewerGrave, ...viewerExile, ...rivalGrave, ...(stackObject ? [stackObject] : []), discardSource, xSpell, modeSpell, tributeCreature, smogbelcherChariot, bonesplitter, orneryTumblewagg, entropicBattlecruiser, frostBreath, grusilda, graveElves, graveBears, forgottenAncient, suspendedVision, suspendedLotus, cataclysm, tragicArrogance, metaCrisis, slaughterTheStrong, raziasPurification, promiseOfLoyalty, rhysEvermore, hexParasite, counterBearer, rivalCounterBearer, twincast, shockCopy, mizzixsMastery, frostBreathCopy, emissaryGreen, councilsJudgment, terminus, graveShock, graveGrowth, merfolkLooter, rootwaterCommando, rootwaterMatriarch, rivalMerfolkLooter, rivalRootwaterCommando, ...searchPool, ...hand, ...rivalHand]
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
    if (scene === 'keepPower' || scene === 'keepPowerForAll') {
      // `KeepWithinTotalPowerChoice`: the window is a sum of power, not a count.
      // `Slaughter the Strong` is the card the engine tests for it. The eligible
      // creatures carry their published power, so a pick that would overflow the cap
      // is the one the block must disable: 2 + 2 + 1 = 5 over a cap of 4.
      const forAll = scene === 'keepPowerForAll';
      return {
        type: 'KeepWithinTotalPowerChoice',
        data: {
          player: 0,
          target_player: forAll ? 1 : 0,
          eligible: forAll ? [200, 201] : [100, 101, 105],
          cap: forAll ? 3 : 4,
          chooser_scope: forAll ? 'ControllerForAll' : 'EachPlayerSelf',
          source_id: 373,
          source_controller: 0,
          remaining_players: forAll ? [] : [1],
          all_kept: [],
          scoped_players: [0, 1]
        }
      };
    }
    if (scene === 'keepExact' || scene === 'keepExactVow') {
      // `KeepExactPermanentsChoice`: a fixed number, already capped by the engine.
      // `Razia's Purification` asks for three permanents out of five; `Promise of
      // Loyalty` asks for one creature and owes it a vow counter (CR 122.1) before
      // the rest is sacrificed.
      const vow = scene === 'keepExactVow';
      return {
        type: 'KeepExactPermanentsChoice',
        data: {
          player: 0,
          target_player: 0,
          eligible: vow ? [100, 101, 105] : [100, 101, 105, 102, 340],
          required_count: vow ? 1 : 3,
          keeper_counter: vow ? ['vow', 1] : null,
          chooser_scope: 'EachPlayerSelf',
          source_id: vow ? 375 : 374,
          source_controller: 0,
          remaining_players: [1],
          all_kept: [],
          scoped_players: [0, 1]
        }
      };
    }
    if (scene === 'explore' || scene === 'exploreShared') {
      // `ExploreChoice`: several permanents explore at once and their controller
      // orders them (CR 701.44d). The shared shape shows the two lists differ —
      // the rival's Merfolk are in the queue but not in this player's `choosable`,
      // because each player orders their own (CR 101.4). `source_id` is the ability
      // that caused it; this fixture has no object for it, and the block never
      // names a source it was not given.
      const shared = scene === 'exploreShared';
      return {
        type: 'ExploreChoice',
        data: {
          player: 0,
          source_id: 0,
          choosable: shared ? [390, 391] : [390, 391, 392],
          remaining: shared ? [390, 391, 393, 394] : [390, 391, 392]
        }
      };
    }
    if (scene === 'pilePartition' || scene === 'pileChoice') {
      // `SeparateIntoPiles` (CR 700.3) is three prompts in a row; the lab shows the
      // two a two-player game can reach. The viewer splits their own creatures for
      // a rival's effect (the stage-2 shape), and then picks a side for the rival's
      // piles (the stage-3 shape). The stage-1 prompt — who partitions — only
      // exists with three or more players, so it has no scene here rather than an
      // invented one. `pile_source` is the battlefield shape (CR 700.3), which is
      // what the shape's own docs call the Make an Example case.
      if (scene === 'pileChoice') {
        return {
          type: 'SeparatePilesChoice',
          data: {
            player: 0,
            pending: [],
            current: { subject: 1, pile_a: [200], pile_b: [201] },
            pile_source: { type: 'Battlefield' }
          }
        };
      }
      return {
        type: 'SeparatePilesPartition',
        data: {
          player: 0,
          eligible: [100, 101, 105],
          remaining_subjects: [],
          completed: [],
          chooser: 1,
          pile_source: { type: 'Battlefield' }
        }
      };
    }
    if (scene === 'miracle') {
      // `MiracleReveal` (CR 702.94a) names the drawn card and the cost the offer
      // latched; the reveal is the answer, and the cast comes later (CR 608.2g).
      return {
        type: 'MiracleReveal',
        data: {
          player: 0,
          object_id: 395,
          cost: { type: 'Cost', shards: ['White'], generic: 0 }
        }
      };
    }
    if (scene === 'castOffer' || scene === 'castOfferCascade' || scene === 'castOfferWindow') {
      // `CastOffer` (CR 608.2g) is one variant with nine shapes. The lab shows the
      // three that ask different things: the miracle cast that follows the reveal,
      // a cascade hit gated by the source's mana value, and a free-cast window with
      // candidates and a budget. Only the fields this view reads are published.
      if (scene === 'castOfferCascade') {
        return {
          type: 'CastOffer',
          data: {
            player: 0,
            kind: {
              type: 'Cascade',
              hit_card: 300,
              exiled_misses: [401, 403],
              source_mv: 4,
              source_id: 384
            }
          }
        };
      }
      if (scene === 'castOfferWindow') {
        return {
          type: 'CastOffer',
          data: {
            player: 0,
            kind: {
              type: 'FreeCastWindow',
              candidates: [396, 397],
              remaining_casts: 2,
              remaining_mv_budget: 4,
              zones: ['Graveyard'],
              member_pool: []
            }
          }
        };
      }
      return {
        type: 'CastOffer',
        data: {
          player: 0,
          kind: { type: 'Miracle', object_id: 395, cost: { type: 'Cost', shards: ['White'], generic: 0 } }
        }
      };
    }
    if (scene === 'vote' || scene === 'voteObject') {
      // `VoteChoice`: the engine runs the vote as a session in APNAP order.
      //   - `vote`: Emissary Green's named vote, first ballot, nobody has voted.
      //   - `voteObject`: Council's Judgment cast by the rival, so its controller
      //     votes first and the viewer answers second: one ballot is already
      //     tallied, and the candidates are the permanents the caster doesn't
      //     control (CR 701.38b, index-based because names repeat).
      if (scene === 'voteObject') {
        return {
          type: 'VoteChoice',
          data: {
            player: 0,
            remaining_votes: 1,
            options: ['bears', 'lions'],
            option_labels: ['Grizzly Bears', 'Savannah Lions'],
            remaining_voters: [],
            tallies: [1, 0],
            ballots: [[1, 0]],
            candidate_objects: [100, 101],
            controller: 1,
            source_id: 386,
            actor: 'SubjectActs',
            tally_mode: 'TopVotes',
            visibility: 'Open',
            chain_root_targets: []
          }
        };
      }
      return {
        type: 'VoteChoice',
        data: {
          player: 0,
          remaining_votes: 1,
          options: ['profit', 'security'],
          option_labels: ['Profit', 'Security'],
          remaining_voters: [[1, 1]],
          tallies: [0, 0],
          ballots: [],
          candidate_objects: [],
          controller: 0,
          source_id: 385,
          actor: 'SubjectActs',
          tally_mode: 'PerVote',
          visibility: 'Open',
          chain_root_targets: []
        }
      };
    }
    if (scene === 'removeCounters' || scene === 'removeCountersCapped') {
      // `RemoveCountersChoice`: the pool is the counters actually on the source, and
      // `max_total` is the only thing the text may cap. `pending_effect` is omitted
      // on purpose: it is the engine's own bookkeeping — this fixture never runs it,
      // and the block does not read it, so writing one here would be an invention.
      const capped = scene === 'removeCountersCapped';
      return {
        type: 'RemoveCountersChoice',
        data: {
          player: 0,
          source_id: capped ? 379 : 378,
          counter_type: null,
          available: capped ? [['P1P1', 2], ['charge', 1]] : [['P1P1', 3], ['charge', 2]],
          max_total: capped ? 2 : null
        }
      };
    }
    if (scene === 'copyRetarget' || scene === 'copyAnnounce') {
      // `CopyRetarget`: the engine walks the slots one answer at a time, so the
      // fixture shows a walk mid-step. The retarget shape keeps its announced
      // target and offers new ones (with `can_keep_rest`); the announcement shape
      // is the copy `Mizzix's Mastery` casts, already past its first (optional)
      // slot, which may be declined (CR 115.6) and has nothing to keep (CR 707.12).
      if (scene === 'copyAnnounce') {
        return {
          type: 'CopyRetarget',
          data: {
            player: 0,
            copy_id: 383,
            target_slots: [
              {
                current: null,
                legal_alternatives: [{ Object: 200 }, { Object: 201 }],
                can_keep: false,
                can_decline: true
              },
              {
                current: null,
                legal_alternatives: [{ Object: 100 }, { Object: 101 }],
                can_keep: false,
                can_decline: true
              }
            ],
            current_slot: 1,
            picks: [{ Object: 200 }],
            can_keep_rest: false,
            mode: 'Announce'
          }
        };
      }
      return {
        type: 'CopyRetarget',
        data: {
          player: 0,
          copy_id: 380,
          target_slots: [
            {
              current: { Object: 200 },
              legal_alternatives: [{ Object: 100 }, { Object: 101 }, { Player: 1 }],
              can_keep: true,
              can_decline: false
            }
          ],
          current_slot: 0,
          picks: [],
          can_keep_rest: true,
          mode: 'Retarget'
        }
      };
    }
    if (scene === 'copyChosen' || scene === 'copyChosenNeighbor') {
      // `EachPlayerCopyChosenSelection`: min 1, max 2, and the order decides what
      // is copied and what only scales the copy. The neighbour shape changes whose
      // battlefield the pool comes from (CR 102.1) and carries what the earlier
      // player already chose, because nothing is applied until the set is complete.
      const neighbor = scene === 'copyChosenNeighbor';
      return {
        type: 'EachPlayerCopyChosenSelection',
        data: {
          player: 0,
          eligible: neighbor ? [{ Object: 200 }, { Object: 201 }] : [{ Object: 100 }, { Object: 101 }, { Object: 105 }],
          min: 1,
          max: 2,
          copy_modifications: [],
          scale: { counter_type: 'P1P1', scale_property: 'Power' },
          choose_scope: neighbor ? { type: 'Neighbor', direction: 'Left' } : { type: 'Chooser' },
          source_id: 372,
          source_controller: 1,
          remaining_players: neighbor ? [] : [1],
          all_choices: neighbor ? [{ player: 1, chosen: [101] }] : [],
          scoped_players: neighbor ? [1, 0] : [0, 1]
        }
      };
    }
    if (scene === 'category' || scene === 'categoryForAll') {
      // `CategoryChoice`: one candidate list per category, aligned with
      // `categories`. `Cataclysm` is the \"each player for their own\" shape and
      // `Tragic Arrogance` the \"controller chooses for all\" one; the engine names
      // both in `effects/choose_and_sacrifice_rest.rs`. The artifact is
      // `Bonesplitter` and the lands are the fixture's Forests, so every candidate
      // is an object the lab already has — and one category (Enchantment) has none,
      // which is exactly when the engine expects a `null` slot.
      const forAll = scene === 'categoryForAll';
      return {
        type: 'CategoryChoice',
        data: {
          player: 0,
          target_player: forAll ? 1 : 0,
          categories: forAll
            ? ['Artifact', 'Creature', 'Enchantment', 'Planeswalker']
            : ['Artifact', 'Creature', 'Enchantment', 'Land'],
          chooser_scope: forAll ? 'ControllerForAll' : 'EachPlayerSelf',
          source_controller: 0,
          eligible_per_category: forAll
            ? [[341], [200, 201], [], [205]]
            : [[341], [100, 101, 105], [], [102, 103, 104]],
          source_id: forAll ? 371 : 370,
          remaining_players: forAll ? [] : [1],
          all_kept: [],
          scoped_players: [0, 1]
        }
      };
    }
    if (scene === 'proliferate' || scene === 'timeTravelRemove' || scene === 'timeTravelAdd') {
      // `ProliferateChoice`: everything that already carries a counter — permanents
      // and, for poison or energy, the seats. `Steady Progress` ("Proliferate.") is
      // the card whose own text the engine quotes. `TimeTravelChoice` is the same
      // gesture in two halves; `Ancestral Vision` and `Lotus Bloom` are suspended
      // cards with time counters, which is the common case the engine names.
      if (scene === 'proliferate') {
        return {
          type: 'ProliferateChoice',
          data: {
            player: 0,
            eligible: [{ Object: 205 }, { Object: 344 }, { Player: 0 }, { Player: 1 }]
          }
        };
      }
      const adding = scene === 'timeTravelAdd';
      return {
        type: 'TimeTravelChoice',
        data: {
          player: 0,
          // After the remove half the just-chosen object is gone from the list:
          // each object gets at most one of add/remove (CR 701.56a).
          eligible: adding ? [{ Object: 361 }] : [{ Object: 360 }, { Object: 361 }],
          phase: { type: adding ? 'Add' : 'Remove' }
        }
      };
    }
    if (scene === 'chooseObjects' || scene === 'chooseObjectsRecipient') {
      // `ChooseObjectsSelection`: the eligible set and the window the engine
      // enforces. `Magnetic Mountain` ("choose any number of tapped blue creatures
      // … pay {4} for each creature chosen this way") is the "any number" shape —
      // `max` absent — and `Comet, Stellar Pup` names a described damage recipient
      // ("a creature or player"), which is the one case where a seat is eligible
      // and the pick is still not a target (CR 115.10a).
      const recipient = scene === 'chooseObjectsRecipient';
      return {
        type: 'ChooseObjectsSelection',
        data: recipient
          ? {
              player: 0,
              eligible: [{ Object: 200 }, { Object: 100 }, { Player: 1 }, { Player: 0 }],
              min: 1,
              max: 1,
              trigger_event: { type: 'SpellCast', data: { player_id: 1, object_id: 1002 } }
            }
          : {
              // `max` is deliberately absent: "any number" clamps to what is eligible.
              player: 0,
              eligible: [{ Object: 100 }, { Object: 101 }, { Object: 105 }],
              min: 0,
              trigger_event: { type: 'StepBegins', data: { player_id: 0, phase: 'Upkeep' } }
            }
      };
    }
    if (scene === 'retarget' || scene === 'retargetSingle') {
      // `RetargetChoice`: the declared targets and, per position, what that
      // position admits. `Frost Breath` ("tap up to two target creatures") is the
      // two-target spell — both declared targets are creatures, and the pools say
      // which creatures each position may name. `Lightning Bolt` ("deals 3 damage
      // to any target") is the one-target case, so its alternatives include the
      // seats. Both texts are the engine's, and every offered target is an object
      // this fixture already has.
      const single = scene === 'retargetSingle';
      return {
        type: 'RetargetChoice',
        data: {
          player: 0,
          stack_entry_index: 0,
          scope: single ? { type: 'Single' } : { type: 'All' },
          current_targets: single ? [{ Object: 200 }] : [{ Object: 200 }, { Object: 201 }],
          slots: single
            ? [{ path: [], slot: 0 }]
            : [{ path: [], slot: 0 }, { path: [], slot: 1 }],
          slot_pools: single
            ? [[{ Object: 200 }, { Object: 101 }, { Object: 105 }, { Player: 0 }, { Player: 1 }]]
            : [[{ Object: 200 }, { Object: 101 }, { Object: 105 }], [{ Object: 201 }, { Object: 100 }, { Object: 105 }]],
          keep_is_distinct: single ? [false] : [false, false],
          legal_new_targets: single
            ? [{ Object: 200 }, { Object: 101 }, { Object: 105 }, { Player: 0 }, { Player: 1 }]
            : [{ Object: 200 }, { Object: 201 }, { Object: 101 }, { Object: 100 }, { Object: 105 }]
        }
      };
    }
    if (scene === 'moveCounters') {
      // `MoveCountersDistribution`: what the source holds, by type, and where it
      // may go. `Forgotten Ancient` is the card whose own text the engine quotes
      // for this shape ("move any number of +1/+1 counters from this creature
      // onto other creatures").
      return {
        type: 'MoveCountersDistribution',
        data: {
          player: 0,
          source_id: 344,
          available: [['P1P1', 3]],
          destinations: [100, 105, 200],
          pending_effect: { ability: {} }
        }
      };
    }
    if (scene === 'distribute' || scene === 'distributeAnnounced') {
      // `DistributeAmong`: the amount, the recipients and when the division is
      // chosen. At resolution (CR 608.2d) candidates may be left out; announced
      // (CR 601.2d) every target must receive at least one.
      const announced = scene === 'distributeAnnounced';
      return {
        type: 'DistributeAmong',
        data: {
          player: 0,
          total: announced ? 4 : 5,
          targets: announced ? [{ Object: 100 }, { Object: 101 }] : [{ Object: 100 }, { Object: 101 }, { Object: 200 }],
          unit: { type: 'Damage' },
          ...(announced ? {} : { scope: { type: 'ResolutionCandidates', data: { pending_effect: { ability: {} } } } })
        }
      };
    }
    if (scene === 'multiTarget' || scene === 'multiTargetExact') {
      // `MultiTargetSelection`: the legal targets and the window the engine
      // enforces. `pending_ability.source_id` is attribution only, and it is what
      // lets the block name the spell.
      const upToTwo = scene === 'multiTarget';
      return {
        type: 'MultiTargetSelection',
        data: {
          player: 0,
          legal_targets: upToTwo ? [100, 101, 105] : [352, 353],
          min_targets: upToTwo ? 0 : 2,
          max_targets: 2,
          pending_ability: { ability: {}, source_id: upToTwo ? 350 : 351 }
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
          : scene === 'crew' || scene === 'saddle' || scene === 'equip' || scene === 'station' || scene === 'multiTarget' || scene === 'multiTargetExact' || scene === 'distribute' || scene === 'distributeAnnounced' || scene === 'moveCounters' || scene === 'retarget' || scene === 'retargetSingle' || scene === 'chooseObjects' || scene === 'chooseObjectsRecipient' || scene === 'proliferate' || scene === 'timeTravelRemove' || scene === 'timeTravelAdd' || scene === 'category' || scene === 'categoryForAll' || scene === 'copyChosen' || scene === 'copyChosenNeighbor' || scene === 'keepPower' || scene === 'keepPowerForAll' || scene === 'keepExact' || scene === 'keepExactVow' || scene === 'removeCounters' || scene === 'removeCountersCapped' || scene === 'copyRetarget' || scene === 'copyAnnounce' || scene === 'vote' || scene === 'voteObject' || scene === 'explore' || scene === 'exploreShared' || scene === 'pilePartition' || scene === 'pileChoice' ? 'PreCombatMain'
          : scene === 'miracle' ? 'Draw'
          : scene === 'castOffer' || scene === 'castOfferCascade' || scene === 'castOfferWindow' ? 'PreCombatMain'
          : scene === 'discard' || scene === 'discardUpTo' ? 'PreCombatMain'
          : scene === 'combat' ? 'DeclareBlockers'
          : scene === 'damage' ? 'CombatDamage'
          : scene === 'attackers' ? 'DeclareAttackers'
          : 'PreCombatMain',
        waiting_for: waiting(),
        players: seats,
        battlefield: [...viewerField, ...rivalField].map((object) => object.id),
        stack: scene === 'targets'
          ? [{ id: 7, source_id: 300, controller: 0 }]
          : scene === 'retarget' || scene === 'retargetSingle'
            ? [{ id: 7, source_id: scene === 'retarget' ? 350 : 300, controller: 0 }]
            : [],
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
        {#if scene === 'multiTarget' || scene === 'multiTargetExact'}<MultiTargetPrompt />{/if}
        {#if scene === 'distribute' || scene === 'distributeAnnounced'}<DistributePrompt />{/if}
        {#if scene === 'moveCounters'}<MoveCountersPrompt />{/if}
        {#if scene === 'retarget' || scene === 'retargetSingle'}<RetargetPrompt />{/if}
        {#if scene === 'chooseObjects' || scene === 'chooseObjectsRecipient'}<ChooseObjectsPrompt />{/if}
        {#if scene === 'proliferate'}<ProliferatePrompt />{/if}
        {#if scene === 'timeTravelRemove' || scene === 'timeTravelAdd'}<TimeTravelPrompt />{/if}
        {#if scene === 'category' || scene === 'categoryForAll'}<CategoryPrompt />{/if}
        {#if scene === 'copyChosen' || scene === 'copyChosenNeighbor'}<CopyChosenPrompt />{/if}
        {#if scene === 'keepPower' || scene === 'keepPowerForAll'}<KeepPowerPrompt />{/if}
        {#if scene === 'keepExact' || scene === 'keepExactVow'}<KeepExactPrompt />{/if}
        {#if scene === 'removeCounters' || scene === 'removeCountersCapped'}<RemoveCountersPrompt />{/if}
        {#if scene === 'copyRetarget' || scene === 'copyAnnounce'}<CopyRetargetPrompt />{/if}
        {#if scene === 'vote' || scene === 'voteObject'}<VotePrompt />{/if}
        {#if scene === 'explore' || scene === 'exploreShared'}<ExploreChoicePrompt />{/if}
        {#if scene === 'pilePartition' || scene === 'pileChoice'}<SeparatePilesPrompt />{/if}
        {#if scene === 'miracle'}<MiracleRevealPrompt />{/if}
        {#if scene === 'castOffer' || scene === 'castOfferCascade' || scene === 'castOfferWindow'}<CastOfferPrompt />{/if}
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

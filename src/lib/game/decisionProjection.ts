/**
 * UX-DECISION 1.0 · proyección pura de las decisiones de Phase.
 *
 * Phase es la autoridad mecánica; este módulo es sólo una *proyección de
 * presentación*. No decide qué es legal, no calcula objetivos, no predice daño
 * y no reimplementa ninguna regla de Magic. Su entrada son los DTO que ya
 * publica el puente (`EngineSnapshot.legal.actions`, `legal.by_object`,
 * `state.waiting_for`, `state.stack`) y su salida es una organización de esos
 * mismos datos en seis superficies: información contextual, acción principal,
 * elecciones estratégicas, acciones secundarias, controles avanzados y
 * cancelación.
 *
 * Dos garantías explícitas, comprobadas por pruebas:
 *
 *  1. **Ninguna acción legal desaparece.** `integrity.unclassified` debe ser
 *     vacío: toda acción global de `legal.actions` termina en algún nivel, y
 *     las acciones de `legal.by_object` siguen en el tablero. Bajar la densidad
 *     visual es reorganizar, nunca podar.
 *  2. **Ninguna elección estratégica se vuelve automática.** Sólo se promueve
 *     a `primary` una acción que no elimina alternativas: ceder prioridad,
 *     confirmar un borrador de combate, confirmar un pago o conservar la mano
 *     inicial. Las demás opciones legales siguen visibles bajo demanda.
 *
 * La proyección no lee `session`, `localStorage` ni el DOM: es una función pura,
 * determinista y testeable con snapshots sintéticos.
 */
import type { AttackTarget, EngineSnapshot, GameAction, GameObject, ObjectId } from '#lib/engine/types.ts';
import { actionObjectId, attackDeclaration, blockDeclaration, manualCast } from '#lib/game/interaction.ts';
import { describeAction, isKeepHand } from '#lib/game/actions.ts';

export type DecisionTier = 'primary' | 'strategic' | 'secondary' | 'advanced' | 'cancel';

/** Decisiones que un componente especializado ya resuelve y que esta
 * proyección no debe sustituir. Es la lista de cobertura de `DecisionPanel`;
 * un test de integridad comprueba que el panel sigue declarándola completa. */
export const SPECIALIST_DECISIONS = new Set([
  'Priority', 'MulliganDecision', 'DiscardToHandSize', 'ConniveDiscard', 'TargetSelection',
  'TriggerTargetSelection', 'ManaPayment', 'ManaAbilityManaPayment', 'ManaSourceSelection',
  'DeclareAttackers', 'DeclareBlockers', 'AssignCombatDamage', 'AssignBlockerDamage',
  'DiscardChoice', 'WardDiscardChoice', 'ChooseXValue', 'OrderTriggers', 'ModeChoice',
  'AbilityModeChoice', 'SearchChoice', 'DigChoice', 'OptionalEffectChoice', 'OpponentMayChoice',
  'PayAmountChoice', 'RevealChoice', 'PairChoice', 'ChooseTokenHost', 'GameOver',
  'UnlessPayment', 'UnlessPaymentChooseCost', 'TributeChoice', 'WardSacrificeChoice',
  'ChooseStartingPlayer', 'ScryChoice', 'SurveilChoice', 'CrewVehicle', 'SaddleMount',
  'EquipTarget', 'StationTarget', 'MultiTargetSelection', 'DistributeAmong',
  'MoveCountersDistribution', 'RetargetChoice', 'ChooseObjectsSelection', 'ProliferateChoice',
  'TimeTravelChoice', 'CategoryChoice', 'EachPlayerCopyChosenSelection',
  'KeepWithinTotalPowerChoice', 'KeepExactPermanentsChoice', 'RemoveCountersChoice',
  'CopyRetarget', 'VoteChoice', 'ExploreChoice', 'SeparatePilesChooseOpponent',
  'SeparatePilesPartition', 'SeparatePilesChoice', 'MiracleReveal', 'CastOffer',
  'MeldPairChoice', 'MeldAttackTargetChoice', 'EntryAttackTargetChoice', 'ReplacementChoice',
  'CopyTargetChoice', 'ResolveAllConsent', 'UntapChoice', 'ChooseUntapSubset', 'ExertChoice',
  'EnlistChoice', 'PayCost', 'PhyrexianPayment', 'CombatTaxPayment', 'OptionalCostChoice',
  'DefilerPayment', 'ChooseFromZoneChoice', 'ModalFaceChoice', 'AlternativeCastChoice',
  'CastingVariantChoice', 'ChoosePermanentTypeSlot', 'SpliceOffer', 'MutateMergeChoice',
  'CipherEncodeChoice', 'OrderCostReductions', 'ResolutionOptionalPaymentChoice',
  'ChooseGiftRecipient', 'TopOrBottomChoice', 'ClashChooseOpponent', 'ClashCardPlacement',
  'BetweenGamesSideboard', 'BetweenGamesChoosePlayDraw', 'RippleBottomOrder',
  'RevealUntilBottomOrder', 'DigBottomOrder', 'ChooseRingBearer', 'ChooseLegend',
  'BattleProtectorChoice', 'ChooseDungeon', 'ChooseDungeonRoom', 'BeholdChoice',
  'PopulateChoice', 'SpecializeColor', 'ChooseRoomDoor', 'BlightChoice', 'HarmonizeTapChoice',
  'UnlessBounceChoice', 'EffectZoneChoice', 'HeroEventChoice', 'DrawnThisTurnTopdeckChoice',
  'SearchPartitionChoice', 'ReplacementDecisionOrder'
]);

export interface ProjectedAction {
  /** Identidad estable de la acción, para `key` de Svelte y para auditoría. */
  key: string;
  label: string;
  hint?: string;
  action: GameAction;
  /** La acción consume su propia carta (cycling, channel, copia preparada):
   * el motor lo publica como `consumes_source`. Nunca se auto-despacha. */
  confirmation?: 'card-consuming';
  origin: 'legal.actions' | 'draft' | 'preference' | 'navigation';
  /** Un control derivado, no una `GameAction` tal como la publicó el motor. */
  panel?: 'phase-stops' | 'priority-mode' | 'payment-mode' | 'inspect';
  /** UX-DECISION 1.1: carta a la que está vinculado un comando derivado. */
  boundObjectId?: ObjectId;
  /** Identidad (`stableKey`) del lanzamiento concreto del que deriva. Dos
   * alternativas de la misma carta tienen claves distintas. */
  boundCastKey?: string;
  /** El control no cambia una preferencia global: al pulsarlo se *inicia* el
   * lanzamiento vinculado, con el modo de pago indicado. */
  startsCast?: boolean;
}

export interface DecisionContextInfo {
  turn: number;
  phase: string;
  phaseLabel: string;
  activePlayer: number;
  priorityPlayer: number;
  viewer: number;
  viewerHasPriority: boolean;
  waitingKind: string;
  stackCount: number;
  /** Intención del jugador en una palabra: «Jugar», «Responder», «Atacar»… */
  intent: string;
  /** Información necesaria para decidir, tomada de los DTO del motor. */
  needed: string[];
  /** Qué ocurrirá si se pulsa la acción principal. Nunca promete un cambio de
   * fase que una sola cesión de prioridad no garantiza (CR 117.3d / 500.2). */
  consequence: string;
  /** Metadatos de la ventana, no reglas: obligatoria / opcional. */
  obligatory: boolean;
  optional: boolean;
  /** Progreso publicado por Phase en decisiones multiobjetivo. */
  targetProgress: { current: number; total: number; label?: string | null } | null;
  /** Sugerencias que Phase ya calculó y el puente publica en `derived`. */
  engineSuggestions: { combatDamage: boolean; manaPayment: boolean; namedChoices: number };
}

export interface DecisionTiers {
  strategic: ProjectedAction[];
  secondary: ProjectedAction[];
  advanced: ProjectedAction[];
  cancel: ProjectedAction[];
}

export interface DecisionIntegrity {
  /** Acciones globales publicadas por el motor. */
  total: number;
  /** Acciones globales clasificadas en algún nivel. */
  classified: number;
  unclassified: GameAction[];
  /** Acciones por objeto, que siguen ofreciéndose en el tablero. */
  byObject: number;
  ok: boolean;
}

export interface DecisionProjection {
  context: DecisionContextInfo;
  primary: ProjectedAction | null;
  tiers: DecisionTiers;
  /** Un componente especializado está resolviendo la ventana: la superficie
   * contextual sigue activa, pero no se le superponen botones genéricos. */
  specialistActive: boolean;
  integrity: DecisionIntegrity;
  counters: Record<DecisionTier | 'visible', number>;
}

export interface ProjectionInput {
  snapshot: EngineSnapshot | null;
  /** Selección local de la UI. No altera la legalidad: sólo decide qué
   * acciones por objeto se muestran en la superficie de la carta. */
  selectedId?: ObjectId | null;
  attackDraft?: Record<string, AttackTarget>;
  blockDraft?: Record<string, ObjectId>;
  /** El panel ya tiene un componente especializado activo para esta ventana. */
  specialistActive?: boolean;
  /** Hay una carta seleccionada: su propia superficie (inspeccionar / lanzar)
   * es la acción dominante y la proyección no debe competir con ella. */
  suppressPrimary?: boolean;
  /** UX-DECISION 1.1: lanzamiento elegido explícitamente (`stableKey`). Es la
   * única vía para vincular un pago cuando una carta tiene dos alternativas:
   * la carta sola no identifica cuál de las dos quiere el jugador. */
  selectedCastKey?: string;
}

const PHASE_LABELS: Record<string, string> = {
  Untap: 'Enderezar', Upkeep: 'Mantenimiento', Draw: 'Robar',
  PreCombatMain: 'Fase principal', BeginCombat: 'Inicio de combate',
  DeclareAttackers: 'Declarar atacantes', DeclareBlockers: 'Declarar bloqueadoras',
  CombatDamage: 'Daño de combate', EndCombat: 'Fin de combate',
  PostCombatMain: 'Fase principal posterior', End: 'Final', Cleanup: 'Limpieza'
};

const MANA_ACTIONS = new Set([
  'TapLandForMana', 'ActivateManaSource', 'TapForConvoke', 'UntapLandForMana',
  'BackToManaPayment', 'PayManaAbilityMana', 'ChooseManaColor'
]);
const CANCEL_ACTIONS = new Set(['CancelCast', 'BackToManaPayment']);
const ADVANCED_ACTIONS = new Set(['SetPriorityPassingMode']);
const CARD_CONSUMING_ACTIONS = new Set(['CastPreparedCopy']);

export function stableKey(action: GameAction): string {
  const data = action.data ?? {};
  const keys = Object.keys(data).sort();
  const ordered: Record<string, unknown> = {};
  for (const key of keys) ordered[key] = data[key];
  return `${action.type}:${JSON.stringify(ordered)}`;
}

function unique(actions: GameAction[]): GameAction[] {
  const seen = new Set<string>();
  const out: GameAction[] = [];
  for (const action of actions) {
    const key = stableKey(action);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(action);
  }
  return out;
}

/**
 * Espejo de `requiresConfirmation` del cliente de Phase: la bandera
 * `consumes_source` la calcula el motor (`AbilityDefinition::consumes_source`)
 * y llega en `GameObject.abilities`. Aquí sólo se lee. Una carta que se
 * descarta a sí misma (cycling, channel) nunca puede ejecutarse con el toque
 * destinado a inspeccionarla.
 */
export function cardConsumesSource(action: GameAction, objects: Record<string, GameObject>): boolean {
  if (CARD_CONSUMING_ACTIONS.has(action.type)) return true;
  if (action.type !== 'ActivateAbility') return false;
  const index = action.data?.ability_index;
  const id = actionObjectId(action);
  if (typeof index !== 'number' || id === undefined) return false;
  const ability = (objects[String(id)]?.abilities as Record<string, unknown>[] | undefined)?.[index];
  return ability?.consumes_source === true;
}

function projected(action: GameAction, objects: Record<string, GameObject>, origin: ProjectedAction['origin'] = 'legal.actions'): ProjectedAction {
  // Copia defensiva: la pureza de la proyección no puede depender de que el
  // llamador mutara después el snapshot de Phase.
  return {
    key: stableKey(action),
    label: describeAction(action, objects),
    action: JSON.parse(JSON.stringify(action)) as GameAction,
    origin,
    ...(cardConsumesSource(action, objects) ? { confirmation: 'card-consuming' as const } : {})
  };
}

function targetProgress(snapshot: EngineSnapshot): DecisionContextInfo['targetProgress'] {
  const selection = snapshot.state.waiting_for.data?.selection;
  const slots = snapshot.state.waiting_for.data?.target_slots;
  if (!selection) return null;
  const total = Array.isArray(slots) ? slots.length : Math.max(1, selection.current_slot + 1);
  const labels = snapshot.state.waiting_for.data?.mode_labels;
  return { current: selection.current_slot + 1, total, label: labels?.[selection.current_slot] ?? null };
}

function engineSuggestions(snapshot: EngineSnapshot): DecisionContextInfo['engineSuggestions'] {
  const derived = snapshot.derived ?? {};
  const named = derived.named_choice_suggestions;
  return {
    combatDamage: derived.combat_damage_suggestion !== null && derived.combat_damage_suggestion !== undefined,
    manaPayment: derived.mana_ability_payment !== null && derived.mana_ability_payment !== undefined,
    namedChoices: Array.isArray(named) ? named.length : 0
  };
}

function contextOf(snapshot: EngineSnapshot, attackDraft: Record<string, AttackTarget>, blockDraft: Record<string, ObjectId>): DecisionContextInfo {
  const state = snapshot.state;
  const kind = state.waiting_for.type;
  const stackCount = state.stack?.length ?? 0;
  const viewerHasPriority = state.priority_player === snapshot.viewer;
  const ownTurn = state.active_player === snapshot.viewer;
  const phaseLabel = PHASE_LABELS[state.phase] ?? state.phase;
  const waitingData = state.waiting_for.data ?? {};
  const needed: string[] = [`Turno ${state.turn_number} · ${phaseLabel}`, `Prioridad: Jugador ${state.priority_player + 1}`];
  if (stackCount) needed.push(`${stackCount} hechizo(s) o habilidad(es) en la pila`);
  const progress = targetProgress(snapshot);
  if (progress) needed.push(`Objetivo ${progress.current} de ${progress.total}${progress.label ? ` · ${progress.label}` : ''}`);
  if (waitingData.attacker_constraints && Object.keys(waitingData.attacker_constraints).length) needed.push('Hay obligaciones de ataque publicadas por Phase');
  if (waitingData.block_requirements && Object.keys(waitingData.block_requirements).length) needed.push('Hay requisitos de bloqueo publicados por Phase');

  let intent = 'Decidir';
  let consequence = 'La decisión la resuelve el componente especializado; todas las opciones legales siguen disponibles.';
  if (kind === 'Priority') {
    intent = !ownTurn ? 'Responder' : stackCount ? 'Jugar o responder' : 'Jugar';
    if (!ownTurn) consequence = `Estás respondiendo en el turno del Jugador ${state.active_player + 1}. Pasar devuelve la prioridad al jugador activo.`;
    else if (stackCount) consequence = 'Das la oportunidad de responder. El hechizo de la pila sólo se resolverá cuando todos los jugadores pasen; Phase decide cuándo.';
    else consequence = 'Cedes la prioridad. Phase decidirá si el paso continúa; una sola cesión no garantiza un cambio de fase.';
  } else if (kind === 'TargetSelection' || kind === 'TriggerTargetSelection' || kind === 'MultiTargetSelection') {
    intent = 'Elegir objetivos';
    consequence = 'Selecciona en el tablero los objetos resaltados, o usa la lista accesible. Phase valida cada objetivo.';
  } else if (kind === 'ManaPayment' || kind === 'ManaAbilityManaPayment' || kind === 'ManaSourceSelection' || kind === 'UnlessPayment') {
    intent = 'Pagar';
    consequence = 'Phase comprobará el coste con el maná que hayas producido; el pago automático no requiere abrir controles manuales.';
  } else if (kind === 'DeclareAttackers') {
    intent = 'Atacar';
    const count = Object.keys(attackDraft).length;
    consequence = count
      ? `Confirmas ${count} atacante(s). Phase valida obligaciones, restricciones y destinos legales antes de aceptar la declaración.`
      : 'No atacas. Phase pasa a la siguiente ventana de combate cuando corresponda.';
  } else if (kind === 'DeclareBlockers') {
    intent = 'Bloquear';
    const count = Object.keys(blockDraft).length;
    consequence = count
      ? `Confirmas ${count} bloqueo(s). Phase valida las asignaciones y los requisitos de bloqueo.`
      : 'No bloqueas. Phase continúa con el daño de combate cuando corresponda.';
  }

  return {
    turn: state.turn_number, phase: state.phase, phaseLabel,
    activePlayer: state.active_player, priorityPlayer: state.priority_player,
    viewer: snapshot.viewer, viewerHasPriority, waitingKind: kind, stackCount,
    intent, needed, consequence,
    obligatory: kind === 'KeepExactPermanentsChoice' || kind === 'DiscardToHandSize' || kind === 'PayCost' || kind === 'DeclareAttackers' || kind === 'DeclareBlockers',
    optional: kind === 'OptionalEffectChoice' || kind === 'OpponentMayChoice' || kind === 'CastOffer' || kind === 'ResolveAllConsent',
    targetProgress: progress,
    engineSuggestions: engineSuggestions(snapshot)
  };
}

/** Etiqueta del botón principal. Conserva las palabras que las pruebas y los
 * jugadores ya conocen («Pasar», «Confirmar pago», «No atacar») y añade la
 * consecuencia como información separada, no como promesa de fase. */
function primaryLabel(snapshot: EngineSnapshot, action: GameAction, attackDraft: Record<string, AttackTarget>, blockDraft: Record<string, ObjectId>): string {
  const kind = snapshot.state.waiting_for.type;
  const stackCount = snapshot.state.stack?.length ?? 0;
  if (action.type === 'PassPriority') {
    if (kind === 'ManaPayment' || kind === 'ManaAbilityManaPayment' || kind === 'ManaSourceSelection' || kind === 'UnlessPayment') return 'Confirmar pago';
    if (stackCount) return 'Pasar · permitir respuestas';
    return 'Pasar';
  }
  if (action.type === 'DeclareAttackers') {
    const count = Object.keys(attackDraft).length;
    return count ? `Confirmar ataque (${count})` : 'No atacar';
  }
  if (action.type === 'DeclareBlockers') {
    const count = Object.keys(blockDraft).length;
    return count ? `Confirmar bloqueos (${count})` : 'No bloquear';
  }
  return describeAction(action);
}

/**
 * Proyecta una decisión. Se llama una vez por snapshot y su resultado es
 * inmutable: `busy`, `stale_action`, rechazos y reintentos pertenecen al
 * despacho (`session.dispatch`), no a la proyección.
 */
export function projectDecision(input: ProjectionInput): DecisionProjection | null {
  const snapshot = input.snapshot;
  if (!snapshot) return null;
  const objects = snapshot.state.objects ?? {};
  const attackDraft = input.attackDraft ?? {};
  const blockDraft = input.blockDraft ?? {};
  const context = contextOf(snapshot, attackDraft, blockDraft);
  const specialistActive = input.specialistActive ?? false;
  const actions = unique(snapshot.legal.actions ?? []);
  const byObject = Object.values(snapshot.legal.by_object ?? {}).reduce((sum, list) => sum + list.length, 0);
  const tiers: DecisionTiers = { strategic: [], secondary: [], advanced: [], cancel: [] };
  const classified = new Set<string>();
  let primary: ProjectedAction | null = null;

  const kind = context.waitingKind;
  const combatWindow = kind === 'DeclareAttackers' || kind === 'DeclareBlockers';
  const manaWindow = ['ManaPayment', 'ManaAbilityManaPayment', 'ManaSourceSelection', 'UnlessPayment'].includes(kind);

  // 1 · Acción principal dominante. Sólo se construye cuando la ventana lo
  // permite y no sustituye a un componente especializado activo. En selección
  // de objetivos la decisión es estratégica: no se promueve «Pasar».
  if (!specialistActive && !input.suppressPrimary) {
    if (combatWindow) {
      const draft = kind === 'DeclareAttackers' ? attackDeclaration(attackDraft) : blockDeclaration(blockDraft);
      primary = {
        key: `draft:${draft.type}:${stableKey(draft)}`,
        label: primaryLabel(snapshot, draft, attackDraft, blockDraft),
        hint: context.consequence,
        action: draft,
        origin: 'draft'
      };
    } else {
      const pass = actions.find((a) => a.type === 'PassPriority');
      const keep = actions.find(isKeepHand);
      const candidate = keep ?? pass;
      if (candidate && (kind === 'Priority' || manaWindow || kind === 'MulliganDecision')) {
        primary = {
          ...projected(candidate, objects),
          label: isKeepHand(candidate) ? 'Conservar mano' : primaryLabel(snapshot, candidate, attackDraft, blockDraft),
          hint: context.consequence
        };
        classified.add(stableKey(candidate));
      }
    }
  }

  // 2 · Clasificación de TODAS las acciones globales. Ninguna se descarta.
  for (const action of actions) {
    const key = stableKey(action);
    if (classified.has(key)) continue;
    const entry = projected(action, objects);
    if (CANCEL_ACTIONS.has(action.type)) {
      tiers.cancel.push({ ...entry, label: action.type === 'BackToManaPayment' ? 'Volver al pago' : 'Cancelar lanzamiento' });
      classified.add(key);
    } else if (ADVANCED_ACTIONS.has(action.type)) {
      tiers.advanced.push({ ...entry, hint: 'Preferencia de automatización de Phase; UX-PRIORITY definirá la política completa.' });
      classified.add(key);
    } else if (action.type === 'PassPriority') {
      // La cesión ya es la principal (o la ventana la administra el
      // especialista); se conserva también como opción estratégica para que
      // nunca desaparezca del conjunto legal.
      tiers.strategic.push({ ...entry, hint: context.consequence });
      classified.add(key);
    } else if (action.type === 'MulliganDecision' || action.type === 'DeclareAttackers' || action.type === 'DeclareBlockers' || action.type === 'CastSpell' || action.type === 'ChooseTarget' || action.type === 'ChooseOption') {
      tiers.strategic.push({ ...entry, hint: entry.confirmation ? 'Consume su carta: sólo se ejecuta al pulsar este botón explícito; inspeccionar nunca lo ejecuta.' : undefined });
      classified.add(key);
    } else if (MANA_ACTIONS.has(action.type)) {
      tiers.secondary.push({ ...entry, hint: entry.confirmation ? 'Consume su carta: sólo se ejecuta al pulsar este botón explícito; inspeccionar nunca lo ejecuta.' : undefined });
      classified.add(key);
    } else {
      tiers.secondary.push({ ...entry, hint: entry.confirmation ? 'Consume su carta: sólo se ejecuta al pulsar este botón explícito; inspeccionar nunca lo ejecuta.' : undefined });
      classified.add(key);
    }
  }

  // 3 · Comandos de lanzamiento con un modo de pago, vinculados a la carta y
  // a la alternativa *explícitamente elegidas* (UX-DECISION 1.1). 1.0 derivaba
  // estos controles de `actions.find(a => a.type === 'CastSpell')`: con dos
  // cartas lanzables —o dos caras de la misma— eso apuntaba al primer
  // lanzamiento publicado, no necesariamente al que el jugador quería, y la
  // etiqueta («Elegir maná manualmente») lo presentaba como si sólo cambiara
  // una preferencia cuando en realidad *inicia* ese lanzamiento. Ahora:
  //   - sin elección explícita no se deriva ningún comando de pago;
  //   - con una carta elegida que tiene un único lanzamiento, se vincula a él;
  //   - con dos alternativas de la misma carta hace falta `selectedCastKey`;
  //     la carta sola no identifica la alternativa, así que no se adivina.
  // `Manual` y `AutoExceptSacrificialMana` son modos del DTO que Phase ya
  // acepta (`CastPaymentMode`); el resto del payload (carta, cara, objetivos)
  // se conserva byte a byte, y eso lo comprueban las regresiones.
  const casts = actions.filter((a) => a.type === 'CastSpell');
  let boundCast: GameAction | undefined;
  if (input.selectedCastKey) {
    boundCast = casts.find((a) => stableKey(a) === input.selectedCastKey);
  } else if (input.selectedId !== undefined && input.selectedId !== null) {
    const forCard = casts.filter((a) => actionObjectId(a) === input.selectedId);
    if (forCard.length === 1) boundCast = forCard[0];
  }
  if (!specialistActive && (kind === 'Priority' || manaWindow) && boundCast) {
    const cast = boundCast;
    const castKey = stableKey(cast);
    const cardName = (() => { const id = actionObjectId(cast); return id !== undefined ? (objects[String(id)]?.name ?? 'la carta elegida') : 'la carta elegida'; })();
    const manualAction = JSON.parse(JSON.stringify(manualCast(cast))) as GameAction;
    tiers.secondary.push({
      key: `preference:manual:${castKey}`,
      label: describeAction(manualAction, objects),
      hint: `Comando de lanzamiento: al pulsarlo se lanza ${cardName} eligiendo el maná manualmente. No es una preferencia global.`,
      action: manualAction, origin: 'preference', panel: 'payment-mode',
      boundObjectId: actionObjectId(cast), boundCastKey: castKey, startsCast: true
    });
    // 3b · `AutoExceptSacrificialMana`: mismo vínculo, mismo carácter de
    // comando. NO hay previsualización: nuestro ABI no expone
    // `previewManaPayment`, así que no se inventa qué fuentes usaría Phase.
    tiers.advanced.push({
      key: `preference:sacrificial:${castKey}`,
      label: `Lanzar ${cardName} evitando fuentes sacrificiales`,
      hint: `Comando de lanzamiento: al pulsarlo se lanza ${cardName} con ese modo de pago. Phase decide las fuentes; Mesa no las previsualiza porque el ABI no publica esa operación.`,
      action: {
        ...JSON.parse(JSON.stringify(cast)) as GameAction,
        data: { ...(cast.data ?? {}), payment_mode: { type: 'AutoExceptSacrificialMana' } }
      },
      origin: 'preference', panel: 'payment-mode',
      boundObjectId: actionObjectId(cast), boundCastKey: castKey, startsCast: true
    });
  }

  // 4 · Controles avanzados que no son acciones del motor. La superficie
  // secundaria existe en ambos casos: conserva paradas de fase y modo de
  // prioridad sin exponerlos de forma permanente.
  if (!tiers.advanced.some((a) => a.panel === 'phase-stops')) {
    tiers.advanced.push({
      key: 'panel:phase-stops', label: 'Paradas de fase',
      hint: 'Standard, SkipLowUseWindows, FullControl y las doce paradas siguen disponibles.',
      action: { type: 'OpenPhaseStops' }, origin: 'navigation', panel: 'phase-stops'
    });
  }

  const unclassified = actions.filter((a) => !classified.has(stableKey(a))).map((a) => JSON.parse(JSON.stringify(a)) as GameAction);
  const counters = {
    primary: primary ? 1 : 0,
    strategic: tiers.strategic.length,
    secondary: tiers.secondary.length,
    advanced: tiers.advanced.length,
    cancel: tiers.cancel.length,
    visible: (primary ? 1 : 0) + 1 // el botón principal + el disclosure de niveles
  };

  return {
    context, primary, tiers, specialistActive,
    integrity: { total: actions.length, classified: classified.size, unclassified, byObject, ok: unclassified.length === 0 },
    counters
  };
}

/** Sólo para herramientas de medición y pruebas: etiqueta de un nivel. */
export const TIER_LABELS: Record<DecisionTier, string> = {
  primary: 'Acción principal', strategic: 'Elecciones estratégicas',
  secondary: 'Acciones secundarias', advanced: 'Controles avanzados', cancel: 'Cancelación'
};

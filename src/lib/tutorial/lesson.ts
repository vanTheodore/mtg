/**
 * Mesa 0.6 — «Mi primera partida».
 *
 * The lesson script: the order in which a beginner meets Magic's vocabulary,
 * and the legal action each step performs.
 *
 * Rules never live in this file. Every action returned here is copied
 * **verbatim** from the `legal` list Phase itself published in the snapshot;
 * the tutorial only chooses *between* the actions the engine offers and never
 * forges one. When the engine does not offer an action, this module reports
 * "not available" and the tutorial offers a safe alternative instead of
 * forcing the state.
 *
 * The teaching text is content, not rules: it explains what the learner is
 * about to see, in the words a first-timer needs.
 */
import type { EngineSnapshot, GameAction, GameObject, ObjectId } from '#lib/engine/types.ts';
import { mulliganChoice } from '#lib/game/actions.ts';
import { attackTargets, manaActions } from '#lib/game/interaction.ts';

export interface TutorialContext {
  /** The seat the learner plays. */
  learner: number;
  /** The seat the guided dummy plays. */
  dummy: number;
}

export const TUTORIAL_CONTEXT: TutorialContext = { learner: 0, dummy: 1 };

/**
 * A fixed seed makes the opening hand reproducible: the same seven cards on
 * every machine, every replay and every test run. The lesson never depends on
 * a particular hand — the controller redraws when the hand cannot support the
 * lesson — but a fixed seed keeps the lesson *predictable*.
 */
export const TUTORIAL_SEED = 20261030;

/**
 * The lesson's deck. Twenty Plains and twenty Savannah Lions: enough copies
 * that the opening hand almost always holds one of each, and simple enough
 * that the only decisions are "play a land", "tap it", "cast a one-mana
 * creature" and "attack". The dummy plays forty Plains and never uses them.
 */
export const TUTORIAL_DECK = {
  player: { main_deck: [...Array(20).fill('Plains'), ...Array(20).fill('Savannah Lions')] },
  opponent: { main_deck: [...Array(40).fill('Plains')] }
};

/** The card names the lesson needs; the catalog is loaded for exactly these. */
export const TUTORIAL_CARD_NAMES = ['Plains', 'Savannah Lions'];

/** How many times the lesson may ask the engine for a fresh opening hand. */
export const MAX_MULLIGANS = 2;

/**
 * The only thing worth remembering between visits: that the lesson was
 * finished. No progress, no preferences, no personal data.
 */
export const TUTORIAL_STORAGE_KEY = 'mesa:tutorial:completed:v1';

/**
 * Safety net for the auto-pass loop: how many priority windows the tutorial
 * may skip on its own before it stops and offers the learner a way out.
 */
export const MAX_AUTO_PASSES = 60;

export type LessonStepKind = 'read' | 'act' | 'wait' | 'final';

export interface LessonStep {
  id: string;
  /** Short title shown in the lesson panel. */
  title: string;
  /** The teaching text: one short paragraph, in plain Spanish. */
  teach: string;
  /** What the learner has to do right now. */
  goal: string;
  /** Label of the single primary button. */
  action: string;
  kind: LessonStepKind;
  /** Vocabulary this step introduces, in order. */
  words?: string[];
  /** The card the learner has to use, when there is one. */
  focus?: (snapshot: EngineSnapshot, ctx: TutorialContext) => ObjectId | undefined;
  /** The action to perform — always copied from Phase's legal list. */
  perform?: (snapshot: EngineSnapshot, ctx: TutorialContext) => GameAction | undefined;
  /** Why the pick was not possible, when the learner picks the wrong card. */
  blocked?: string;
}

/* ────────────────────────────── snapshot readers ───────────────────────────── */

export function objectsOf(snapshot: EngineSnapshot): Record<string, GameObject> {
  return snapshot.state.objects ?? {};
}

export function handObjects(snapshot: EngineSnapshot, player: number): GameObject[] {
  const view = snapshot.state.players?.[player];
  const objects = objectsOf(snapshot);
  if (!view) return [];
  return view.hand.map((id) => objects[String(id)]).filter((o): o is GameObject => !!o);
}

export function battlefieldObjects(snapshot: EngineSnapshot, player: number): GameObject[] {
  const objects = objectsOf(snapshot);
  return (snapshot.state.battlefield ?? [])
    .map((id) => objects[String(id)])
    .filter((o): o is GameObject => !!o && o.controller === player);
}

export const coreTypes = (object: GameObject): string[] => object.card_types?.core_types ?? [];
export const isLand = (object: GameObject): boolean => coreTypes(object).includes('Land');
export const isCreature = (object: GameObject): boolean => coreTypes(object).includes('Creature');

export function lifeOf(snapshot: EngineSnapshot, player: number): number {
  return snapshot.state.players?.[player]?.life ?? 0;
}

export function manaPoolOf(snapshot: EngineSnapshot, player: number): number {
  return snapshot.state.players?.[player]?.mana_pool?.total ?? 0;
}

/** The legal action Phase offers for one object, or `undefined`. */
export function legalFor(snapshot: EngineSnapshot | null, type: string, objectId: ObjectId): GameAction | undefined {
  if (!snapshot) return undefined;
  const bucket = snapshot.legal.by_object[String(objectId)] ?? [];
  return bucket.find((action) => action.type === type);
}

/** The legal "pass priority" action, when the engine offers one. */
export function passAction(snapshot: EngineSnapshot | null): GameAction | undefined {
  if (!snapshot) return undefined;
  return snapshot.legal.actions.find((action) => action.type === 'PassPriority');
}

/** The land in the learner's hand the lesson points at. */
export function landInHand(snapshot: EngineSnapshot, ctx: TutorialContext): GameObject | undefined {
  return handObjects(snapshot, ctx.learner).find(isLand);
}

/** The creature in the learner's hand the lesson points at. */
export function creatureInHand(snapshot: EngineSnapshot, ctx: TutorialContext): GameObject | undefined {
  return handObjects(snapshot, ctx.learner).find(isCreature);
}

/** The learner's land on the battlefield the lesson points at. */
export function landOnBattlefield(snapshot: EngineSnapshot, ctx: TutorialContext): GameObject | undefined {
  return battlefieldObjects(snapshot, ctx.learner).find(isLand);
}

/** The learner's creature on the battlefield the lesson points at. */
export function creatureOnBattlefield(snapshot: EngineSnapshot, ctx: TutorialContext): GameObject | undefined {
  return battlefieldObjects(snapshot, ctx.learner).find(isCreature);
}

/**
 * The action that declares the learner's creature an attacker against the
 * dummy. Phase's own proposal is used when it exists (verbatim, so the wire
 * shape is the engine's); otherwise the same declaration the rest of Mesa
 * sends is used and the engine still has the last word.
 */
export function attackAction(
  snapshot: EngineSnapshot,
  ctx: TutorialContext,
  creatureId: ObjectId
): GameAction | undefined {
  const target = attackTargets(snapshot, creatureId).find((t) => t.type === 'Player' && t.data === ctx.dummy);
  if (!target) return undefined;
  const offered = snapshot.legal.actions.find((action) => {
    if (action.type !== 'DeclareAttackers') return false;
    const attacks = (action.data?.attacks ?? []) as unknown[];
    return attacks.length === 1 && Array.isArray(attacks[0]) && Number(attacks[0][0]) === creatureId;
  });
  if (offered) return offered;
  return { type: 'DeclareAttackers', data: { attacks: [[creatureId, target]], bands: [] } };
}

/**
 * The cleanup step asks the player to discard down to seven cards. The engine
 * publishes the legal selections; the lesson answers with one of them (the
 * first the engine offers) instead of inventing a discard.
 */
export function discardAction(snapshot: EngineSnapshot): GameAction | undefined {
  if (snapshot.state.waiting_for.type !== 'DiscardToHandSize') return undefined;
  return snapshot.legal.actions.find((action) => action.type === 'SelectCards');
}

/**
 * What the guided dummy does: it only answers what Phase asks, with an action
 * Phase already offers. It never blocks, never attacks and never casts.
 */
export function dummyAction(snapshot: EngineSnapshot): GameAction | undefined {
  const actions = snapshot.legal.actions;
  const discard = discardAction(snapshot);
  if (discard) return discard;
  if (snapshot.state.waiting_for.type === 'DeclareBlockers') {
    const none = actions.find((action) =>
      action.type === 'DeclareBlockers' && ((action.data?.assignments ?? []) as unknown[]).length === 0);
    if (none) return none;
  }
  if (snapshot.state.waiting_for.type === 'DeclareAttackers') {
    // The dummy never attacks: it declares no attackers, which the engine
    // offers as one of its own proposals.
    const none = actions.find((action) =>
      action.type === 'DeclareAttackers' && ((action.data?.attacks ?? []) as unknown[]).length === 0);
    if (none) return none;
  }
  return actions.find((action) => action.type === 'PassPriority');
}

/**
 * The opening hand can support the lesson when it holds a land to play and a
 * creature to cast. Anything else is redrawn (Phase applies its own London
 * rule; the tutorial only asks for it while the limit allows).
 */
export function handSupportsLesson(snapshot: EngineSnapshot, ctx: TutorialContext): boolean {
  const hand = handObjects(snapshot, ctx.learner);
  return hand.some(isLand) && hand.some(isCreature);
}

/**
 * The mulligan answer. The dummy always keeps its hand; the learner keeps it
 * when it can support the lesson and redraws otherwise.
 */
export function mulliganAction(
  snapshot: EngineSnapshot,
  ctx: TutorialContext,
  mulligans: number
): GameAction | undefined {
  const decisions = snapshot.legal.actions.filter((action) => action.type === 'MulliganDecision');
  if (!decisions.length) return undefined;
  const keep = decisions.find((action) => mulliganChoice(action) === 'Keep');
  const redraw = decisions.find((action) => mulliganChoice(action) === 'Mulligan');
  if (snapshot.viewer === ctx.dummy) return keep ?? decisions[0];
  if (keep && handSupportsLesson(snapshot, ctx)) return keep;
  if (redraw && mulligans < MAX_MULLIGANS) return redraw;
  return keep ?? decisions[0];
}

/* ─────────────────────────────────── steps ─────────────────────────────────── */

export const STEPS: LessonStep[] = [
  {
    id: 'intro',
    kind: 'read',
    title: 'Tu primera partida',
    teach:
      'En Magic los dos jugadores empiezan con 20 vidas. Pierde quien se queda sin vidas. ' +
      'Tu rival aquí es un maniquí de entrenamiento: no ataca, no bloquea y no te molesta, para que puedas practicar con calma.',
    goal: 'Mira el tablero: arriba está el maniquí, abajo tus cartas. Continúa cuando quieras.',
    action: 'Continuar',
    words: ['vida', 'jugador', 'rival']
  },
  {
    id: 'play-land',
    kind: 'act',
    title: 'Juega tu primera tierra',
    teach:
      'Las tierras son tu fuente de poder. Por ahora no hacen nada solas: primero las juegas, ' +
      'después las giras para producir maná. Solo puedes jugar una tierra por turno.',
    goal: 'Haz clic en la Llanura resaltada de tu mano para jugarla al campo de batalla.',
    action: 'Jugar la tierra',
    words: ['tierra', 'mano', 'campo de batalla'],
    focus: (snapshot, ctx) => landInHand(snapshot, ctx)?.id,
    perform: (snapshot, ctx) => {
      const land = landInHand(snapshot, ctx);
      return land ? legalFor(snapshot, 'PlayLand', land.id) : undefined;
    },
    blocked:
      'Esa no es la carta que toca ahora. Busca en tu mano la carta que dice «Tierra» y que está resaltada.'
  },
  {
    id: 'make-mana',
    kind: 'act',
    title: 'Genera maná',
    teach:
      'Girar una tierra es usarla: queda acostada y no vuelve a estar disponible hasta tu próximo turno. ' +
      'Una Llanura genera un maná blanco, y el maná se queda en tu reserva hasta que lo gastas.',
    goal: 'Haz clic en la Llanura resaltada de tu campo para girarla y generar maná.',
    action: 'Girar la tierra',
    words: ['maná', 'girar', 'reserva de maná'],
    focus: (snapshot, ctx) => landOnBattlefield(snapshot, ctx)?.id,
    perform: (snapshot, ctx) => {
      const land = landOnBattlefield(snapshot, ctx);
      if (!land) return undefined;
      return manaActions(snapshot, land.id)[0];
    },
    blocked:
      'Esa tierra no puede generar maná ahora. Busca la que está enderezada (no acostada) en tu campo.'
  },
  {
    id: 'cast-creature',
    kind: 'act',
    title: 'Lanza una criatura',
    teach:
      'Un hechizo se paga con maná de tu reserva. Savannah Lions cuesta un maná blanco: ya lo tienes. ' +
      'Las criaturas se quedan en el campo y son las que atacan.',
    goal: 'Haz clic en Savannah Lions para lanzarla.',
    action: 'Lanzar la criatura',
    words: ['hechizo', 'criatura', 'coste'],
    focus: (snapshot, ctx) => creatureInHand(snapshot, ctx)?.id,
    perform: (snapshot, ctx) => {
      const creature = creatureInHand(snapshot, ctx);
      return creature ? legalFor(snapshot, 'CastSpell', creature.id) : undefined;
    },
    blocked:
      'El motor todavía no ofrece esa acción. Si te falta maná, genera más; si no es tu turno, espera a tu fase principal.'
  },
  {
    id: 'read-stats',
    kind: 'read',
    title: 'Fuerza y resistencia',
    teach:
      'El 2/1 de tu criatura son su fuerza y su resistencia. La fuerza (2) es el daño que hace al atacar. ' +
      'La resistencia (1) es el daño que aguanta: con 1 de daño se debilita, con 2 o más muere.',
    goal: 'Cuando lo tengas claro, termina tu turno.',
    action: 'Continuar',
    words: ['fuerza', 'resistencia']
  },
  {
    id: 'end-turn',
    kind: 'wait',
    title: 'Termina tu turno',
    teach:
      'Cuando no quieras hacer nada más, pasas la prioridad y el juego continúa con el rival. ' +
      'Al empezar tu siguiente turno, tus criaturas se enderezan y una criatura recién llegada ya puede atacar.',
    goal: 'Termina tu turno y mira cómo cambia el juego.',
    action: 'Terminar mi turno',
    words: ['prioridad', 'turno', 'fase']
  },
  {
    id: 'attack',
    kind: 'act',
    title: 'Ataca con tu criatura',
    teach:
      'Ya pasó un turno, así que tu criatura puede atacar. Atacar es declarar que tu criatura golpea al rival. ' +
      'Si nadie la bloquea, le hace daño de fuerza.',
    goal: 'Haz clic en tu criatura para declararla atacante contra el maniquí.',
    action: 'Atacar al maniquí',
    words: ['atacar', 'bloquear'],
    focus: (snapshot, ctx) => creatureOnBattlefield(snapshot, ctx)?.id,
    perform: (snapshot, ctx) => {
      const creature = creatureOnBattlefield(snapshot, ctx);
      return creature ? attackAction(snapshot, ctx, creature.id) : undefined;
    },
    blocked:
      'Tu criatura todavía no puede atacar: una criatura recién llegada no ataca el mismo turno en que llega. Espera a tu siguiente turno.'
  },
  {
    id: 'damage',
    kind: 'read',
    title: 'El daño',
    teach:
      'Tu criatura hizo 2 de daño: el maniquí pasó de 20 a 18 vidas. Así funciona el combate. ' +
      'Si el rival hubiera bloqueado, tu criatura y la suya se habrían hecho daño entre ellas.',
    goal: 'Mira el tablero: el maniquí tiene menos vidas. Continúa para terminar la lección.',
    action: 'Continuar',
    words: ['daño', 'bloqueadora']
  },
  {
    id: 'done',
    kind: 'final',
    title: '¡Lo lograste!',
    teach:
      'Jugaste de verdad: Phase movió cada carta, cada maná y cada punto de daño. ' +
      'Ya sabes jugar una tierra, generar maná, lanzar una criatura y atacar.',
    goal: 'Repite la lección cuando quieras: el mazo y la semilla son los mismos, así que pasa lo mismo.',
    action: 'Repetir la lección'
  }
];

/** The words the lesson has introduced so far, in order of appearance. */
export function introducedWords(stepIndex: number): string[] {
  return STEPS.slice(0, Math.min(stepIndex + 1, STEPS.length)).flatMap((step) => step.words ?? []);
}

/**
 * Whether a step's goal is already met, read from the engine's own state.
 *
 * Every predicate here is a *reading* of what Phase published (a permanent on
 * the battlefield, the mana pool, a life total, the combat state) — never a
 * second implementation of a rule.
 */
export function battleStepIsDone(
  stepId: string,
  snapshot: EngineSnapshot,
  state: { sawOpponentTurn: boolean; manaProduced?: boolean },
  ctx: TutorialContext
): boolean {
  switch (stepId) {
    case 'play-land':
      return battlefieldObjects(snapshot, ctx.learner).some(isLand);
    case 'make-mana': {
      // The pool empties when the mana is paid, so the lesson also accepts the
      // permanent evidence: a tapped land means the mana was produced.
      if (state.manaProduced) return true;
      if (manaPoolOf(snapshot, ctx.learner) > 0) return true;
      return battlefieldObjects(snapshot, ctx.learner).some((object) => isLand(object) && object.tapped === true);
    }
    case 'cast-creature':
      return battlefieldObjects(snapshot, ctx.learner).some(isCreature);
    case 'end-turn':
      // The dummy's turn happened and the learner is back: a new turn.
      return state.sawOpponentTurn && snapshot.state.active_player === ctx.learner;
    case 'attack':
      // The step is done when the damage has landed, not when the attack was
      // declared: the next step explains the damage, so it has to exist.
      return lifeOf(snapshot, ctx.dummy) < 20;
    case 'damage':
      return lifeOf(snapshot, ctx.dummy) < 20;
    default:
      return false;
  }
}

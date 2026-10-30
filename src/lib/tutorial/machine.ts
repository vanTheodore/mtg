/**
 * Mesa 0.6 — the lesson's state machine.
 *
 * Pure on purpose: it reads a Phase snapshot and returns the next state plus
 * **at most one** action to dispatch. It never touches the DOM, the session or
 * the network, so the whole lesson can be exercised in a unit test with
 * synthetic snapshots.
 *
 * The rules stay in Phase: every action this machine returns is one the
 * engine published in `snapshot.legal`. When the engine does not offer the
 * action a step wants, the machine passes priority (so the game reaches the
 * moment where the action exists) and, if that never happens, it stops and
 * lets the learner skip the step. It never forces a state.
 */
import type { EngineSnapshot, GameAction } from '#lib/engine/types.ts';
import { isManaPrompt, manaActions } from '#lib/game/interaction.ts';
import {
  MAX_AUTO_PASSES,
  STEPS,
  battleStepIsDone,
  discardAction,
  dummyAction,
  manaPoolOf,
  mulliganAction,
  type TutorialContext
} from './lesson.ts';

export interface LessonNote {
  id: number;
  text: string;
}

export interface MachineState {
  /** Index of the current step in {@link STEPS}. */
  step: number;
  /** The last reading step the learner confirmed. */
  acknowledged: number;
  /** The lesson reached its final screen. */
  completed: boolean;
  /** Opening hands the engine was asked to redraw. */
  mulligans: number;
  /** The dummy's turn was seen: the learner's next turn is a new turn. */
  sawOpponentTurn: boolean;
  /** How many turns the learner has played (presentation only). */
  learnerTurn: number;
  /** The active player of the last snapshot. */
  lastActive: number | null;
  /** The learner asked the tutorial to move the game on. */
  autoPassing: boolean;
  /** Priority windows skipped on the current step. */
  autoPasses: number;
  /**
   * The learner produced mana at some point. The pool empties when the mana
   * is spent, so the lesson remembers it instead of un-completing the step.
   */
  manaProduced: boolean;
  /** Short notes about what the tutorial did by itself. */
  notes: LessonNote[];
}

export interface MachineResult {
  state: MachineState;
  /** The action to dispatch now, if any. */
  action?: GameAction;
  /** A line for the learner, when the tutorial has to explain itself. */
  message?: string;
}

export function initialState(): MachineState {
  return {
    step: 0,
    acknowledged: -1,
    completed: false,
    mulligans: 0,
    sawOpponentTurn: false,
    learnerTurn: 1,
    lastActive: null,
    autoPassing: false,
    autoPasses: 0,
    manaProduced: false,
    notes: []
  };
}

function note(state: MachineState, text: string, id: number): MachineState {
  return { ...state, notes: [...state.notes, { id, text }].slice(-8) };
}

function advance(state: MachineState): MachineState {
  return { ...state, step: state.step + 1, autoPasses: 0 };
}

/**
 * One turn of the machine. It is idempotent for a given snapshot: the same
 * snapshot always yields the same decision, which is what makes the lesson
 * reproducible.
 */
export function reduce(
  state: MachineState,
  snapshot: EngineSnapshot | null,
  ctx: TutorialContext
): MachineResult {
  if (!snapshot) return { state };
  if (snapshot.outcome) {
    return { state: { ...state, completed: true }, message: 'La partida terminó.' };
  }

  let next: MachineState = { ...state };

  // Turn bookkeeping (presentation only; the engine owns who is active).
  const active = snapshot.state.active_player;
  if (active !== next.lastActive) {
    const previous = next.lastActive;
    next.lastActive = active;
    if (active === ctx.dummy) next.sawOpponentTurn = true;
    if (active === ctx.learner && previous === ctx.dummy) next.learnerTurn += 1;
  }

  // The mana pool empties as soon as the learner pays a cost: the lesson
  // remembers that the mana was produced so the step never un-completes.
  if (manaPoolOf(snapshot, ctx.learner) > 0) next = { ...next, manaProduced: true };

  // 1. The engine asks for a mulligan decision: answer it for both seats.
  if (snapshot.state.waiting_for.type === 'MulliganDecision') {
    const action = mulliganAction(snapshot, ctx, next.mulligans);
    if (action) {
      const redrawing = action.type === 'MulliganDecision' && isRedraw(action);
      if (redrawing) next = note(next, 'La mano inicial no alcanzaba: Mesa pidió una nueva.', next.notes.length);
      next = { ...next, mulligans: next.mulligans + (redrawing ? 1 : 0) };
      return { state: next, action };
    }
  }

  // 2. The guided dummy plays: it only answers what Phase asks.
  if (snapshot.viewer === ctx.dummy) {
    const action = dummyAction(snapshot);
    if (action) return { state: next, action };
  }

  // 3. The engine asks how to pay a cost. Phase offers the legal sources, so
  //    the lesson pays with one of them instead of forging a payment.
  if (isManaPrompt(snapshot)) {
    const pay = manaActions(snapshot)[0];
    if (pay) return { state: next, action: pay };
  }

  // 4. The cleanup step asks for a discard (seven cards or less). Phase
  //    publishes the legal selections, so the lesson answers with one.
  const discard = discardAction(snapshot);
  if (discard) return { state: next, action: discard };

  // 5. The lesson itself.
  for (let guard = 0; guard < STEPS.length + 2; guard += 1) {
    const step = STEPS[next.step];
    if (!step) return { state: { ...next, completed: true } };
    if (step.kind === 'final') return { state: { ...next, completed: true } };

    if (step.kind === 'read') {
      if (next.acknowledged >= next.step) {
        next = advance(next);
        continue;
      }
      return { state: next };
    }

    if (battleStepIsDone(step.id, snapshot, next, ctx)) {
      next = advance(next);
      continue;
    }

    if (step.kind === 'wait') {
      // The learner asked to move on: keep passing priority until the step's
      // condition is met (the turn changes, the damage lands…).
      if (!next.autoPassing) return { state: next };
      const pass = passMove(snapshot);
      if (!pass) return { state: next };
      next = { ...next, autoPasses: next.autoPasses + 1 };
      return { state: next, action: pass };
    }

    // 'act': the learner performs the step. While the engine does not offer
    // the action yet, the tutorial lets the game reach that moment.
    const perform = step.perform?.(snapshot, ctx);
    if (perform) return { state: { ...next, autoPassing: false } };
    const pass = passMove(snapshot);
    if (pass && next.autoPasses < MAX_AUTO_PASSES) {
      next = { ...next, autoPasses: next.autoPasses + 1 };
      return { state: next, action: pass };
    }
    return {
      state: next,
      message:
        next.autoPasses >= MAX_AUTO_PASSES
          ? 'El motor no ofrece esta acción todavía. Puedes saltar el paso y seguir.'
          : undefined
    };
  }
  return { state: next };
}

/* ─────────────────────────────── engine moves ─────────────────────────────── */

function passMove(snapshot: EngineSnapshot): GameAction | undefined {
  return snapshot.legal.actions.find((action) => action.type === 'PassPriority');
}

/** True when the mulligan answer asks the engine for a new hand. */
function isRedraw(action: GameAction): boolean {
  const choice = action.data?.choice;
  if (typeof choice === 'string') return choice === 'Mulligan';
  if (choice && typeof choice === 'object' && 'type' in choice) return String((choice as { type: unknown }).type) === 'Mulligan';
  return false;
}

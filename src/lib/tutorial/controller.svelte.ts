/**
 * Mesa 0.6 — the tutorial controller.
 *
 * A thin reactive shell around the pure machine in `machine.ts`: it owns the
 * observable state the UI reads, starts the real engine session, and turns the
 * machine's decision into a single dispatch through the existing engine
 * client. It never evaluates a rule: the machine only proposes actions Phase
 * already offered.
 *
 * Every mutable field here is a **plain** field; `view` is the only reactive
 * one, and it is a projection rebuilt after each change. That keeps the
 * "observe the snapshot" effect from tracking the state it writes, which would
 * otherwise loop forever.
 */
import { loadCatalog } from '#lib/game/catalog.ts';
import { session } from '#lib/game/session.svelte.ts';
import type { EngineSnapshot, GameAction, ObjectId } from '#lib/engine/types.ts';
import { initialState, reduce, type LessonNote, type MachineState } from './machine.ts';
import { ActionSlot } from './action-slot.ts';
import {
  STEPS,
  TUTORIAL_CARD_NAMES,
  TUTORIAL_CONTEXT,
  TUTORIAL_DECK,
  TUTORIAL_SEED,
  TUTORIAL_STORAGE_KEY,
  type LessonStepKind,
  type TutorialContext
} from './lesson.ts';

export type TutorialStatus = 'idle' | 'loading' | 'running' | 'completed' | 'error';

/** What the controller needs from the engine. Swapped in tests. */
export interface TutorialEngine {
  readonly snapshot: EngineSnapshot | null;
  dispatch: (action: GameAction) => Promise<void>;
}

const sessionEngine: TutorialEngine = {
  get snapshot() {
    return session.snapshot;
  },
  dispatch: (action) => session.dispatch(action)
};

export interface TutorialView {
  status: TutorialStatus;
  /** Index of the current step and the total number of steps. */
  stepIndex: number;
  stepCount: number;
  kind: LessonStepKind;
  title: string;
  teach: string;
  goal: string;
  action: string;
  words: string[];
  /** The card the lesson points at, if any. */
  focusId: number | null;
  /** True when the engine already offers the step's action. */
  actionReady: boolean;
  completed: boolean;
  message: string | null;
  error: string | null;
  busy: boolean;
  learnerTurn: number;
  notes: LessonNote[];
}

function initialView(): TutorialView {
  const step = STEPS[0];
  return {
    status: 'idle',
    stepIndex: 0,
    stepCount: STEPS.length,
    kind: step.kind,
    title: step.title,
    teach: step.teach,
    goal: step.goal,
    action: step.action,
    words: step.words ?? [],
    focusId: null,
    actionReady: false,
    completed: false,
    message: null,
    error: null,
    busy: false,
    learnerTurn: 1,
    notes: []
  };
}

export class TutorialController {
  engine: TutorialEngine = sessionEngine;
  context: TutorialContext = TUTORIAL_CONTEXT;
  /** The machine's state. Plain on purpose; `view` is the reactive surface. */
  machine: MachineState = initialState();
  /** The only reactive field: the projection the interface reads. */
  view = $state<TutorialView>(initialView());

  private status: TutorialStatus = 'idle';
  private message: string | null = null;
  private error: string | null = null;
  private busy = false;
  private privateAutoPass = true;
  /** The revision of the last snapshot the machine already decided about. */
  private lastRevision = -1;
  /** True when the lesson changed the machine without the engine moving. */
  private localChange = false;
  /**
   * The action the machine proposed and that is waiting for the engine to be
   * free. It is kept (and replaced by a newer decision) instead of dropped:
   * dropping it would break the chain of priority windows the lesson walks
   * through to reach the moment the learner can act.
   */
  private slot = new ActionSlot();

  async start(): Promise<void> {
    this.machine = initialState();
    this.message = null;
    this.error = null;
    this.busy = false;
    this.lastRevision = -1;
    this.localChange = false;
    this.slot = new ActionSlot();
    this.status = 'loading';
    this.publish();
    try {
      const loaded = await loadCatalog(fetch, TUTORIAL_CARD_NAMES);
      if (loaded.missing.length) {
        throw new Error(`El catálogo no tiene: ${loaded.missing.join(', ')}.`);
      }
      if (loaded.unverified.length) {
        throw new Error(`El motor todavía no verificó: ${loaded.unverified.join(', ')}.`);
      }
      // The tutorial drives the priority windows itself: the global auto-pass
      // would take the decisions away from the learner. The setting is not
      // persisted: it belongs to the lesson, not to the player's preferences.
      this.privateAutoPass = session.autoPass;
      session.autoPass = false;
      session.modeLabel = 'Lección · Mi primera partida';
      await session.start(loaded.catalog, TUTORIAL_DECK, TUTORIAL_SEED);
      if (session.status === 'error') throw new Error(session.error ?? 'El motor no pudo iniciar la lección.');
      this.status = 'running';
    } catch (error) {
      this.status = 'error';
      this.error = error instanceof Error ? error.message : String(error);
    }
    this.publish();
  }

  /** Leave the lesson and give the main game back its auto-pass setting. */
  stop(): void {
    session.autoPass = this.privateAutoPass;
    session.modeLabel = '';
  }

  /**
   * Leave the lesson for good: the engine session is released so the main
   * board shows its start screen again instead of the lesson's game.
   */
  leave(): void {
    this.stop();
    session.reset();
  }

  /** Restart the lesson. Same deck, same seed: the same game, every time. */
  async restart(): Promise<void> {
    this.stop();
    await this.start();
  }

  /**
   * React to the latest snapshot. Called whenever the engine publishes one.
   * It never mutates the engine directly: it proposes at most one action.
   */
  observe(): void {
    const snapshot = this.engine.snapshot;
    if (!snapshot) return;
    // Keep the seat handoff in sync so leaving the lesson does not leave a
    // stale "pass the device" dialog behind on the main board.
    session.confirmHandoff();
    // One decision per snapshot: the same revision always yields the same
    // answer, and deciding twice about the same state would let the lesson
    // skip a step. A local change (the learner read, skipped or asked to pass)
    // is the only reason to decide again about the same revision.
    if (snapshot.revision === this.lastRevision && !this.localChange) {
      this.publish();
      return;
    }
    this.lastRevision = snapshot.revision;
    this.localChange = false;
    const result = reduce(this.machine, snapshot, this.context);
    this.machine = result.state;
    if (result.message) this.message = result.message;
    if (this.machine.completed) {
      this.status = 'completed';
      this.markCompleted();
      this.slot.propose(null);
      this.publish();
      return;
    }
    // The newest decision replaces the waiting one: both describe the same
    // (latest) snapshot, and only the newest one can still be legal.
    this.slot.propose(result.action ?? null);
    if (import.meta.env.DEV) {
      // The trail is what the browser test reads when the lesson does not
      // move: it says what the engine offered and what the lesson decided.
      console.debug(
        `[lección] rev=${snapshot.revision} paso=${this.machine.step + 1}/${STEPS.length} ` +
          `fase=${snapshot.state.phase} espera=${snapshot.state.waiting_for.type} ` +
          `turno=${snapshot.state.turn_number} activo=${snapshot.state.active_player} ` +
          `visor=${snapshot.viewer} → ${result.action?.type ?? 'espera'}`
      );
    }
    this.publish();
    this.flush();
  }

  /**
   * Send the action the machine proposed, if the engine is free.
   *
   * The engine can only take one action at a time, so a decision that arrives
   * while another one is in flight waits here instead of being thrown away.
   */
  private flush(): void {
    const action = this.slot.take();
    if (!action) return;
    this.busy = true;
    this.publish();
    void this.engine
      .dispatch(action)
      .catch((failure: unknown) => {
        this.error = failure instanceof Error ? failure.message : String(failure);
      })
      .finally(() => {
        this.busy = false;
        this.slot.release();
        this.publish();
        // The engine moved: the snapshot changed, the effect will call
        // observe() again and decide about the new state. If a decision was
        // already made while this action was in flight, it goes now.
        this.flush();
      });
  }

  /** The primary button of the lesson panel. */
  async act(): Promise<void> {
    const step = STEPS[Math.min(this.machine.step, STEPS.length - 1)];
    if (!step) return;
    this.message = null;
    if (step.kind === 'read') {
      this.machine = { ...this.machine, acknowledged: this.machine.step };
      this.localChange = true;
      this.publish();
      this.observe();
      return;
    }
    if (step.kind === 'wait') {
      this.machine = { ...this.machine, autoPassing: true };
      this.localChange = true;
      this.publish();
      this.observe();
      return;
    }
    if (step.kind === 'final') {
      await this.restart();
      return;
    }
    const snapshot = this.engine.snapshot;
    const action = snapshot ? step.perform?.(snapshot, this.context) : undefined;
    if (!action) {
      this.message = 'El motor todavía no ofrece esa acción. Espera un momento o salta el paso.';
      this.publish();
      return;
    }
    await this.engine.dispatch(action);
  }

  /**
   * The learner touched a card. When it is the card the lesson points at, the
   * step happens; otherwise the lesson explains why that card is not the one.
   */
  async pick(id: ObjectId): Promise<void> {
    const focus = this.view.focusId;
    if (focus !== null && focus === id) {
      await this.act();
      return;
    }
    const step = STEPS[Math.min(this.machine.step, STEPS.length - 1)];
    this.message = step?.blocked ?? 'Ahora no toca esa carta. Busca la que está resaltada.';
    this.publish();
  }

  /** Skip the current step without forcing the engine's state. */
  skip(): void {
    const next = Math.min(this.machine.step + 1, STEPS.length - 1);
    this.machine = { ...this.machine, step: next, acknowledged: next, autoPasses: 0 };
    this.localChange = true;
    this.message = 'Paso saltado. La partida sigue igual: solo se saltó la explicación.';
    this.publish();
    this.observe();
  }

  /** Did the learner already finish the lesson in this browser? */
  get completedBefore(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(TUTORIAL_STORAGE_KEY) === '1';
  }

  private markCompleted(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, '1');
    } catch {
      // A browser that refuses storage is not a reason to break the lesson.
    }
  }

  /** Recompute the reactive projection the interface reads. */
  private publish(): void {
    const snapshot = this.engine.snapshot;
    const index = Math.min(this.machine.step, STEPS.length - 1);
    const step = STEPS[index];
    // The card is only pointed at when Phase actually offers the action:
    // highlighting a card that cannot be played yet would teach the wrong
    // thing, and the learner would click into an illegal move.
    const actionReady = !!snapshot && !!step?.perform?.(snapshot, this.context);
    this.view = {
      status: this.status,
      stepIndex: this.machine.step,
      stepCount: STEPS.length,
      kind: step?.kind ?? 'final',
      title: step?.title ?? '',
      teach: step?.teach ?? '',
      goal: step?.goal ?? '',
      action: step?.action ?? '',
      words: step?.words ?? [],
      focusId: actionReady ? (snapshot && step?.focus?.(snapshot, this.context)) ?? null : null,
      actionReady,
      completed: this.machine.completed,
      message: this.message,
      error: this.error,
      busy: this.busy,
      learnerTurn: this.machine.learnerTurn,
      notes: this.machine.notes
    };
  }
}

export const tutorial = new TutorialController();

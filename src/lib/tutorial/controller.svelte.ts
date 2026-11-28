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
import type { DispatchExpectation, DispatchOutcome } from '#lib/game/dispatchOutcome.ts';
import type { EngineSnapshot, GameAction, ObjectId } from '#lib/engine/types.ts';
import { initialState, reduce, settleMulliganDecision, type LessonNote, type MachineState } from './machine.ts';
import { ActionSlot, type ActionSlotProposal } from './action-slot.ts';
import {
  STEPS,
  TUTORIAL_CARD_NAMES,
  TUTORIAL_CONTEXT,
  TUTORIAL_DECK,
  TUTORIAL_SEED,
  TUTORIAL_STORAGE_KEY,
  handObjects,
  isLand,
  legalFor,
  type LessonStepKind,
  type TutorialContext
} from './lesson.ts';

export type TutorialStatus = 'idle' | 'loading' | 'running' | 'completed' | 'error';

/** What the controller needs from the engine. Swapped in tests. */
export interface TutorialEngine {
  readonly snapshot: EngineSnapshot | null;
  /** Phase's result settles decisions that must not be counted while queued. */
  dispatch: (action: GameAction, expected?: DispatchExpectation) => Promise<DispatchOutcome>;
}

const sessionEngine: TutorialEngine = {
  get snapshot() {
    return session.snapshot;
  },
  dispatch: (action, expected) => session.dispatch(action, expected)
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

type TutorialTraceSource = 'tutorial-machine' | 'learner' | 'await-learner';
type TutorialSeatRole = 'learner' | 'mannequin' | 'unknown';

interface TutorialTrace {
  event: 'proposal' | 'dispatch';
  source: TutorialTraceSource;
  learnerSeat: 'learner';
  dummySeat: 'mannequin';
  actorSeat: TutorialSeatRole;
  proposalRevision: number;
  dispatchRevision: number | null;
  actionType: string | null;
  phaseResult: DispatchOutcome['kind'] | null;
  phaseCode: string | null;
  step: string;
  phase: string;
  waiting: string;
  turn: number;
  /** Count only the learner's lands while their hand is the visible view. */
  availableLands: number | null;
  /** Whether Phase exposes at least one playable learner land in this view. */
  playLandLegal: boolean | null;
}

function seatRole(viewer: number, context: TutorialContext): TutorialSeatRole {
  if (viewer === context.learner) return 'learner';
  if (viewer === context.dummy) return 'mannequin';
  return 'unknown';
}

function learnerLandFacts(snapshot: EngineSnapshot, context: TutorialContext): Pick<TutorialTrace, 'availableLands' | 'playLandLegal'> {
  // Do not inspect or report the learner's private hand while the dummy is the
  // current viewer. The trace contains a land count, never card names or IDs.
  if (snapshot.viewer !== context.learner) {
    return { availableLands: null, playLandLegal: null };
  }
  const lands = handObjects(snapshot, context.learner).filter(isLand);
  return {
    availableLands: lands.length,
    playLandLegal: lands.some((land) => !!legalFor(snapshot, 'PlayLand', land.id))
  };
}

function recordTutorialTrace(trace: TutorialTrace): void {
  if (import.meta.env.DEV) console.debug(`[tutorial-trace] ${JSON.stringify(trace)}`);
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
  /** Count manual and machine dispatches separately; the session queue serializes their sends. */
  private inFlightDispatches = 0;
  /** Invalidates a lesson start if the user navigates away during loading. */
  private startGeneration = 0;
  /** Snapshot identity (seat + revision) the machine most recently decided about. */
  private lastRevision = -1;
  private lastViewer: number | null = null;
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
    const generation = ++this.startGeneration;
    this.machine = initialState();
    this.message = null;
    this.error = null;
    this.inFlightDispatches = 0;
    this.lastRevision = -1;
    this.lastViewer = null;
    this.localChange = false;
    this.slot = new ActionSlot();
    this.status = 'loading';
    this.publish();
    try {
      const loaded = await loadCatalog(fetch, TUTORIAL_CARD_NAMES);
      if (generation !== this.startGeneration) return;
      if (loaded.missing.length) {
        throw new Error(`El catálogo no tiene: ${loaded.missing.join(', ')}.`);
      }
      if (loaded.unverified.length) {
        throw new Error(`El motor todavía no verificó: ${loaded.unverified.join(', ')}.`);
      }
      // The tutorial machine is the sole automatic decision-maker for both
      // seats. This in-memory scope blocks session auto-passes while leaving
      // both saved preferences and their normal Phase synchronization intact.
      session.setTutorialAutomationActive(true);
      session.modeLabel = 'Lección · Mi primera partida';
      await session.start(loaded.catalog, TUTORIAL_DECK, TUTORIAL_SEED);
      if (generation !== this.startGeneration) return;
      if (session.status === 'error') throw new Error(session.error ?? 'El motor no pudo iniciar la lección.');
      this.status = 'running';
    } catch (error) {
      if (generation !== this.startGeneration) return;
      session.setTutorialAutomationActive(false);
      session.modeLabel = '';
      this.status = 'error';
      this.error = error instanceof Error ? error.message : String(error);
    }
    this.publish();
  }

  /** Release the lesson's in-memory authority without touching saved preferences. */
  stop(): void {
    session.setTutorialAutomationActive(false);
    session.modeLabel = '';
  }

  /**
   * Leave the lesson for good: the engine session is released so the main
   * board shows its start screen again instead of the lesson's game.
   */
  leave(): void {
    ++this.startGeneration;
    this.slot.propose(null);
    this.stop();
    session.reset();
    this.inFlightDispatches = 0;
    this.status = 'idle';
    this.publish();
  }

  /** Restart the lesson. Same deck, same seed: the same game, every time. */
  async restart(): Promise<void> {
    // Keep the session's tutorial authority continuously held while the old
    // worker generation is replaced; no normal auto-pass can slip between.
    await this.start();
  }

  /**
   * React to the latest snapshot. Called whenever the engine publishes one.
   * It never mutates the engine directly: it proposes at most one action.
   */
  observe(): void {
    const snapshot = this.engine.snapshot;
    if (!snapshot) return;
    // The tutorial has no privacy-handoff dialog: the guided dummy is part of
    // this lesson's own UI. Do not confirm a GameSession handoff here, because
    // that also re-enters maybeAutoPass for the dummy's priority window.
    // One decision per (viewer, revision): a viewer can change even when a
    // presentation-only refresh leaves the revision unchanged.
    if (snapshot.revision === this.lastRevision && snapshot.viewer === this.lastViewer && !this.localChange) {
      this.publish();
      return;
    }
    this.lastRevision = snapshot.revision;
    this.lastViewer = snapshot.viewer;
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
    // The newest decision replaces the waiting one, but the proposal carries
    // its actor/revision so the send boundary can discard it after a handoff.
    const proposal: ActionSlotProposal | null = result.action
      ? {
          action: result.action,
          viewer: snapshot.viewer,
          revision: snapshot.revision,
          step: this.machine.step
        }
      : null;
    this.slot.propose(proposal);
    const facts = learnerLandFacts(snapshot, this.context);
    recordTutorialTrace({
      event: 'proposal',
      source: proposal ? 'tutorial-machine' : 'await-learner',
      learnerSeat: 'learner',
      dummySeat: 'mannequin',
      actorSeat: seatRole(snapshot.viewer, this.context),
      proposalRevision: snapshot.revision,
      dispatchRevision: null,
      actionType: result.action?.type ?? null,
      phaseResult: null,
      phaseCode: null,
      step: STEPS[this.machine.step]?.id ?? 'unknown',
      phase: snapshot.state.phase,
      waiting: snapshot.state.waiting_for.type,
      turn: snapshot.state.turn_number,
      ...facts
    });
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
    const slot = this.slot;
    const generation = this.startGeneration;
    const snapshot = this.engine.snapshot;
    if (!snapshot) {
      slot.propose(null);
      return;
    }
    const taken = slot.take({ viewer: snapshot.viewer, revision: snapshot.revision });
    if (taken.kind === 'empty' || taken.kind === 'busy') return;
    if (taken.kind === 'stale') {
      // Never send the retained payload. Rebuild from the latest Phase view,
      // including the case where only the logical viewer changed.
      if (generation === this.startGeneration) {
        this.localChange = true;
        this.observe();
      }
      return;
    }

    const { proposal } = taken;
    const { action } = proposal;
    this.inFlightDispatches += 1;
    this.publish();
    void this.dispatchWithTrace(action, 'tutorial-machine', proposal, snapshot)
      .then((outcome) => {
        if (generation !== this.startGeneration) return;
        if (action.type !== 'MulliganDecision') return;
        this.machine = settleMulliganDecision(this.machine, action, outcome.kind === 'accepted');
        // Only a confirmed redraw consumes the lesson's budget. A settled
        // mulligan re-runs the reducer against Phase's latest snapshot.
        if (outcome.kind === 'accepted') this.localChange = true;
      })
      .catch((failure: unknown) => {
        if (generation !== this.startGeneration) return;
        this.error = failure instanceof Error ? failure.message : String(failure);
        if (action.type === 'MulliganDecision') {
          this.machine = settleMulliganDecision(this.machine, action, false);
        }
      })
      .finally(() => {
        // Release the exact slot this dispatch took. Restart replaces the slot;
        // an old completion must not unlock or flush the new lesson's action.
        slot.release();
        if (generation !== this.startGeneration) return;
        this.inFlightDispatches = Math.max(0, this.inFlightDispatches - 1);
        this.publish();
        const latest = this.engine.snapshot;
        if (this.localChange || (latest && (latest.revision !== this.lastRevision || latest.viewer !== this.lastViewer))) {
          this.localChange = true;
          this.observe();
        }
        this.flush();
      });
  }

  private async dispatchWithTrace(
    action: GameAction,
    source: Exclude<TutorialTraceSource, 'await-learner'>,
    proposal: ActionSlotProposal,
    snapshot: EngineSnapshot
  ): Promise<DispatchOutcome> {
    const facts = learnerLandFacts(snapshot, this.context);
    const common = {
      learnerSeat: 'learner' as const,
      dummySeat: 'mannequin' as const,
      actorSeat: seatRole(proposal.viewer, this.context),
      proposalRevision: proposal.revision,
      actionType: action.type,
      step: STEPS[proposal.step]?.id ?? 'unknown',
      phase: snapshot.state.phase,
      waiting: snapshot.state.waiting_for.type,
      turn: snapshot.state.turn_number,
      ...facts
    };
    try {
      const outcome = await this.engine.dispatch(action, {
        viewer: proposal.viewer,
        revision: proposal.revision
      });
      recordTutorialTrace({
        event: 'dispatch',
        source,
        ...common,
        dispatchRevision: outcome.actionRevision ?? null,
        phaseResult: outcome.kind,
        phaseCode: outcome.code ?? null
      });
      return outcome;
    } catch (failure) {
      recordTutorialTrace({
        event: 'dispatch',
        source,
        ...common,
        dispatchRevision: null,
        phaseResult: 'failed',
        phaseCode: 'transport_error'
      });
      throw failure;
    }
  }

  /** The primary button of the lesson panel. */
  async act(): Promise<void> {
    if (this.inFlightDispatches > 0) return;
    const stepIndex = this.machine.step;
    const step = STEPS[Math.min(stepIndex, STEPS.length - 1)];
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
    if (!snapshot || !action) {
      this.message = 'El motor todavía no ofrece esa acción. Espera un momento o salta el paso.';
      this.publish();
      return;
    }
    const proposal: ActionSlotProposal = {
      action,
      viewer: snapshot.viewer,
      revision: snapshot.revision,
      step: stepIndex
    };
    const generation = this.startGeneration;
    this.inFlightDispatches += 1;
    this.publish();
    try {
      const outcome = await this.dispatchWithTrace(action, 'learner', proposal, snapshot);
      if (generation === this.startGeneration && outcome.kind === 'stale') {
        this.message = 'La partida cambió antes de enviar la acción. Revisa la nueva vista y vuelve a intentarlo.';
      }
    } catch (failure) {
      if (generation === this.startGeneration) {
        this.error = failure instanceof Error ? failure.message : String(failure);
      }
    } finally {
      if (generation === this.startGeneration) {
        this.inFlightDispatches = Math.max(0, this.inFlightDispatches - 1);
        this.publish();
      }
    }
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
      busy: this.inFlightDispatches > 0,
      learnerTurn: this.machine.learnerTurn,
      notes: this.machine.notes
    };
  }
}

export const tutorial = new TutorialController();

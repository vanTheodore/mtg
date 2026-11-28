/**
 * A proposal is useful only for the exact Phase snapshot it was derived from.
 * The actor and revision travel with the action so a queued decision cannot be
 * sent after the viewer or game has moved on.
 */
import type { GameAction } from '#lib/engine/types.ts';

export interface ActionSlotProposal {
  action: GameAction;
  /** The logical Phase viewer that proposed the action. */
  viewer: number;
  /** The Phase revision whose legal actions were read. */
  revision: number;
  /** Pedagogical step that produced the proposal. */
  step: number;
}

export interface ActionSlotIdentity {
  viewer: number;
  revision: number;
}

export type ActionSlotTake =
  | { kind: 'empty' }
  | { kind: 'busy' }
  | { kind: 'stale'; proposal: ActionSlotProposal }
  | { kind: 'ready'; proposal: ActionSlotProposal };

/**
 * One action may be in flight while the next Phase snapshot arrives. Keep only
 * the newest proposal, and validate its actor/revision at the send boundary.
 */
export class ActionSlot {
  private busy = false;
  private pending: ActionSlotProposal | null = null;

  /** True while an action is in flight. */
  get isBusy(): boolean {
    return this.busy;
  }

  /** The proposal waiting for the engine to be free, if any. */
  get waiting(): ActionSlotProposal | null {
    return this.pending;
  }

  /** Replace the waiting decision with the newest snapshot's proposal. */
  propose(proposal: ActionSlotProposal | null): void {
    this.pending = proposal;
  }

  /**
   * Take a proposal only when it still belongs to the current Phase snapshot.
   * A stale proposal is consumed without setting the in-flight lock; the caller
   * must re-observe Phase and build a new action instead of reusing its payload.
   */
  take(current: ActionSlotIdentity): ActionSlotTake {
    if (this.busy) return { kind: 'busy' };
    if (!this.pending) return { kind: 'empty' };

    const proposal = this.pending;
    this.pending = null;
    if (proposal.viewer !== current.viewer || proposal.revision !== current.revision) {
      return { kind: 'stale', proposal };
    }

    this.busy = true;
    return { kind: 'ready', proposal };
  }

  /** The engine finished with the proposal that was in flight. */
  release(): void {
    this.busy = false;
  }
}

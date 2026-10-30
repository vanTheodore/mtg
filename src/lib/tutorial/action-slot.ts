/**
 * Mesa 0.6 — one action at a time.
 *
 * The engine accepts a single action at a time. When a new decision arrives
 * while the previous one is still in flight, the new one has to **wait** and
 * the oldest one must not be thrown away: the lesson walks a chain of priority
 * windows (upkeep → draw → main phase) and losing one of them would leave the
 * learner waiting for a moment that never arrives.
 *
 * This class is pure and small on purpose: the rule it encodes is the one
 * that broke the first browser run, so it has its own test.
 */
import type { GameAction } from '#lib/engine/types.ts';

export class ActionSlot {
  private busy = false;
  private pending: GameAction | null = null;

  /** True while an action is in flight. */
  get isBusy(): boolean {
    return this.busy;
  }

  /** The action waiting for the engine to be free, if any. */
  get waiting(): GameAction | null {
    return this.pending;
  }

  /**
   * Record the newest decision. It replaces whatever was waiting: both
   * describe the same (latest) snapshot, and only the newest can be legal.
   */
  propose(action: GameAction | null): void {
    this.pending = action;
  }

  /**
   * Take the waiting action when the engine is free. Returns `null` while
   * another action is in flight; the action stays waiting.
   */
  take(): GameAction | null {
    if (this.busy || !this.pending) return null;
    const action = this.pending;
    this.pending = null;
    this.busy = true;
    return action;
  }

  /** The engine finished with the action that was in flight. */
  release(): void {
    this.busy = false;
  }
}

import type { GameAction } from '#lib/engine/types.ts';
import type { DispatchOutcomeKind } from './dispatchOutcome.ts';

/** The engine's persistent, per-seat priority preference. */
export type PriorityMode = 'Standard' | 'SkipLowUseWindows';
export type EffectivePriorityMode = PriorityMode | 'FullControl';
export type PhaseStopScope = 'AllTurns' | 'OwnTurn' | 'OpponentsTurns';
export type TurnBoundary = 'EndOfCurrentTurn' | 'MyNextTurnStart';

export interface PhaseStopPreference {
  phase: string;
  scope: PhaseStopScope;
}

export interface SeatPriorityPreferences {
  mode: PriorityMode;
  stops: Record<string, PhaseStopScope>;
}

/** Identity captured when Phase recommends a pass. This is a dispatch guard,
 * not a priority policy: `recommended` is always copied from the engine DTO. */
export interface PriorityWindowAnchor {
  game: number;
  actor: number;
  revision: number;
  activePlayer: number;
  phase: string;
  preferencesVersion: number;
  waitingFor: string;
  recommended: boolean;
  outcome: boolean;
}

export type AutoPassResult = DispatchOutcomeKind;

export const PRIORITY_PHASES = [
  'Untap', 'Upkeep', 'Draw', 'PreCombatMain', 'BeginCombat', 'DeclareAttackers',
  'DeclareBlockers', 'CombatDamage', 'EndCombat', 'PostCombatMain', 'End', 'Cleanup'
] as const;

const PHASE_SET = new Set<string>(PRIORITY_PHASES);
const MODE_SET = new Set<string>(['Standard', 'SkipLowUseWindows']);
const SCOPE_SET = new Set<string>(['AllTurns', 'OwnTurn', 'OpponentsTurns']);

export function isPriorityMode(value: unknown): value is PriorityMode {
  return typeof value === 'string' && MODE_SET.has(value);
}

export function isPhaseStopScope(value: unknown): value is PhaseStopScope {
  return typeof value === 'string' && SCOPE_SET.has(value);
}

/** Migrate Mesa's former boolean map without broadening it to another seat. */
export function readSeatPriorityPreferences(value: unknown): Record<string, SeatPriorityPreferences> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, SeatPriorityPreferences> = {};
  for (const [seat, raw] of Object.entries(value as Record<string, unknown>)) {
    if (seat !== '0' && seat !== '1') continue;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const candidate = raw as Record<string, unknown>;
    const stops: Record<string, PhaseStopScope> = {};
    if (candidate.stops && typeof candidate.stops === 'object' && !Array.isArray(candidate.stops)) {
      for (const [phase, scope] of Object.entries(candidate.stops as Record<string, unknown>)) {
        if (!PHASE_SET.has(phase)) continue;
        // Old `mesa:stops` entries were booleans and meant every turn.
        if (scope === true) stops[phase] = 'AllTurns';
        else if (isPhaseStopScope(scope)) stops[phase] = scope;
      }
    }
    result[seat] = {
      mode: isPriorityMode(candidate.mode) ? candidate.mode : 'Standard',
      stops
    };
  }
  return result;
}

/** Phase's exact cycle: off → all turns → own turn → opponents' turns → off. */
export function nextPhaseStopScope(scope: PhaseStopScope | undefined): PhaseStopScope | undefined {
  switch (scope) {
    case undefined: return 'AllTurns';
    case 'AllTurns': return 'OwnTurn';
    case 'OwnTurn': return 'OpponentsTurns';
    case 'OpponentsTurns': return undefined;
  }
}

export function phaseStopApplies(scope: PhaseStopScope, owner: number, activePlayer: number): boolean {
  switch (scope) {
    case 'AllTurns': return true;
    case 'OwnTurn': return owner === activePlayer;
    case 'OpponentsTurns': return owner !== activePlayer;
  }
}

export function priorityModeAction(mode: EffectivePriorityMode): GameAction {
  return { type: 'SetPriorityPassingMode', data: { mode } };
}

export function phaseStopsAction(stops: Record<string, PhaseStopScope>): GameAction {
  const wire: PhaseStopPreference[] = Object.entries(stops)
    .filter(([phase]) => PHASE_SET.has(phase))
    .sort(([a], [b]) => PRIORITY_PHASES.indexOf(a as (typeof PRIORITY_PHASES)[number]) - PRIORITY_PHASES.indexOf(b as (typeof PRIORITY_PHASES)[number]))
    .map(([phase, scope]) => ({ phase, scope }));
  return { type: 'SetPhaseStops', data: { stops: wire } };
}

export function autoPassUntilBoundaryAction(until: TurnBoundary): GameAction {
  return { type: 'SetAutoPass', data: { mode: { type: 'UntilTurnBoundary', until } } };
}

export function resolveAllOwnAction(): GameAction {
  // This is deliberately `Own`, never Shared: the request cannot stand in for
  // another seat's pass or consent. Phase owns all stopping/choice boundaries.
  return { type: 'BeginResolveAll', data: { max_resolutions: 0, scope: { type: 'Own' } } };
}

export function cancelAutoPassAction(): GameAction {
  return { type: 'CancelAutoPass' };
}

export function priorityWindowMatches(anchor: PriorityWindowAnchor, current: PriorityWindowAnchor | null): boolean {
  return !!current
    && anchor.waitingFor === 'Priority'
    && anchor.recommended
    && !anchor.outcome
    && current.game === anchor.game
    && current.actor === anchor.actor
    && current.revision === anchor.revision
    && current.activePlayer === anchor.activePlayer
    && current.phase === anchor.phase
    && current.preferencesVersion === anchor.preferencesVersion
    && current.waitingFor === anchor.waitingFor
    && current.recommended === anchor.recommended
    && !current.outcome;
}

/**
 * Microtask gate for one engine-recommended pass. It only debounces and guards
 * dispatch; it never decides whether a window is safe. A manual action or any
 * preference/session/revision change invalidates the queued ticket. A rejected
 * send halts this automation until an explicit user action resumes it.
 */
export class PriorityPassGate {
  private ticket = 0;
  private sendEpoch = 0;
  private queued = false;
  private sending = false;
  private halted = false;

  get pending(): boolean { return this.queued || this.sending; }
  get paused(): boolean { return this.halted; }

  invalidate(): void {
    this.ticket += 1;
    this.queued = false;
  }


  pause(): void {
    this.halted = true;
    this.invalidate();
  }

  resume(): void {
    this.halted = false;
    this.invalidate();
  }

  reset(): void {
    this.halted = false;
    this.sendEpoch += 1;
    this.sending = false;
    this.invalidate();
  }

  schedule(
    anchor: PriorityWindowAnchor,
    current: () => PriorityWindowAnchor | null,
    send: (anchor: PriorityWindowAnchor, stillCurrent: () => boolean) => Promise<AutoPassResult>,
    settled: (result: AutoPassResult) => void
  ): void {
    if (this.halted || this.queued || this.sending || !priorityWindowMatches(anchor, current())) return;
    const ticket = ++this.ticket;
    this.queued = true;
    queueMicrotask(() => {
      if (ticket !== this.ticket) return;
      this.queued = false;
      if (this.halted || !priorityWindowMatches(anchor, current())) return;
      this.sending = true;
      const sendEpoch = this.sendEpoch;
      let result: AutoPassResult = 'rejected';
      const stillCurrent = (): boolean => sendEpoch === this.sendEpoch
        && ticket === this.ticket
        && !this.halted
        && priorityWindowMatches(anchor, current());
      void send(anchor, stillCurrent)
        .then((value) => { result = value; })
        .catch(() => { result = 'failed'; })
        .finally(() => {
          // A reset/new game owns a newer gate epoch; an older in-flight
          // promise must not settle into it or clear its sending flag.
          if (sendEpoch !== this.sendEpoch) return;
          this.sending = false;
          if (result === 'stale' || result === 'rejected' || result === 'failed') this.pause();
          settled(result);
        });
    });
  }
}

import { describe, expect, test } from 'bun:test';
import {
  autoPassUntilBoundaryAction,
  nextPhaseStopScope,
  phaseStopApplies,
  phaseStopsAction,
  priorityModeAction,
  priorityWindowMatches,
  PriorityPassGate,
  cancelAutoPassAction,
  readSeatPriorityPreferences,
  resolveAllOwnAction,
  type PriorityWindowAnchor
} from '../priority.ts';

const idle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const anchor: PriorityWindowAnchor = {
  game: 4,
  actor: 0,
  revision: 12,
  activePlayer: 1,
  phase: 'DeclareBlockers',
  preferencesVersion: 3,
  waitingFor: 'Priority',
  recommended: true,
  outcome: false
};

describe('UX-PRIORITY · preferencias y gate', () => {
  test('migra las paradas booleanas sólo al asiento 0 y no inventa fases o modos', () => {
    expect(readSeatPriorityPreferences({
      0: { mode: 'SkipLowUseWindows', stops: { DeclareBlockers: true, Cleanup: 'OwnTurn', NotAPhase: true } },
      1: { mode: 'FullControl', stops: { Draw: 'OpponentsTurns' } },
      2: { mode: 'SkipLowUseWindows', stops: { Draw: true } }
    })).toEqual({
      0: {
        mode: 'SkipLowUseWindows',
        stops: { DeclareBlockers: 'AllTurns', Cleanup: 'OwnTurn' }
      },
      1: { mode: 'Standard', stops: { Draw: 'OpponentsTurns' } }
    });
  });

  test('el ciclo de alcance es apagado → todos → propio → oponentes → apagado', () => {
    const states = [undefined, 'AllTurns', 'OwnTurn', 'OpponentsTurns'] as const;
    expect(states.map((state) => nextPhaseStopScope(state))).toEqual([
      'AllTurns', 'OwnTurn', 'OpponentsTurns', undefined
    ]);
    expect(phaseStopApplies('AllTurns', 0, 1)).toBe(true);
    expect(phaseStopApplies('OwnTurn', 0, 0)).toBe(true);
    expect(phaseStopApplies('OwnTurn', 0, 1)).toBe(false);
    expect(phaseStopApplies('OpponentsTurns', 0, 1)).toBe(true);
    expect(phaseStopApplies('OpponentsTurns', 0, 0)).toBe(false);
  });

  test('las acciones conservan scopes Phase, y Resolve All siempre es Own', () => {
    expect(priorityModeAction('FullControl')).toEqual({
      type: 'SetPriorityPassingMode', data: { mode: 'FullControl' }
    });
    expect(phaseStopsAction({ DeclareBlockers: 'OwnTurn', Cleanup: 'OpponentsTurns' })).toEqual({
      type: 'SetPhaseStops',
      data: { stops: [
        { phase: 'DeclareBlockers', scope: 'OwnTurn' },
        { phase: 'Cleanup', scope: 'OpponentsTurns' }
      ] }
    });
    expect(autoPassUntilBoundaryAction('MyNextTurnStart')).toEqual({
      type: 'SetAutoPass',
      data: { mode: { type: 'UntilTurnBoundary', until: 'MyNextTurnStart' } }
    });
    expect(resolveAllOwnAction()).toEqual({
      type: 'BeginResolveAll',
      data: { max_resolutions: 0, scope: { type: 'Own' } }
    });
    expect(cancelAutoPassAction()).toEqual({ type: 'CancelAutoPass' });
  });

  test('una recomendación queda atada a su actor, revisión, fase, preferencias y recomendación Phase', () => {
    expect(priorityWindowMatches(anchor, { ...anchor })).toBe(true);
    for (const patch of [
      { actor: 1 }, { revision: 13 }, { phase: 'End' },
      { preferencesVersion: 4 }, { waitingFor: 'TargetSelection' },
      { recommended: false }, { outcome: true }, { game: 5 }
    ]) {
      expect(priorityWindowMatches(anchor, { ...anchor, ...patch })).toBe(false);
    }
    expect(priorityWindowMatches(anchor, null)).toBe(false);
    expect(priorityWindowMatches({ ...anchor, waitingFor: 'TargetSelection' }, { ...anchor })).toBe(false);
    expect(priorityWindowMatches({ ...anchor, recommended: false }, { ...anchor })).toBe(false);
    expect(priorityWindowMatches({ ...anchor, outcome: true }, { ...anchor })).toBe(false);
  });

  test('un cambio de asiento, revisión, alcance, Phase o fin revoca el ticket antes del envío', async () => {
    for (const patch of [
      { game: 5 }, { actor: 1 }, { revision: 13 }, { activePlayer: 0 },
      { phase: 'End' }, { preferencesVersion: 4 }, { waitingFor: 'TargetSelection' },
      { recommended: false }, { outcome: true }
    ]) {
      const gate = new PriorityPassGate();
      let current: PriorityWindowAnchor | null = { ...anchor };
      let sends = 0;
      gate.schedule(anchor, () => current, async () => { sends += 1; return 'accepted'; }, () => {});
      current = { ...anchor, ...patch };
      await idle();
      expect(sends, JSON.stringify(patch)).toBe(0);
    }
  });

  test('un rechazo pausa la puerta y no vuelve a intentar hasta reanudar', async () => {
    const gate = new PriorityPassGate();
    let sends = 0;
    const settlements: string[] = [];
    const send = async () => { sends += 1; return 'rejected' as const; };
    gate.schedule(anchor, () => anchor, send, (result) => { settlements.push(result); });
    await idle();
    expect(sends).toBe(1);
    expect(settlements).toEqual(['rejected']);
    expect(gate.paused).toBe(true);
    gate.schedule(anchor, () => anchor, send, () => {});
    await idle();
    expect(sends).toBe(1);
    gate.resume();
    gate.schedule(anchor, () => anchor, async () => { sends += 1; return 'accepted'; }, () => {});
    await idle();
    expect(sends).toBe(2);
  });

  test('stale_action pausa y sólo una reanudación explícita permite un nuevo envío', async () => {
    const gate = new PriorityPassGate();
    let sends = 0;
    const settled: string[] = [];
    const stale = async () => { sends += 1; return 'stale' as const; };
    gate.schedule(anchor, () => anchor, stale, (result) => settled.push(result));
    await idle();
    expect(sends).toBe(1);
    expect(settled).toEqual(['stale']);
    expect(gate.paused).toBe(true);

    gate.schedule(anchor, () => anchor, stale, () => {});
    await idle();
    expect(sends).toBe(1);
    gate.resume();
    gate.schedule(anchor, () => anchor, async () => { sends += 1; return 'accepted'; }, () => {});
    await idle();
    expect(sends).toBe(2);
    expect(gate.paused).toBe(false);
  });

  test('pausar no retira una acción que ya salió; sí bloquea el siguiente pase', async () => {
    const gate = new PriorityPassGate();
    const inFlight: {
      resolve?: (result: 'accepted') => void;
      stillCurrent?: () => boolean;
    } = {};
    let sends = 0;
    const settlements: string[] = [];
    gate.schedule(anchor, () => anchor, async (_captured, current) => {
      sends += 1;
      inFlight.stillCurrent = current;
      return new Promise<'accepted'>((resolve) => { inFlight.resolve = resolve; });
    }, (result) => settlements.push(result));
    await idle();
    expect(sends).toBe(1);
    expect(inFlight.stillCurrent?.()).toBe(true);

    gate.pause();
    expect(inFlight.stillCurrent?.()).toBe(false);
    inFlight.resolve?.('accepted');
    await idle();
    expect(settlements).toEqual(['accepted']);
    expect(gate.paused).toBe(true);

    gate.schedule(anchor, () => anchor, async () => { sends += 1; return 'accepted'; }, () => {});
    await idle();
    expect(sends).toBe(1);
  });

  test('un fallo de transporte pausa y requiere recuperación explícita', async () => {
    const gate = new PriorityPassGate();
    let sends = 0;
    const settlements: string[] = [];
    gate.schedule(anchor, () => anchor, async () => {
      sends += 1;
      throw new Error('worker disconnected');
    }, (result) => settlements.push(result));
    await idle();
    expect(sends).toBe(1);
    expect(settlements).toEqual(['failed']);
    expect(gate.paused).toBe(true);
    gate.schedule(anchor, () => anchor, async () => { sends += 1; return 'accepted'; }, () => {});
    await idle();
    expect(sends).toBe(1);
    gate.resume();
    gate.schedule(anchor, () => anchor, async () => { sends += 1; return 'accepted'; }, () => {});
    await idle();
    expect(sends).toBe(2);
  });

  test('una acción manual concurrente invalida el pase encolado antes del envío', async () => {
    const gate = new PriorityPassGate();
    let automaticSends = 0;
    let manualActions = 0;
    gate.schedule(anchor, () => anchor, async () => { automaticSends += 1; return 'accepted'; }, () => {});
    // GameSession.dispatch invalidates the ticket synchronously before it
    // appends the user's action to the same serial queue.
    manualActions += 1;
    gate.invalidate();
    await idle();
    expect(manualActions).toBe(1);
    expect(automaticSends).toBe(0);
  });

  test('un envío de una partida anterior no limpia ni resuelve el gate nuevo', async () => {
    const gate = new PriorityPassGate();
    const resolvers: ((result: 'accepted') => void)[] = [];
    const settlements: string[] = [];
    const send = () => new Promise<'accepted'>((resolve) => resolvers.push(resolve));

    gate.schedule(anchor, () => anchor, send, (result) => settlements.push(`old:${result}`));
    await idle();
    expect(resolvers).toHaveLength(1);

    gate.reset();
    gate.schedule(anchor, () => anchor, send, (result) => settlements.push(`new:${result}`));
    await idle();
    expect(resolvers).toHaveLength(2);

    resolvers[0]('accepted');
    await idle();
    expect(settlements).toEqual([]);

    resolvers[1]('accepted');
    await idle();
    expect(settlements).toEqual(['new:accepted']);
  });
});

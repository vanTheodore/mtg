import { describe, expect, test } from 'bun:test';
import { PHASE_GROUPS, phaseLabel, seatStatus } from './phases.ts';

describe('phase labels', () => {
  test('every step inside the turn track has its own label', () => {
    for (const group of PHASE_GROUPS) {
      for (const value of group.values) {
        expect(phaseLabel(value)).not.toBe(value);
      }
    }
  });

  test('an unknown step keeps the engine word instead of rendering blank', () => {
    expect(phaseLabel('SomeFutureStep')).toBe('SomeFutureStep');
  });

  test('missing phases render as empty, not "undefined"', () => {
    expect(phaseLabel('')).toBe('');
    expect(phaseLabel(null)).toBe('');
    expect(phaseLabel(undefined)).toBe('');
  });
});

describe('seat status', () => {
  test('a priority window held by the viewer reads as yours', () => {
    expect(seatStatus({ type: 'Priority', data: { player: 0 } }, 0)).toEqual({ label: 'Tu prioridad', tone: 'mine' });
  });

  test('a priority window held by the rival names that seat', () => {
    expect(seatStatus({ type: 'Priority', data: { player: 1 } }, 0)).toEqual({
      label: 'Prioridad del Jugador 2',
      tone: 'theirs'
    });
  });

  test('any other prompt the viewer has to answer reads as a decision', () => {
    expect(seatStatus({ type: 'TargetSelection', data: { player: 0 } }, 0)).toEqual({
      label: 'Te toca decidir',
      tone: 'mine'
    });
  });

  test('a prompt without a named seat does not invent a player number', () => {
    expect(seatStatus({ type: 'Priority', data: {} }, 0)).toEqual({ label: 'Prioridad abierta', tone: 'theirs' });
    expect(seatStatus({ type: 'DeclareBlockers', data: {} }, 0)).toEqual({
      label: 'Esperando al motor',
      tone: 'theirs'
    });
  });

  test('no snapshot reads as no game', () => {
    expect(seatStatus(null, 0)).toEqual({ label: 'Sin partida', tone: 'idle' });
  });
});

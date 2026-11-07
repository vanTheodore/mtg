/**
 * Presentation-only names for the step and priority the engine reports.
 *
 * Phase is the authority: nothing here decides whether a window exists or who
 * holds priority. These helpers only turn the strings Phase already sends into
 * the short labels the table chrome shows, and they return the raw value when a
 * step is not in the table (an upstream addition must never render as blank).
 */

export type PhaseGroup = { label: string; values: readonly string[] };

/** The five segments the arena turn track draws, in turn order. */
export const PHASE_GROUPS: readonly PhaseGroup[] = [
  { label: 'Inicio', values: ['Untap', 'Upkeep', 'Draw'] },
  { label: 'Principal', values: ['PreCombatMain'] },
  { label: 'Combate', values: ['BeginCombat', 'DeclareAttackers', 'DeclareBlockers', 'CombatDamage', 'EndCombat'] },
  { label: 'Principal 2', values: ['PostCombatMain'] },
  { label: 'Final', values: ['End', 'Cleanup'] }
];

/** Every step Phase names, with the label a seat plate or dock prints. */
const STEP_LABELS: Readonly<Record<string, string>> = {
  Untap: 'Enderezar',
  Upkeep: 'Mantenimiento',
  Draw: 'Robar',
  PreCombatMain: 'Principal 1',
  BeginCombat: 'Inicio del combate',
  DeclareAttackers: 'Declarar atacantes',
  DeclareBlockers: 'Declarar bloqueadoras',
  CombatDamage: 'Daño de combate',
  EndCombat: 'Fin del combate',
  PostCombatMain: 'Principal 2',
  End: 'Paso final',
  Cleanup: 'Limpieza'
};

/** `''` and `undefined` become `''`; unknown steps keep the engine's word. */
export function phaseLabel(phase: string | null | undefined): string {
  if (!phase) return '';
  return STEP_LABELS[phase] ?? phase;
}

export type SeatStatusTone = 'mine' | 'theirs' | 'idle';

export type SeatStatus = { label: string; tone: SeatStatusTone };

type WaitingLike = { type?: string; data?: { player?: number } } | null | undefined;

/**
 * Who the table is waiting on, in the words the dock prints.
 *
 * `Priority` is special-cased because it is the one window where "it is your
 * turn to act" and "the engine just wants a pass" mean different things; every
 * other prompt is a decision the waiting seat has to make.
 */
export function seatStatus(waiting: WaitingLike, viewer: number): SeatStatus {
  const type = waiting?.type;
  if (!type) return { label: 'Sin partida', tone: 'idle' };
  const seat = waiting?.data?.player;
  const mine = seat === viewer;
  if (type === 'Priority') {
    return mine
      ? { label: 'Tu prioridad', tone: 'mine' }
      : { label: seat === undefined ? 'Prioridad abierta' : `Prioridad del Jugador ${seat + 1}`, tone: 'theirs' };
  }
  return mine
    ? { label: 'Te toca decidir', tone: 'mine' }
    : { label: seat === undefined ? 'Esperando al motor' : `Esperando al Jugador ${seat + 1}`, tone: 'theirs' };
}

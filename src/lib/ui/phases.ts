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

export type PhaseStep = {
  value: string;
  label: string;
  short: string;
  /**
   * The chip's label when the twelve steps share a 316 px rail and the short
   * one still does not fit (docs/PHASE-UX-PORT.md, difference 3). Only the
   * longest four have one; the rest print `short`.
   */
  tiny?: string;
};

/**
 * The twelve steps of a turn, in the order Phase walks them, with the label a
 * stop button prints. `short` exists because twelve full labels do not fit in
 * one row at 320 px (`docs/PHASE-UX-PORT.md`); the accessible name uses the
 * full one.
 */
export const PHASE_STEPS: readonly PhaseStep[] = [
  { value: 'Untap', label: 'Enderezar', short: 'Enderezar' },
  { value: 'Upkeep', label: 'Mantenimiento', short: 'Mantener' },
  { value: 'Draw', label: 'Robar', short: 'Robar' },
  { value: 'PreCombatMain', label: 'Principal 1', short: 'Principal' },
  { value: 'BeginCombat', label: 'Inicio del combate', short: 'Combate', tiny: 'Comb.' },
  { value: 'DeclareAttackers', label: 'Declarar atacantes', short: 'Atacar' },
  { value: 'DeclareBlockers', label: 'Declarar bloqueadoras', short: 'Bloquear', tiny: 'Bloq.' },
  { value: 'CombatDamage', label: 'Daño de combate', short: 'Daño' },
  { value: 'EndCombat', label: 'Fin del combate', short: 'Fin combate', tiny: 'Fin c.' },
  { value: 'PostCombatMain', label: 'Principal 2', short: 'Principal 2', tiny: 'Princ. 2' },
  { value: 'End', label: 'Paso final', short: 'Final' },
  { value: 'Cleanup', label: 'Limpieza', short: 'Limpieza' }
];

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

/**
 * How the twelve step chips fit in the width the rail gives them.
 *
 * This is the measurement behind `docs/PHASE-UX-PORT.md` difference 3: the row
 * used to hold 868 px of chips in a 362 px rail and silently clipped eight of
 * the twelve steps at 1440 and 1280. The decision below is a pure function of
 * the *available* width on purpose — a rule that depended on the rendered
 * content would re-render, re-measure, and oscillate (measured: 366 ↔ 362 on
 * every ResizeObserver tick).
 *
 * The numbers are measured, not chosen: twelve chips with their short labels
 * need ~700 px to read whole, and 592 px with the four long ones abbreviated —
 * so a narrower one-line row only "fits" by ellipsising every label, the same
 * failure as clipping, quieter.
 */
export type StepRowLayout = 'row' | 'wrap';

export interface StepRowFit {
  layout: StepRowLayout;
  /** Print the abbreviated label for the four long steps. */
  abbreviated: boolean;
  /** Drop the turn caption: the chips are the information this wide. */
  compact: boolean;
}

/**
 * Below this the twelve short labels cannot be read on one line.
 *
 * Measured with the bar on the table (the repo's Chromium, injected fixture;
 * `probe` in the notes of `docs/PHASE-UX-PORT.md`): the row needs **746 px** for
 * the twelve short labels and **656 px** with the four long ones abbreviated.
 * The rail band now gives the bar 712 px at 1100×700, 892 at 1280 and 1052 at
 * 1440 — so 1100 is the width that decides this: there the twelve short labels
 * do not fit (it wrapped, and the row measured `scrollWidth` 12 px short per
 * chip at 1100 while reading whole at 1180), but the abbreviated ones do, on
 * one line. Above 746 nothing is abbreviated; above 656 the row stays one line.
 */
export const STEP_ROW_ONE_LINE_PX = 746;
/** Below this even the abbreviated labels do not fit on one line: wrap. */
export const STEP_ROW_ABBREVIATED_PX = 656;

export function stepRowFit(width: number): StepRowFit {
  if (!Number.isFinite(width) || width <= 0) {
    // Not laid out yet: assume the worst so the first paint is the wrapped,
    // fully-labelled row rather than a clipped one.
    return { layout: 'wrap', abbreviated: false, compact: false };
  }
  return {
    // Una línea mientras quepa *algo* que se lea: primero se abrevian los
    // cuatro rótulos largos (746 → 656 px) y sólo por debajo de 656 la fila
    // envuelve en dos.
    layout: width < STEP_ROW_ABBREVIATED_PX ? 'wrap' : 'row',
    abbreviated: width < STEP_ROW_ONE_LINE_PX,
    compact: width < STEP_ROW_ABBREVIATED_PX
  };
}

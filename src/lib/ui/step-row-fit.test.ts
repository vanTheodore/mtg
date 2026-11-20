import { describe, expect, test } from 'bun:test';
import { PHASE_STEPS, STEP_ROW_ABBREVIATED_PX, STEP_ROW_ONE_LINE_PX, stepRowFit } from './phases.ts';

describe('la barra de fases cabe o lo dice (CR 500.1, doce pasos)', () => {
  test('las dos medidas reales del rail envuelven en dos líneas y no recortan', () => {
    // Medido antes del cambio: 362 px de rail a 1440 y 316 a 1280, con 868 px
    // de chips y 8 de los 12 pasos fuera de la vista.
    for (const width of [362, 316]) {
      const fit = stepRowFit(width);
      expect(fit.layout).toBe('wrap');
      expect(fit.abbreviated).toBe(true);
    }
  });

  test('sólo una fila cuando los doce rótulos cortos se leen enteros', () => {
    // 746 px es lo que mide la fila completa y 656 con los largos abreviados;
    // por debajo de eso la fila envuelve en dos.
    expect(stepRowFit(STEP_ROW_ONE_LINE_PX).layout).toBe('row');
    expect(stepRowFit(STEP_ROW_ABBREVIATED_PX - 1).layout).toBe('wrap');
  });

  test('los tres anchos que da la mesa en la banda del rail', () => {
    // Los anchos reales del carril central con la barra en la mesa: 712 a
    // 1100×700, 892 a 1280×800 y 1052 a 1440×900.
    expect(stepRowFit(712)).toEqual({ layout: 'row', abbreviated: true, compact: false });
    expect(stepRowFit(892)).toEqual({ layout: 'row', abbreviated: false, compact: false });
    expect(stepRowFit(1052)).toEqual({ layout: 'row', abbreviated: false, compact: false });
  });

  test('los cuatro rótulos largos tienen abreviatura y el resto no la necesita', () => {
    const withTiny = PHASE_STEPS.filter((step) => step.tiny);
    expect(withTiny.map((step) => step.value).sort()).toEqual(
      ['BeginCombat', 'DeclareBlockers', 'EndCombat', 'PostCombatMain']
    );
    for (const step of withTiny) expect(step.tiny!.length).toBeLessThan(step.short.length);
  });

  test('sin medir todavía se pinta la versión completa, nunca la recortada', () => {
    expect(stepRowFit(0)).toEqual({ layout: 'wrap', abbreviated: false, compact: false });
    expect(stepRowFit(Number.NaN)).toEqual({ layout: 'wrap', abbreviated: false, compact: false });
  });

  test('por debajo del umbral el subtítulo nombra el paso actual', () => {
    // `compact` es lo que hace que el subtítulo cambie "Turno N" por "Ahora: X".
    expect(stepRowFit(STEP_ROW_ABBREVIATED_PX - 1).compact).toBe(true);
    expect(stepRowFit(STEP_ROW_ABBREVIATED_PX).compact).toBe(false);
  });
});

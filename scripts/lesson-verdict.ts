/**
 * Veredicto de la lección guiada a partir del informe de Playwright.
 *
 * El código de salida del proceso de Playwright no siempre cuenta la historia:
 * en CI el runner puede terminar con un código distinto de cero aunque todas
 * las pruebas hayan pasado (por ejemplo, si el apagado del servidor de
 * desarrollo falla). Un rojo ahí no significa que la lección esté rota, y un
 * verde no debe tapar un fallo de verdad. Por eso el veredicto se lee del
 * informe JSON, que dice una sola cosa por prueba: pasó, falló o no se
 * ejecutó.
 *
 * Uso: bun scripts/lesson-verdict.ts results.json
 */

type PlaywrightReport = {
  stats?: {
    expected?: number;
    unexpected?: number;
    flaky?: number;
    skipped?: number;
  };
  errors?: { message?: string }[];
};

const file = process.argv[2];
if (!file) {
  console.error('Falta el informe de Playwright (uso: bun scripts/lesson-verdict.ts informe.json)');
  process.exit(1);
}

let report: PlaywrightReport;
try {
  report = JSON.parse(await Bun.file(file).text()) as PlaywrightReport;
} catch (error) {
  console.error(`No se pudo leer el informe ${file}: ${(error as Error).message}`);
  process.exit(1);
}

const stats = report.stats ?? {};
const expected = stats.expected ?? 0;
const unexpected = stats.unexpected ?? 0;
const flaky = stats.flaky ?? 0;
const skipped = stats.skipped ?? 0;
const errors = (report.errors ?? []).filter((error) => error.message?.trim());

if (unexpected > 0 || errors.length > 0) {
  console.error(`La lección NO pasó: ${unexpected} prueba(s) con fallo.`);
  for (const error of errors) console.error(`  · ${error.message}`);
  process.exit(1);
}

if (expected + flaky === 0) {
  console.error('El informe no contiene ninguna prueba ejecutada.');
  process.exit(1);
}

console.log(
  `La lección pasó: ${expected + flaky} prueba(s) en verde${flaky ? ` (${flaky} inestable)` : ''}${
    skipped ? `, ${skipped} omitida` : ''
  }.`
);

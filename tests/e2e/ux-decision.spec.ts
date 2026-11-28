import { expect, test, type Page } from '@playwright/test';
import { createBoardDriver } from './support/board-driver';
import {
  ENGINE_ACTION_OP,
  installEngineWorkerTrace,
  readEngineWorkerTrace,
  type WorkerTraceRequest,
  type WorkerTraceResponse
} from './support/engine-worker-trace';

/**
 * UX-DECISION 1.0 · transiciones reales del motor.
 *
 * Capa: **motor real**. Cada estado lo produce `GameScenario` en el job
 * `native-integration` (`static/e2e-scenarios/*.json`) y lo restaura el WASM
 * E2E aislado; el de producción sigue rechazando la operación 5
 * (`engine:verify-no-e2e-op`). No se recorren turnos ni se depende de barajadas.
 * Cuando se prueba la resolución de un hechizo se ejecutan las prioridades
 * reales que Phase pide.
 *
 * «No aceptes pruebas que puedan aprobar sin alcanzar el estado requerido»:
 * cada flujo comprueba `data-actions-applied` o `data-waiting`, nunca sólo la
 * presencia de un botón. Los errores de transporte no se simulan aquí: su
 * capa es `dispatchOutcome` (unitaria) y el gate de aislamiento WASM de CI.
 */
async function openScenario(page: Page, id: string) {
  await page.addInitScript(() => {
    localStorage.setItem('mesa:autoPass', 'off');
    localStorage.setItem('mesa:handoffMode', 'turn');
  });
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
  await page.goto(`/?e2e-scenario=${id}`);
  // `.hand-trigger` is mobile-only. The engine's own `data-waiting` attribute is
  // the viewport-independent proof that GameScenario actually restored state.
  const app = page.locator('.app');
  // The engine picks the acting seat: most fixtures show P0, but the real
  // DeclareBlockers window belongs to P1. Readiness is a published viewer
  // and a real waiting window, not a hardcoded seat.
  const viewer = await app.getAttribute('data-viewer');
  expect(viewer === '0' || viewer === '1').toBe(true);
  await expect
    .poll(
      async () => {
        const waiting = await app.getAttribute('data-waiting');
        return waiting && waiting !== 'none' ? waiting : null;
      },
      { timeout: 30_000 }
    )
    .not.toBeNull();
  await expect(page.locator('section[aria-label="Decisión pendiente"]')).toBeVisible();
  return createBoardDriver(page);
}

const panel = (page: Page) => page.locator('section[aria-label="Decisión pendiente"]');
const applied = (page: Page) => page.locator('.app').getAttribute('data-actions-applied');

test('prioridad con pila vacía: contexto, una acción principal y cesión real', async ({ page }) => {
  await openScenario(page, 'priority-empty');
  await expect(page.locator('.app')).toHaveAttribute('data-waiting', 'Priority');
  await expect(page.locator('[data-decision-context]')).toHaveAttribute('data-intent', 'Jugar');
  await expect(page.locator('[data-decision-context]')).toContainText('Prioridad: Jugador 1');
  const primary = page.locator('[data-decision-primary]');
  await expect(primary).toContainText('Pasar');
  await expect(page.locator('[data-decision-consequence]')).toContainText('no garantiza un cambio de fase');
  await expect(page.locator('[data-decision-integrity="true"]')).toHaveCount(1);

  const before = Number(await applied(page));
  await primary.click();
  await expect.poll(() => applied(page), { timeout: 10_000 }).not.toBe(String(before));
});

test('prioridad con hechizo pendiente: pila real, cesión contextual y resolución por prioridades reales', async ({ page }) => {
  // El lanzamiento recorre objetivo, pago y varias prioridades reales de Phase;
  // el techo por defecto de 120 s no deja margen para el arranque del WASM.
  test.setTimeout(180_000);
  const driver = await openScenario(page, 'priority-stack');
  const before = Number(await applied(page));
  const appliedNumber = async () => Number(await applied(page));
  // Lanzar el Rayo por la interfaz: la pila la crea Phase, no el test.
  const card = driver.hand.locator('[data-card-id]').first();
  await driver.clickCard(card);
  const cast = panel(page).locator('button').filter({ hasText: 'Lanzar' }).first();
  await expect(cast).toBeVisible();
  await cast.click();
  await expect.poll(appliedNumber, { timeout: 10_000 }).toBeGreaterThan(before);
  await expect(page.locator('section[aria-label="Pila"]')).toHaveAttribute('data-empty', 'false');

  const rivalLife = page.locator('.player-bar[data-player-id="1"]');
  const lifeBefore = Number(await rivalLife.getAttribute('data-life'));
  let sawResponseLabel = false;
  const trace: string[] = [];
  // Cada ventana la responde su control publicado, no el driver genérico:
  // así un bucle lento de «prueba todos los botones» no puede agotar el
  // timeout ni despachar una acción que Phase no pidió.
  for (let step = 0; step < 30; step += 1) {
    if (Number(await rivalLife.getAttribute('data-life')) < lifeBefore) break;
    await driver.settleSeat().catch(() => {});
    const waiting = await panel(page).getAttribute('data-waiting');
    trace.push(waiting ?? 'sin ventana');
    if (waiting === 'TargetSelection' || waiting === 'TriggerTargetSelection') {
      const details = panel(page).locator('details[data-target-list]');
      if (!(await details.count())) break;
      if (!(await details.evaluate((node: HTMLDetailsElement) => node.open))) await details.locator('summary').click();
      // Lightning Bolt debe apuntar al rival: la lista accesible publica los
      // dos jugadores y elegir el primero dispararía el hechizo contra P0.
      const choice = details.locator('button').filter({ hasText: /^Elegir Jugador 2$/ }).first();
      if (!(await choice.count())) {
        const labels = await details.locator('button').allInnerTexts();
        throw new Error(`la lista accesible no publicó «Elegir Jugador 2» (${labels.join(' | ')})`);
      }
      const stepBefore = Number(await applied(page));
      await choice.click();
      await expect.poll(appliedNumber, { timeout: 10_000 }).toBeGreaterThan(stepBefore);
      continue;
    }
    if (!['Priority', 'ManaPayment', 'ManaAbilityManaPayment', 'ManaSourceSelection'].includes(waiting ?? '')) break;
    const primary = page.locator('[data-decision-primary]');
    await expect(primary, `sin acción principal en ${waiting}`).toBeVisible({ timeout: 10_000 });
    const label = (await primary.textContent()) ?? '';
    if (label.includes('permitir respuestas')) sawResponseLabel = true;
    trace[trace.length - 1] += ` · ${label.trim()}`;
    const stepBefore = Number(await applied(page));
    await primary.click();
    await expect.poll(appliedNumber, { timeout: 10_000 }).toBeGreaterThan(stepBefore);
  }
  expect(sawResponseLabel, `no apareció «permitir respuestas» (${trace.join(' | ')})`).toBe(true);
  expect(Number(await rivalLife.getAttribute('data-life')), `el Rayo no resolvió contra el rival (${trace.join(' | ')})`).toBeLessThan(lifeBefore);
  await expect(page.locator('section[aria-label="Pila"]')).toHaveAttribute('data-empty', 'true');
});

test('respuesta durante el turno rival: intención y consecuencia del motor', async ({ page }) => {
  await openScenario(page, 'opponent-turn-response');
  await expect(page.locator('[data-decision-context]')).toHaveAttribute('data-intent', 'Responder');
  await expect(page.locator('[data-decision-consequence]')).toContainText('turno del Jugador 2');
  await expect(panel(page)).toHaveAttribute('data-waiting', 'Priority');
});

test('declaración de atacantes: no atacar y confirmar borrador son decisiones distintas', async ({ page }) => {
  const driver = await openScenario(page, 'declare-attackers');
  await expect(page.locator('.app')).toHaveAttribute('data-waiting', 'DeclareAttackers');
  const primary = page.locator('[data-decision-primary]');
  await expect(primary).toContainText('No atacar');
  const creature = driver.battlefield.locator('[data-card-id]').first();
  await expect(creature).toBeVisible();
  await driver.clickCard(creature);
  await expect(primary).toContainText('Confirmar ataque');
  const before = Number(await applied(page));
  await primary.click();
  await expect.poll(() => applied(page), { timeout: 10_000 }).not.toBe(String(before));
});

test('declaración de bloqueadores: no bloquear es explícito y el motor responde', async ({ page }) => {
  await openScenario(page, 'declare-blockers');
  await expect(page.locator('.app')).toHaveAttribute('data-waiting', 'DeclareBlockers');
  const primary = page.locator('[data-decision-primary]');
  await expect(primary).toContainText('No bloquear');
  const before = Number(await applied(page));
  await primary.click();
  await expect.poll(() => applied(page), { timeout: 10_000 }).not.toBe(String(before));
});

test('objetivos: selección directa, lista accesible y progreso sin duplicados', async ({ page }) => {
  const driver = await openScenario(page, 'target-cast');
  const card = driver.hand.locator('[data-card-id]').first();
  await driver.clickCard(card);
  await expect(panel(page).locator('[aria-label^="Carta seleccionada"]')).toBeVisible();
  // El pago manual es secundario: no compite con «Lanzar».
  const manual = panel(page).locator('button.manual[data-tier="secondary"]');
  await expect(manual).toContainText('eligiendo el maná manualmente');
  await expect(panel(page).locator('[data-tier="primary"]')).toHaveCount(0);
  const before = Number(await applied(page));
  await panel(page).locator('button').filter({ hasText: 'Lanzar' }).first().click();
  await expect.poll(() => applied(page), { timeout: 10_000 }).not.toBe(String(before));
  const waiting = await panel(page).getAttribute('data-waiting');
  expect(['TargetSelection', 'TriggerTargetSelection', 'ManaPayment', 'Priority']).toContain(waiting);
  if (waiting === 'TargetSelection' || waiting === 'TriggerTargetSelection') {
    await expect(panel(page).locator('details[data-target-list]')).toBeVisible();
    await expect(panel(page).locator('[data-decision-context] [data-decision-progress]').first()).toBeVisible();
  }
});

test('pago manual: accesible bajo demanda, nunca dominante', async ({ page }) => {
  const driver = await openScenario(page, 'manual-payment');
  await expect(page.locator('.app')).toHaveAttribute('data-waiting', 'Priority');
  // UX-DECISION 1.1: sin carta elegida no existe ningún comando de pago
  // derivado del primer CastSpell; el pago manual nace de la carta elegida.
  await expect(panel(page).locator('[data-starts-cast="true"]')).toHaveCount(0);
  await expect(page.locator('[data-decision-primary]')).not.toContainText('maná manualmente');
  const card = driver.hand.locator('[data-card-id]').first();
  await driver.clickCard(card);
  const manual = panel(page).locator('button.manual[data-tier="secondary"]');
  await expect(manual).toBeVisible();
  const before = Number(await applied(page));
  await manual.click();
  await expect.poll(() => applied(page), { timeout: 10_000 }).not.toBe(String(before));
  await expect(page.locator('[data-decision-integrity="true"]')).toHaveCount(1);
  expect(await driver.waiting()).not.toBe('Priority');
});

test('decisión obligatoria: KeepExact conserva la ventana exacta sin auto-selección', async ({ page }) => {
  await openScenario(page, 'obligatory-decision');
  await expect(page.locator('.app')).toHaveAttribute('data-waiting', 'KeepExactPermanentsChoice');
  await expect(panel(page).locator('[data-keep-exact]')).toBeVisible();
  await expect(panel(page).locator('[data-keep-exact-up-to]')).toHaveAttribute('data-keep-exact-up-to', 'false');
  await expect(page.locator('[data-decision-primary]')).toHaveCount(0);
});

test('decisión opcional: ambas ramas legales siguen en el especialista', async ({ page }) => {
  await openScenario(page, 'optional-decision');
  await expect(page.locator('.app')).toHaveAttribute('data-waiting', 'OptionalEffectChoice');
  await expect(panel(page).locator('[data-optional-effect]')).toBeVisible();
  await expect(panel(page).locator('[data-optional-effect] button')).toHaveCount(2);
  await expect(page.locator('[data-decision-primary]')).toHaveCount(0);
});

test('cancelación y busy: un doble pulso no despacha dos acciones', async ({ page }) => {
  await installEngineWorkerTrace(page);
  await openScenario(page, 'priority-empty');
  const primary = page.locator('[data-decision-primary]');
  const before = Number(await applied(page));
  const traceStart = (await readEngineWorkerTrace(page)).length;
  await Promise.all([primary.click({ force: true }), primary.click({ force: true }).catch(() => {})]);
  // `actions_applied` also counts the two seat-preference sync actions when
  // the pass hands priority to P1; count the user's PassPriority on the Worker
  // wire below instead of assuming a global counter delta of exactly one.
  await expect.poll(async () => Number(await applied(page)), { timeout: 10_000 }).toBeGreaterThan(before);
  await expect(page.locator('.app')).toHaveAttribute('data-busy', 'false');
  await expect(page.locator('[data-decision-integrity="true"]')).toHaveCount(1);

  const trace = (await readEngineWorkerTrace(page)).slice(traceStart);
  const passRequests = trace.filter((entry): entry is WorkerTraceRequest =>
    entry.kind === 'request'
      && entry.op === ENGINE_ACTION_OP
      && (entry.payload as { action?: { type?: string } } | undefined)?.action?.type === 'PassPriority'
  );
  expect(passRequests, 'el doble pulso no debe enviar una segunda acción al Worker').toHaveLength(1);
  const passReplies = trace.filter((entry): entry is WorkerTraceResponse =>
    entry.kind === 'response' && passRequests.some((request) => request.id === entry.id)
  );
  expect(passReplies, 'el despacho único debe recibir respuesta del Worker').toHaveLength(1);
  expect(passReplies[0]?.reply?.ok, 'Phase debe aceptar el único pase enviado').toBe(true);
});

test('cancelación del lanzamiento: la acción de seguridad está fuera del desplegable', async ({ page }) => {
  const driver = await openScenario(page, 'cancel-cast');
  const card = driver.hand.locator('[data-card-id]').first();
  await driver.clickCard(card);
  await panel(page).locator('button.manual[data-tier="secondary"]').click();
  const cancel = page.locator('[data-decision-cancel]');
  await expect(cancel).toBeVisible({ timeout: 10_000 });
  const before = Number(await applied(page));
  await cancel.first().click();
  await expect.poll(() => applied(page), { timeout: 10_000 }).not.toBe(String(before));
});

import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';

/**
 * UX-PRIORITY evidence. Every row comes from the same real GameScenario state
 * under one of the three Phase modes; no turn loop prepares a state. The
 * browser trace wraps only the existing Worker transport and records actual
 * request/reply events, while DOM frames record the seat/window visible to Mesa.
 *
 * The report distinguishes clicks, accepted Phase passes, automatic passes,
 * and a response actually cast. It reports observations for this run; it does
 * not claim a general UX improvement from a small scenario count.
 */
type Mode = 'Standard' | 'SkipLowUseWindows' | 'FullControl';
interface ModeCase { key: string; label: string; engineMode: Mode }
const MODES: ModeCase[] = [
  { key: 'standard', label: 'Standard', engineMode: 'Standard' },
  { key: 'fluido', label: 'Fluido (SkipLowUseWindows)', engineMode: 'SkipLowUseWindows' },
  { key: 'full-control', label: 'Control completo', engineMode: 'FullControl' }
];

interface RequestTrace {
  kind: 'request'; at: number; id: number; workerId: number; op: number; payload: {
    actor?: number;
    expected_revision?: number;
    action?: { type?: string; data?: Record<string, unknown> };
  };
}
interface ResponseTrace {
  kind: 'response'; at: number; id: number; workerId: number; reply?: {
    ok?: boolean; viewer?: number; revision?: number; actions_applied?: number; auto_pass_recommended?: boolean;
    state?: {
      waiting_for?: { type?: string };
      priority_passing_modes?: Record<string, string>;
      phase_stops?: Record<string, unknown[]>;
      auto_pass?: Record<string, unknown>;
    };
    events?: Array<{ type?: string; data?: Record<string, unknown> }>;
    legal?: { actions?: Array<{ type?: string; data?: Record<string, unknown> }> };
  } | null; error?: string;
}
type TraceEntry = RequestTrace | ResponseTrace;
interface Frame {
  at: number; viewer: number | null; waiting: string | null; phase: string | null;
  actionsApplied: number | null; autoPasses: number | null; handoff: boolean; handHidden: boolean;
}
interface EvidenceMetric {
  scenario: string;
  mode: string;
  engineMode: Mode;
  engineModeConfirmed: boolean;
  initialPriorityWindowObserved: boolean;
  manuallyExecutedPasses: number;
  gameplayInterventionsExecuted: number;
  acceptedPriorityPasses: number;
  automaticPasses: number;
  windowsOmittedWithoutManualIntervention: number;
  p1PriorityOpportunityPreserved: boolean;
  p1ResponseOffered: boolean | null;
  responseCastAccepted: boolean | null;
  stackEntriesAfterResponse: number | null;
  p1ModeBeforeTemporaryOverride: string | null;
  fullControlNotPersisted: boolean | null;
  privateIdentityHiddenBeforeHandoff: boolean;
  privateIdentityShownAfterHandoff: boolean;
  cancellationAccepted: boolean | null;
  cancellationDuringInFlightAction: boolean | null;
  cancellationActor: number | null;
  cancellationGameIdentityPreserved: boolean | null;
  passRevisionAtAcceptance: number | null;
  cancellationExpectedRevision: number | null;
  cancellationRevisionMatched: boolean | null;
  autoPassSessionCleared: boolean | null;
  controlRecoveredAfterCancellation: boolean | null;
  manualActionAcceptedAfterCancellation: boolean | null;
  screenshot: string;
  observedFrames: number;
}

const OUT = process.env.MESA_PRIORITY_EVIDENCE_OUT ?? 'test-results/ux-priority-evidence';
const rows: EvidenceMetric[] = [];
const app = (page: Page) => page.locator('.app');
const panel = (page: Page) => page.locator('section[aria-label="Decisión pendiente"]');
const handoff = (page: Page) => page.locator('.handoff');
const applied = async (page: Page) => Number(await app(page).getAttribute('data-actions-applied'));
const autoPassCount = async (page: Page) => Number(await app(page).getAttribute('data-auto-passes'));

async function installEvidenceHarness(page: Page) {
  await page.addInitScript({ content: `
    (() => {
      const params = new URLSearchParams(location.search);
      const selectedMode = params.get('priority-mode') || 'Standard';
      const persistentMode = selectedMode === 'FullControl' ? 'Standard' : selectedMode;
      localStorage.setItem('mesa:priorityPreferences', JSON.stringify({
        '0': { mode: persistentMode, stops: {} }
      }));
      localStorage.setItem('mesa:handoffMode', 'every');
      if (selectedMode === 'FullControl') localStorage.setItem('mesa:autoPass', 'off');
      else localStorage.removeItem('mesa:autoPass');

      window.__mesaPriorityTrace = [];
      window.__mesaPriorityFrames = [];
      window.__mesaPriorityHoldPassReply = params.get('hold-priority-pass-reply') === '1';
      window.__mesaPriorityPendingPassIds = new Set();
      window.__mesaPriorityProbeResolvers = {};
      window.__mesaPriorityProbeNextId = 900000;
      window.__mesaPriorityHeldPassReply = null;
      window.__mesaPriorityReleasedPassReplyId = null;
      window.__mesaPriorityWorkerWrapped = false;
      window.__mesaPriorityNextWorkerId = 1;
      const NativeWorker = window.Worker;
      const clone = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
      window.Worker = class extends NativeWorker {
        constructor(...args) {
          super(...args);
          const worker = this;
          const workerId = window.__mesaPriorityNextWorkerId++;
          super.addEventListener('message', (event) => {
            const message = event.data || {};
            if (window.__mesaPriorityReleasedPassReplyId === message.id) {
              window.__mesaPriorityReleasedPassReplyId = null;
              return;
            }
            window.__mesaPriorityTrace.push({
              kind: 'response', at: performance.now(), id: message.id, workerId,
              reply: clone(message.reply), error: message.error
            });
            const resolver = window.__mesaPriorityProbeResolvers[message.id];
            if (resolver) {
              delete window.__mesaPriorityProbeResolvers[message.id];
              resolver(clone(message.reply));
            }
            const isPassReply = window.__mesaPriorityPendingPassIds.delete(message.id);
            if (window.__mesaPriorityHoldPassReply && isPassReply && !window.__mesaPriorityHeldPassReply) {
              window.__mesaPriorityHeldPassReply = { id: message.id, message: clone(message), worker };
              event.stopImmediatePropagation();
            }
          }, { capture: true });
          window.__mesaPriorityLastWorker = worker;
          window.__mesaPriorityLastWorkerId = workerId;
          window.__mesaPriorityRequestViewer = (viewer) => new Promise((resolve) => {
            const id = window.__mesaPriorityProbeNextId++;
            window.__mesaPriorityProbeResolvers[id] = resolve;
            worker.postMessage({ id, op: 4, payload: viewer });
          });
        }
        postMessage(message, options) {
          window.__mesaPriorityTrace.push({
            kind: 'request', at: performance.now(), id: message && message.id, workerId,
            op: message && message.op, payload: clone(message && message.payload)
          });
          if (message?.op === 2 && message.payload?.action?.type === 'PassPriority') {
            window.__mesaPriorityPendingPassIds.add(message.id);
          }
          return options === undefined
            ? super.postMessage(message)
            : super.postMessage(message, options);
        }
      };
      window.__mesaPriorityReleasePassReply = () => {
        const held = window.__mesaPriorityHeldPassReply;
        if (!held) return false;
        window.__mesaPriorityReleasedPassReplyId = held.id;
        window.__mesaPriorityHeldPassReply = null;
        held.worker.dispatchEvent(new MessageEvent('message', { data: held.message }));
        return true;
      };
      window.__mesaPriorityWorkerWrapped = true;

      let last = '';
      const recordFrame = () => {
        const root = document.querySelector('.app');
        if (!root) return;
        const main = root.querySelector('main[data-board-region]');
        const row = {
          at: performance.now(),
          viewer: root.hasAttribute('data-viewer') ? Number(root.getAttribute('data-viewer')) : null,
          waiting: root.getAttribute('data-waiting'),
          phase: root.getAttribute('data-phase'),
          actionsApplied: root.hasAttribute('data-actions-applied') ? Number(root.getAttribute('data-actions-applied')) : null,
          autoPasses: root.hasAttribute('data-auto-passes') ? Number(root.getAttribute('data-auto-passes')) : null,
          handoff: !!document.querySelector('.handoff'),
          handHidden: !!main && main.getAttribute('aria-hidden') === 'true'
        };
        const key = JSON.stringify(row, (name, value) => name === 'at' ? undefined : value);
        if (key === last) return;
        last = key;
        window.__mesaPriorityFrames.push(row);
      };
      new MutationObserver(recordFrame).observe(document.documentElement, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ['data-viewer', 'data-waiting', 'data-phase', 'data-actions-applied', 'data-auto-passes', 'aria-hidden']
      });
      recordFrame();
    })();
  ` });
  await page.route('**/api.scryfall.com/**', (route) => route.abort());
}

async function openScenario(page: Page, scenario: string, mode: ModeCase, holdPassReply = false) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await installEvidenceHarness(page);
  const hold = holdPassReply ? '&hold-priority-pass-reply=1' : '';
  await page.goto(`/?e2e-scenario=${scenario}&priority-mode=${mode.engineMode}${hold}`);
  await expect(app(page), `${scenario}/${mode.label}: Phase no publicó una ventana Priority`).toHaveAttribute('data-waiting', 'Priority', { timeout: 30_000 });
  await waitForEngineMode(page, 0, mode.engineMode);
}

async function traceEntries(page: Page): Promise<TraceEntry[]> {
  return page.evaluate(() => {
    const win = window as Window & { __mesaPriorityTrace?: TraceEntry[] };
    return win.__mesaPriorityTrace ?? [];
  });
}
async function frames(page: Page): Promise<Frame[]> {
  return page.evaluate(() => {
    const win = window as Window & { __mesaPriorityFrames?: Frame[] };
    return win.__mesaPriorityFrames ?? [];
  });
}

function completedRequests(trace: TraceEntry[]) {
  const key = (workerId: number, id: number) => `${workerId}:${id}`;
  const requests = new Map<string, RequestTrace>();
  for (const entry of trace) if (entry.kind === 'request') requests.set(key(entry.workerId, entry.id), entry);
  return trace.flatMap((entry) => {
    if (entry.kind !== 'response') return [];
    const request = requests.get(key(entry.workerId, entry.id));
    return request ? [{ request, response: entry }] : [];
  });
}

async function waitForEngineMode(page: Page, actor: number, mode: Mode) {
  await expect.poll(async () => {
    const completed = completedRequests(await traceEntries(page));
    const modeSynced = completed.some(({ request, response }) => {
      const action = request.payload.action;
      const publishedMode = response.reply?.state?.priority_passing_modes?.[String(actor)];
      const modeMatches = mode === 'Standard'
        ? publishedMode === undefined || publishedMode === 'Standard'
        : publishedMode === mode;
      return request.op === 2 && request.payload.actor === actor
        && action?.type === 'SetPriorityPassingMode'
        && action.data?.mode === mode
        && response.reply?.ok === true
        && modeMatches;
    });
    const stopsSynced = completed.some(({ request, response }) => {
      const action = request.payload.action;
      const reply = response.reply;
      const seatStops = reply?.state?.phase_stops?.[String(actor)];
      return request.op === 2 && request.payload.actor === actor
        && action?.type === 'SetPhaseStops'
        && reply?.ok === true
        && (seatStops === undefined || (Array.isArray(seatStops) && seatStops.length === 0));
    });
    return modeSynced && stopsSynced;
  }, { timeout: 30_000 }).toBe(true);
}

function acceptedPriorityPasses(trace: TraceEntry[]): number {
  return completedRequests(trace).reduce((count, { response }) => {
    const reply = response.reply;
    if (reply?.ok !== true) return count;
    return count + (reply.events ?? []).filter((event) => event.type === 'PriorityPassed').length;
  }, 0);
}
function acceptedActions(trace: TraceEntry[], types: string[]): number {
  return completedRequests(trace).filter(({ request, response }) =>
    request.op === 2 && response.reply?.ok === true && types.includes(request.payload.action?.type ?? '')
  ).length;
}
function initialRecommendation(trace: TraceEntry[], actor: number): boolean | null {
  const snapshots = completedRequests(trace).filter(({ response }) =>
    response.reply?.ok === true && response.reply.viewer === actor
      && response.reply.state?.waiting_for?.type === 'Priority'
      && typeof response.reply.auto_pass_recommended === 'boolean'
  );
  return snapshots.at(-1)?.response.reply?.auto_pass_recommended ?? null;
}
async function saveRow(page: Page, row: Omit<EvidenceMetric, 'observedFrames' | 'screenshot'>, screenshotName: string) {
  const screenshot = `screenshots/${screenshotName}.png`;
  await mkdir(`${OUT}/screenshots`, { recursive: true });
  await page.screenshot({ path: `${OUT}/${screenshot}`, fullPage: true });
  rows.push({ ...row, screenshot, observedFrames: (await frames(page)).length });
}

async function moveToP1Opportunity(page: Page, mode: ModeCase) {
  let manualPasses = 0;
  if (mode.engineMode === 'SkipLowUseWindows') {
    await expect(app(page)).toHaveAttribute('data-viewer', '1', { timeout: 30_000 });
    await expect(handoff(page)).toBeVisible({ timeout: 30_000 });
    await expect(app(page)).toHaveAttribute('data-auto-passes', '1', { timeout: 30_000 });
  } else {
    await expect(app(page)).toHaveAttribute('data-viewer', '0');
    await expect(app(page)).toHaveAttribute('data-auto-passes', '0');
    const pass = page.locator('[data-decision-primary]');
    await expect(pass).toContainText('Pasar');
    const before = await applied(page);
    await pass.click();
    manualPasses += 1;
    await expect.poll(() => applied(page), { timeout: 30_000 }).toBeGreaterThan(before);
    await expect(app(page)).toHaveAttribute('data-viewer', '1', { timeout: 30_000 });
    await expect(handoff(page)).toBeVisible({ timeout: 30_000 });
  }
  return manualPasses;
}

async function revealAndVerifySailor(page: Page) {
  const hiddenBefore = await page.locator('section[aria-label^="Tu mano"]').count() === 0
    && await page.locator('text=Spectral Sailor').count() === 0;
  await expect(handoff(page)).toContainText('Jugador 2');
  await expect(page.locator('.app main[data-board-region]')).toHaveAttribute('aria-hidden', 'true');
  await handoff(page).locator('button').click();
  await expect(handoff(page)).toHaveCount(0);
  await waitForEngineMode(page, 1, 'Standard');
  const sailor = page.locator('section[aria-label^="Tu mano"] [data-card-id]').filter({ hasText: 'Spectral Sailor' }).first();
  await expect(sailor).toBeVisible();
  await sailor.click();
  await expect(panel(page).locator('button').filter({ hasText: 'Lanzar Spectral Sailor' }).first()).toBeVisible();
  return { hiddenBefore, shownAfter: true };
}

async function castBoltAtP1(page: Page) {
  const bolt = page.locator('section[aria-label^="Tu mano"] [data-card-id]').filter({ hasText: 'Lightning Bolt' }).first();
  await expect(bolt).toBeVisible();
  await bolt.click();
  const cast = panel(page).locator('button').filter({ hasText: 'Lanzar Lightning Bolt' }).first();
  await expect(cast).toBeVisible();
  await cast.click();
  await expect(app(page)).toHaveAttribute('data-waiting', 'TargetSelection');
  const targets = panel(page).locator('details[data-target-list]');
  if (!(await targets.evaluate((node: HTMLDetailsElement) => node.open))) await targets.locator('summary').click();
  const opponent = targets.locator('button').filter({ hasText: /^Elegir Jugador 2$/ }).first();
  await expect(opponent).toBeVisible();
  await opponent.click();
  await expect(page.locator('section[aria-label="Pila"] ol li')).toHaveCount(1);
}

for (const mode of MODES) {
  test.describe(`MESA_EVIDENCE_UX_PRIORITY · ventana propia equivalente · ${mode.label}`, () => {
    test('mide intervención, pase, ventana omitida y oportunidad rival', async ({ page }) => {
      test.setTimeout(180_000);
      await openScenario(page, 'priority-low-use', mode);
      const initialWindowObserved = (await frames(page)).some((frame) => frame.viewer === 0 && frame.waiting === 'Priority');
      const recommendation = initialRecommendation(await traceEntries(page), 0);
      const manualPasses = await moveToP1Opportunity(page, mode);
      const privacy = await revealAndVerifySailor(page);
      const trace = await traceEntries(page);
      const automaticPasses = await autoPassCount(page);
      const recommendationExpected = mode.engineMode === 'SkipLowUseWindows';
      expect(recommendation).toBe(recommendationExpected);
      expect(acceptedPriorityPasses(trace)).toBe(1);
      expect(manualPasses).toBe(mode.engineMode === 'SkipLowUseWindows' ? 0 : 1);
      expect(privacy.hiddenBefore).toBe(true);
      expect(privacy.shownAfter).toBe(true);
      const opportunity = await panel(page).locator('button').filter({ hasText: 'Lanzar Spectral Sailor' }).count() === 1;
      expect(opportunity).toBe(true);
      await saveRow(page, {
        scenario: 'priority-low-use', mode: mode.label, engineMode: mode.engineMode,
        engineModeConfirmed: true, initialPriorityWindowObserved: initialWindowObserved,
        manuallyExecutedPasses: manualPasses,
        gameplayInterventionsExecuted: manualPasses,
        acceptedPriorityPasses: acceptedPriorityPasses(trace),
        automaticPasses,
        windowsOmittedWithoutManualIntervention: automaticPasses,
        p1PriorityOpportunityPreserved: opportunity,
        p1ResponseOffered: null, responseCastAccepted: null, stackEntriesAfterResponse: null,
        p1ModeBeforeTemporaryOverride: null, fullControlNotPersisted: null,
        privateIdentityHiddenBeforeHandoff: privacy.hiddenBefore,
        privateIdentityShownAfterHandoff: privacy.shownAfter,
        cancellationAccepted: null, cancellationDuringInFlightAction: null, cancellationActor: null,
        cancellationGameIdentityPreserved: null, passRevisionAtAcceptance: null,
        cancellationExpectedRevision: null, cancellationRevisionMatched: null,
        autoPassSessionCleared: null, controlRecoveredAfterCancellation: null,
        manualActionAcceptedAfterCancellation: null
      }, `priority-low-use-${mode.key}`);
    });
  });

  test.describe(`MESA_EVIDENCE_UX_PRIORITY · secuencia de respuesta · ${mode.label}`, () => {
    test('mide una respuesta real después de lanzar y ceder prioridad', async ({ page }) => {
      test.setTimeout(180_000);
      await openScenario(page, 'priority-resolve-own', mode);
      await castBoltAtP1(page);
      let manualPasses = 0;
      if (mode.engineMode === 'FullControl') {
        await expect(app(page)).toHaveAttribute('data-viewer', '0');
        await expect(app(page)).toHaveAttribute('data-waiting', 'Priority');
        await expect(app(page)).toHaveAttribute('data-auto-passes', '0');
        const before = await applied(page);
        await page.locator('[data-decision-primary]').click();
        manualPasses += 1;
        await expect.poll(() => applied(page), { timeout: 30_000 }).toBeGreaterThan(before);
      }
      await expect(app(page)).toHaveAttribute('data-viewer', '1', { timeout: 30_000 });
      await expect(handoff(page)).toBeVisible({ timeout: 30_000 });
      const privacy = {
        hidden: await page.locator('section[aria-label^="Tu mano"]').count() === 0
          && await page.locator('text=Counterspell').count() === 0
      };
      await handoff(page).locator('button').click();
      await expect(handoff(page)).toHaveCount(0);
      const response = page.locator('section[aria-label^="Tu mano"] [data-card-id]').filter({ hasText: 'Counterspell' }).first();
      await expect(response).toBeVisible();

      const tiers = page.locator('details[data-decision-tiers]');
      if (!(await tiers.evaluate((node: HTMLDetailsElement) => node.open))) await tiers.locator('summary').click();
      const advanced = panel(page).locator('[data-advanced-surface]');
      await expect(advanced).toBeVisible();
      await waitForEngineMode(page, 1, 'Standard');
      const full = advanced.locator('button[data-priority-mode="FullControl"]');
      await full.click();
      await waitForEngineMode(page, 1, 'FullControl');
      const p1ModeBeforeTemporaryOverride = 'Standard';
      const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('mesa:priorityPreferences') ?? '{}')) as Record<string, unknown>;
      const fullControlNotPersisted = persisted['1'] === undefined;

      await response.click();
      const cast = panel(page).locator('button').filter({ hasText: 'Lanzar Counterspell' }).first();
      await expect(cast).toBeVisible();
      const responseOffered = true;
      const beforeResponse = await applied(page);
      await cast.click();
      await expect(app(page)).toHaveAttribute('data-waiting', 'TargetSelection');
      const targets = panel(page).locator('details[data-target-list]');
      if (!(await targets.evaluate((node: HTMLDetailsElement) => node.open))) await targets.locator('summary').click();
      const bolt = targets.locator('button').filter({ hasText: /Elegir Lightning Bolt/ }).first();
      await expect(bolt).toBeVisible();
      await bolt.click();
      await expect.poll(() => applied(page), { timeout: 30_000 }).toBeGreaterThan(beforeResponse);
      await expect(app(page)).toHaveAttribute('data-waiting', 'Priority');
      await expect(app(page)).toHaveAttribute('data-viewer', '1');
      await expect(page.locator('section[aria-label="Pila"] ol li')).toHaveCount(2);

      const trace = await traceEntries(page);
      const automaticPasses = await autoPassCount(page);
      const responseCastAccepted = acceptedActions(trace, ['CastSpell']) >= 2
        && acceptedActions(trace, ['ChooseTarget', 'SelectTargets']) >= 2;
      const stackEntriesAfterResponse = await page.locator('section[aria-label="Pila"] ol li').count();
      expect(privacy.hidden).toBe(true);
      expect(responseOffered).toBe(true);
      expect(responseCastAccepted).toBe(true);
      expect(stackEntriesAfterResponse).toBe(2);
      expect(fullControlNotPersisted).toBe(true);
      expect(acceptedPriorityPasses(trace)).toBe(1);
      expect(manualPasses).toBe(mode.engineMode === 'FullControl' ? 1 : 0);
      await saveRow(page, {
        scenario: 'priority-response-sequence', mode: mode.label, engineMode: mode.engineMode,
        engineModeConfirmed: true,
        initialPriorityWindowObserved: (await frames(page)).some((frame) => frame.viewer === 0 && frame.waiting === 'Priority'),
        manuallyExecutedPasses: manualPasses,
        gameplayInterventionsExecuted: acceptedActions(trace, ['CastSpell', 'ChooseTarget', 'SelectTargets']) + manualPasses,
        acceptedPriorityPasses: acceptedPriorityPasses(trace),
        automaticPasses,
        windowsOmittedWithoutManualIntervention: automaticPasses,
        p1PriorityOpportunityPreserved: true,
        p1ResponseOffered: responseOffered,
        responseCastAccepted,
        stackEntriesAfterResponse,
        p1ModeBeforeTemporaryOverride,
        fullControlNotPersisted,
        privateIdentityHiddenBeforeHandoff: privacy.hidden,
        privateIdentityShownAfterHandoff: true,
        cancellationAccepted: null, cancellationDuringInFlightAction: null, cancellationActor: null,
        cancellationGameIdentityPreserved: null, passRevisionAtAcceptance: null,
        cancellationExpectedRevision: null, cancellationRevisionMatched: null,
        autoPassSessionCleared: null, controlRecoveredAfterCancellation: null,
        manualActionAcceptedAfterCancellation: null
      }, `priority-response-sequence-${mode.key}`);
    });
  });
}

test.describe('MESA_EVIDENCE_UX_PRIORITY · recuperación explícita', () => {
  test('mide CancelAutoPass mientras un pase ya enviado espera respuesta del Worker', async ({ page }) => {
    test.setTimeout(180_000);
    const mode = MODES.find((entry) => entry.engineMode === 'Standard')!;
    await openScenario(page, 'priority-auto-pass', mode, true);

    const heldReply = async () => page.evaluate(() => {
      const win = window as Window & { __mesaPriorityHeldPassReply?: { id: number; message: { reply?: ResponseTrace['reply'] } } | null };
      return win.__mesaPriorityHeldPassReply ?? null;
    });
    await expect.poll(async () => !!(await heldReply()), { timeout: 30_000 }).toBe(true);
    const passTrace = completedRequests(await traceEntries(page)).find(({ request, response }) =>
      request.op === 2 && request.payload.actor === 0
        && request.payload.action?.type === 'PassPriority'
        && response.reply?.ok === true
    );
    expect(passTrace, 'Phase debe aceptar el pase que ya está en vuelo').toBeDefined();
    expect(passTrace?.response.reply?.events?.some((event) => event.type === 'PriorityPassed')).toBe(true);
    await expect(app(page)).toHaveAttribute('data-busy', 'true');

    const pendingSession = await page.evaluate(async () => {
      const win = window as Window & {
        __mesaPriorityRequestViewer?: (viewer: number) => Promise<ResponseTrace['reply'] | undefined>;
      };
      return await win.__mesaPriorityRequestViewer?.(0);
    });
    const sessionPresentBeforeCancel = pendingSession?.state?.auto_pass?.['0'] !== undefined;
    expect(sessionPresentBeforeCancel, 'el estado visto por P0 conserva su sesión mientras el pase espera a la aplicación').toBe(true);

    const cancel = page.locator('[data-decision-cancel="cancel-auto-pass"]');
    await expect(cancel).toBeVisible();
    await expect(cancel).toBeEnabled();
    const cancellationDuringInFlightAction = await app(page).getAttribute('data-busy') === 'true'
      && !!(await heldReply())
      && await cancel.isEnabled();
    await cancel.click();
    await expect(cancel).toHaveAttribute('data-cancellation-pending', 'true');
    await expect(cancel).toBeDisabled();
    expect(cancellationDuringInFlightAction).toBe(true);
    expect(await heldReply()).not.toBeNull();

    await page.evaluate(() => {
      const win = window as Window & { __mesaPriorityReleasePassReply?: () => boolean };
      win.__mesaPriorityReleasePassReply?.();
    });
    await expect.poll(async () => {
      const completed = completedRequests(await traceEntries(page));
      return completed.some(({ request, response }) => request.op === 2
        && request.payload.actor === 0
        && request.payload.action?.type === 'CancelAutoPass'
        && response.reply?.ok === true);
    }, { timeout: 30_000 }).toBe(true);
    await expect(app(page)).toHaveAttribute('data-viewer', '1', { timeout: 30_000 });
    await expect(handoff(page)).toBeVisible();
    await expect(app(page).locator('main[data-board-region]')).toHaveAttribute('aria-hidden', 'true');
    const privateIdentityHiddenBeforeHandoff = await page.locator('section[aria-label^="Tu mano"]').count() === 0
      && await page.locator('text=Spectral Sailor').count() === 0;
    expect(privateIdentityHiddenBeforeHandoff).toBe(true);

    const traceAfterCancel = await traceEntries(page);
    const cancellationPair = completedRequests(traceAfterCancel).find(({ request, response }) =>
      request.op === 2 && request.payload.action?.type === 'CancelAutoPass'
        && response.reply?.ok === true
    );
    const cancellationAccepted = !!cancellationPair;
    const cancellationActor = cancellationPair?.request.payload.actor ?? null;
    const passRevisionAtAcceptance = passTrace?.response.reply?.revision ?? null;
    const cancellationExpectedRevision = cancellationPair?.request.payload.expected_revision ?? null;
    const cancellationRevisionMatched = typeof passRevisionAtAcceptance === 'number'
      && cancellationExpectedRevision === passRevisionAtAcceptance;
    const passRequestIndex = passTrace
      ? traceAfterCancel.findIndex((entry) => entry.kind === 'request'
        && entry.workerId === passTrace.request.workerId && entry.id === passTrace.request.id)
      : -1;
    const cancellationRequestIndex = cancellationPair
      ? traceAfterCancel.findIndex((entry) => entry.kind === 'request'
        && entry.workerId === cancellationPair.request.workerId && entry.id === cancellationPair.request.id)
      : -1;
    const gameReinitializedBetweenPassAndCancel = passRequestIndex >= 0 && cancellationRequestIndex > passRequestIndex
      && traceAfterCancel.slice(passRequestIndex + 1, cancellationRequestIndex).some((entry) =>
        entry.kind === 'request' && (entry.op === 1 || entry.op === 5));
    const cancellationGameIdentityPreserved = !!passTrace && !!cancellationPair
      && passRequestIndex >= 0 && cancellationRequestIndex > passRequestIndex
      && passTrace.request.workerId === cancellationPair.request.workerId
      && !gameReinitializedBetweenPassAndCancel;
    const p0AfterCancel = await page.evaluate(async () => {
      const win = window as Window & {
        __mesaPriorityRequestViewer?: (viewer: number) => Promise<ResponseTrace['reply'] | undefined>;
      };
      return await win.__mesaPriorityRequestViewer?.(0);
    });
    const autoPassSessionCleared = p0AfterCancel?.ok === true
      && p0AfterCancel.state?.auto_pass?.['0'] === undefined;
    expect(cancellationAccepted).toBe(true);
    expect(cancellationActor).toBe(0);
    expect(cancellationGameIdentityPreserved, 'la cancelación permanece en la misma sesión Phase sin reinicializar la partida').toBe(true);
    expect(passRevisionAtAcceptance, 'la respuesta Phase aceptada publica la revisión aplicada').not.toBeNull();
    expect(cancellationExpectedRevision, 'la cancelación usa la revisión que Phase publicó tras aplicar el pase').toBe(passRevisionAtAcceptance);
    expect(cancellationRevisionMatched).toBe(true);
    expect(autoPassSessionCleared).toBe(true);

    await handoff(page).locator('button').click();
    await expect(handoff(page)).toHaveCount(0);
    await expect(app(page)).toHaveAttribute('data-viewer', '1');
    await waitForEngineMode(page, 1, 'Standard');
    const p1ModeBeforeTemporaryOverride = 'Standard';
    const recommendation = initialRecommendation(await traceEntries(page), 1);
    expect(recommendation).toBe(false);
    const sailor = page.locator('section[aria-label^="Tu mano"] [data-card-id]')
      .filter({ hasText: 'Spectral Sailor' }).first();
    await expect(sailor).toBeVisible();
    const privateIdentityShownAfterHandoff = true;

    const tiers = panel(page).locator('details[data-decision-tiers]');
    if (!(await tiers.evaluate((node: HTMLDetailsElement) => node.open))) await tiers.locator('summary').click();
    const advanced = panel(page).locator('[data-advanced-surface]');
    await expect(advanced).toBeVisible();
    const full = advanced.locator('button[data-priority-mode="FullControl"]');
    await full.click();
    await waitForEngineMode(page, 1, 'FullControl');
    const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('mesa:priorityPreferences') ?? '{}')) as Record<string, unknown>;
    const fullControlNotPersisted = persisted['1'] === undefined;

    await sailor.click();
    const cast = panel(page).locator('button').filter({ hasText: 'Lanzar Spectral Sailor' }).first();
    await expect(cast).toBeVisible();
    const controlRecovered = await cast.isEnabled();
    const beforeCast = await applied(page);
    await cast.click();
    await expect.poll(() => applied(page), { timeout: 30_000 }).toBeGreaterThan(beforeCast);
    const trace = await traceEntries(page);
    const manualActionAcceptedAfterCancellation = completedRequests(trace).some(({ request, response }) =>
      request.op === 2 && request.payload.actor === 1
        && request.payload.action?.type === 'CastSpell'
        && response.reply?.ok === true
    );
    const acceptedPasses = acceptedPriorityPasses(trace);
    const automaticPasses = await autoPassCount(page);
    expect(controlRecovered).toBe(true);
    expect(manualActionAcceptedAfterCancellation).toBe(true);
    expect(acceptedPasses).toBe(1);
    expect(automaticPasses).toBe(1);
    expect(fullControlNotPersisted).toBe(true);
    await saveRow(page, {
      scenario: 'cancel-and-recover', mode: 'Cancelación en vuelo', engineMode: mode.engineMode,
      engineModeConfirmed: true,
      initialPriorityWindowObserved: (await frames(page)).some((frame) => frame.viewer === 0 && frame.waiting === 'Priority'),
      manuallyExecutedPasses: 0,
      gameplayInterventionsExecuted: acceptedActions(trace, ['CastSpell']),
      acceptedPriorityPasses: acceptedPasses,
      automaticPasses,
      windowsOmittedWithoutManualIntervention: automaticPasses,
      p1PriorityOpportunityPreserved: true,
      p1ResponseOffered: null, responseCastAccepted: null, stackEntriesAfterResponse: null,
      p1ModeBeforeTemporaryOverride, fullControlNotPersisted,
      privateIdentityHiddenBeforeHandoff, privateIdentityShownAfterHandoff,
      cancellationAccepted, cancellationDuringInFlightAction, cancellationActor,
      cancellationGameIdentityPreserved, passRevisionAtAcceptance,
      cancellationExpectedRevision, cancellationRevisionMatched,
      autoPassSessionCleared, controlRecoveredAfterCancellation: controlRecovered,
      manualActionAcceptedAfterCancellation
    }, 'cancel-and-recover');
  });
});

test.afterAll(async () => {
  await mkdir(OUT, { recursive: true });
  await writeFile(`${OUT}/metrics.json`, JSON.stringify({
    capturedAt: new Date().toISOString(),
    phasePin: 'c551672cd7f262579a6cdcd25db128376b1fd9c7',
    phaseVersion: '0.134.0',
    scenarios: ['priority-low-use', 'priority-response-sequence', 'cancel-and-recover'],
    modes: MODES,
    rows
  }, null, 2));
});

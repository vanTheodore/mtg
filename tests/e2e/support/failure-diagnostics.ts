import type { Page, TestInfo } from '@playwright/test';

/**
 * Keep a privacy-safe snapshot of the board in the Playwright JSON report when
 * a long browser regression fails. The Actions artifact host may not be
 * reachable from this workspace, but `scripts/e2e-annotations.ts` publishes
 * the trailing test output as a check annotation.
 *
 * Never include card names, hand contents, or hidden-seat state: only count
 * cards that are visibly rendered for the current viewer.
 */
export async function logBoardFailureDiagnostics(page: Page, info: TestInfo): Promise<void> {
  if (info.status === info.expectedStatus) return;

  const snapshot = await page.evaluate(() => {
    const visible = (element: Element | null): boolean => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const app = document.querySelector<HTMLElement>('.app');
    const hand = document.querySelector<HTMLElement>('section[aria-label^="Tu mano"]');
    const decision = document.querySelector<HTMLElement>('section[aria-label="Decisión pendiente"]');
    const handoff = document.querySelector<HTMLElement>('.handoff');
    const alert = document.querySelector<HTMLElement>('[role="alert"]');
    const startPanel = document.querySelector<HTMLElement>('.start-panel');

    return {
      url: `${location.pathname}${location.search}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      app: app ? {
        viewer: app.dataset.viewer ?? null,
        phase: app.dataset.phase ?? null,
        turn: app.dataset.turn ?? null,
        waiting: app.dataset.waiting ?? null,
        busy: app.dataset.busy ?? null,
        actions: app.dataset.actionsApplied ?? null
      } : null,
      handoffVisible: visible(handoff),
      decision: decision ? {
        visible: visible(decision),
        waiting: decision.dataset.waiting ?? null,
        buttonCount: decision.querySelectorAll('button').length
      } : null,
      visibleHandCardCount: hand && visible(hand) ? hand.querySelectorAll('[data-card-id]').length : 0,
      startPanelVisible: visible(startPanel),
      error: alert?.textContent?.trim().slice(0, 180) ?? null
    };
  }).catch((error: unknown) => ({
    unavailable: error instanceof Error ? error.message : String(error)
  }));

  console.log(`MESA_E2E_FAILURE_UI ${JSON.stringify({ test: info.title, status: info.status, snapshot })}`);
}

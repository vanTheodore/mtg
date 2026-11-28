import type { Page, TestInfo } from '@playwright/test';

/**
 * Keep a bounded, privacy-safe snapshot of the board in the Playwright report
 * when a browser regression fails. The Actions artifact host may be unreachable,
 * so `scripts/e2e-annotations.ts` republishes only these whitelisted fields.
 *
 * Never record card names, card counts, seat identifiers, hidden state, or alert
 * text. During a handoff, even the current viewer's hand visibility is omitted.
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
    const startPanel = document.querySelector<HTMLElement>('.start-panel');
    const handoffVisible = visible(handoff);

    return {
      url: location.pathname,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      app: app ? {
        phase: app.dataset.phase ?? null,
        turn: app.dataset.turn ?? null,
        waiting: app.dataset.waiting ?? null,
        busy: app.dataset.busy ?? null,
        actions: app.dataset.actionsApplied ?? null
      } : null,
      handoffVisible,
      decision: decision ? {
        visible: visible(decision),
        waiting: decision.dataset.waiting ?? null,
        buttonCount: decision.querySelectorAll('button').length
      } : null,
      viewerHandVisible: !handoffVisible && visible(hand),
      startPanelVisible: visible(startPanel),
      alertVisible: visible(document.querySelector('[role="alert"]'))
    };
  }).catch(() => ({ unavailable: true }));

  console.log(`MESA_E2E_FAILURE_UI ${JSON.stringify({ status: info.status, snapshot })}`);
}

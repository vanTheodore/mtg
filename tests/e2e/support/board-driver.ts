import { type Locator, type Page } from '@playwright/test';
import { checkpoint } from './e2e-checkpoint';

/**
 * A driver for the Mesa board, shared by the interface tests.
 *
 * It only uses what a person can see and click: the decision panel, the hand,
 * the cards on the battlefield and the seat hand-off dialog. It never builds a
 * `GameAction` and never imports the engine client: legality is always
 * Phase's answer, and the driver only picks among the controls the interface
 * offers.
 *
 * Every helper is best-effort on purpose. The panel can change between
 * reading it and clicking it (the seat changes, the engine answers), so a
 * miss is not an error: the caller decides whether the game advanced.
 */
export interface BoardDriver {
  /** The board surface. */
  app: Locator;
  /** The hand of the seat being shown. */
  hand: Locator;
  /** The panel with the decision Phase is asking for. */
  decision: Locator;
  /** The battlefield of the seat being shown. */
  battlefield: Locator;
  /** The battlefield of the other seat. */
  rivalField: Locator;
  /** The game log, where Phase's own events are written. */
  log: Locator;
  /** The seat hand-off dialog. */
  handoff: Locator;
  /** The cleanup discard prompt. */
  discard: Locator;
  /** How many actions Phase has applied. */
  revision(): Promise<number>;
  /** The seat the board is showing. */
  viewer(): Promise<number>;
  /** The decision Phase is waiting for. */
  waiting(): Promise<string | null>;
  /** Pass the device on, wait for a settled decision, and report GameOver distinctly. */
  settleSeat(): Promise<'decision' | 'game-over'>;
  /** Wait through privacy handoffs; throw explicitly if Phase reaches GameOver first. */
  waitForDecision(timeout?: number): Promise<void>;
  /** Click a card, crossing the seat dialog if it is in the way. */
  clickCard(card: Locator): Promise<void>;
  /** Press a button and report whether Phase moved the game. */
  press(button: Locator, timeout?: number): Promise<boolean>;
  /** Answer the cleanup discard, with the number of cards Phase asks for. */
  discardIfAsked(): Promise<boolean>;
  /** Answer whatever the panel is asking for. */
  answerAnyPrompt(): Promise<boolean>;
  /** Play the first card Mesa marks as playable. */
  playPlayableCard(): Promise<boolean>;
  /** Declare every attacker Phase offers. */
  declareAttackers(): Promise<boolean>;
  /** Assign one blocker to one attacker. */
  declareBlocker(): Promise<boolean>;
}

export function createBoardDriver(page: Page): BoardDriver {
  const app = page.locator('.app');
  const hand = page.locator('section[aria-label^="Tu mano"]');
  const decision = page.locator('section[aria-label="Decisión pendiente"]');
  const battlefield = page.locator('section[aria-label^="Tu campo de batalla"]');
  const rivalField = page.locator('section[aria-label^="Campo de batalla"]');
  const log = page.locator('section[aria-label="Registro de la partida"]');
  const handoff = page.locator('.handoff');
  const gameOver = page.locator('.game-over');
  const discard = page.locator('[aria-label="Descartar hasta siete cartas"]');

  const revision = async () => Number(await app.getAttribute('data-actions-applied'));
  const viewer = async () => Number(await app.getAttribute('data-viewer'));
  // Board publishes the engine's pending decision even while the panel is
  // unmounted behind a privacy handoff.
  const waiting = async () => await app.getAttribute('data-waiting');

  /**
   * The seat dialog covers the board, so a person passes the device before
   * acting. The dialog is the product's own privacy guard: it is dismissed
   * here, never bypassed.
   */
  /** Confirm exactly the dialog the player can see; never bypass the privacy barrier. */
  const confirmSeat = async (): Promise<boolean> => {
    if (!(await handoff.isVisible().catch(() => false))) return false;
    checkpoint('handoff: privacy dialog detected');
    const previousViewer = await viewer();
    await handoff.locator('button').click({ timeout: 2_000 }).catch(() => {});
    // The outgoing dialog may be replaced immediately by the other seat's
    // privacy barrier. Waiting only for `.handoff` to become hidden then burns
    // five seconds per legitimate transition because the replacement matches
    // the same locator. Treat a hidden dialog OR a viewer change as settled.
    await page.waitForFunction((before) => {
      const app = document.querySelector('.app');
      const current = Number(app?.getAttribute('data-viewer'));
      return !document.querySelector('.handoff') || (Number.isFinite(current) && current !== before);
    }, previousViewer, { timeout: 5_000 }).catch(() => {});
    const visible = await handoff.isVisible().catch(() => false);
    checkpoint(visible
      ? await viewer() !== previousViewer
        ? 'handoff: next privacy dialog appeared after confirmation'
        : 'handoff: privacy dialog remains visible after confirmation'
      : 'handoff: privacy dialog cleared after confirmation');
    return true;
  };

  type SettledSurface = 'decision' | 'game-over';
  type BoardState = {
    viewer: string;
    revision: string;
    engineWaiting: string;
    panelWaiting: string;
    busy: string;
    syncPending: string;
    syncFailed: string;
    autoPassPending: string;
    handoffVisible: boolean;
    decisionVisible: boolean;
    gameOverVisible: boolean;
  };

  /** Read the board and its overlays in one browser task, not a series of
   * locator calls that can straddle a seat/revision change. */
  const readBoardState = (): Promise<BoardState> => page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('.app');
    const decisionPanel = root?.querySelector<HTMLElement>('section[aria-label="Decisión pendiente"]') ?? null;
    const visible = (element: HTMLElement | null): boolean => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    return {
      viewer: root?.dataset.viewer ?? '',
      revision: root?.dataset.actionsApplied ?? '',
      engineWaiting: root?.dataset.waiting ?? '',
      panelWaiting: decisionPanel?.dataset.waiting ?? '',
      busy: root?.dataset.busy ?? '',
      syncPending: root?.dataset.prioritySyncPending ?? '',
      syncFailed: root?.dataset.prioritySyncFailed ?? '',
      autoPassPending: root?.dataset.autoPassPending ?? '',
      handoffVisible: visible(root?.querySelector<HTMLElement>('.handoff') ?? null),
      decisionVisible: visible(decisionPanel),
      gameOverVisible: visible(root?.querySelector<HTMLElement>('.game-over') ?? null)
    };
  });

  const surfaceIsSettled = (state: BoardState): boolean => state.busy === 'false'
    && state.syncPending === 'false'
    && state.syncFailed === 'false'
    && state.autoPassPending === 'false'
    && state.engineWaiting !== 'GameOver'
    && state.panelWaiting === state.engineWaiting
    && !state.handoffVisible
    && !state.gameOverVisible
    && state.decisionVisible;

  const surfaceKey = (state: BoardState): string => JSON.stringify([
    state.viewer,
    state.revision,
    state.engineWaiting,
    state.panelWaiting,
    state.busy,
    state.syncPending,
    state.syncFailed,
    state.autoPassPending
  ]);

  /**
   * Wait for a settled decision or explicitly report the terminal state.
   * Confirm every privacy dialog through its own button. Read Phase's revision,
   * the rendered panel and both overlays atomically; then recheck the same state
   * immediately before returning so a replacement handoff is never mistaken
   * for a missing or settled decision.
   */
  const waitForSettledSurface = async (timeout = 30_000): Promise<SettledSurface> => {
    checkpoint('board-driver: wait for a decision through privacy handoffs');
    const deadline = Date.now() + timeout;
    let stableState = '';
    while (Date.now() < deadline) {
      const state = await readBoardState();
      if (state.gameOverVisible || state.engineWaiting === 'GameOver') {
        checkpoint('board-driver: terminal game state reached during wait');
        return 'game-over';
      }
      if (state.handoffVisible) {
        await confirmSeat();
        stableState = '';
        continue;
      }
      if (surfaceIsSettled(state)) {
        const key = surfaceKey(state);
        if (key === stableState) {
          const finalState = await readBoardState();
          if (surfaceIsSettled(finalState) && surfaceKey(finalState) === key) {
            checkpoint('handoff: decision surface visible after confirmation');
            return 'decision';
          }
          stableState = '';
        } else {
          stableState = key;
        }
      } else {
        stableState = '';
      }
      // Polling cadence only; settlement comes from matching Phase/UI state,
      // not from assuming that a fixed delay means the engine is done.
      await page.waitForTimeout(50);
    }
    throw new Error('No apareció una decisión visible después de resolver los handoffs de privacidad.');
  };

  /** A caller asking for a decision must not mistake GameOver for success. */
  const waitForDecision = async (timeout = 30_000): Promise<void> => {
    if (await waitForSettledSurface(timeout) === 'game-over') {
      throw new Error('Phase llegó a GameOver antes de presentar una decisión del jugador.');
    }
  };

  /**
   * Confirm the dialog, then wait for a settled decision (or an explicit
   * terminal state) before any caller can interact with the board.
   */
  const settleSeat = async (): Promise<SettledSurface> => {
    if (await gameOver.isVisible().catch(() => false)) return 'game-over';
    await confirmSeat();
    return waitForSettledSurface();
  };

  /** Card clicks also cross the seat dialog; keep their timeout short and retry. */
  const clickCard = async (card: Locator) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (await settleSeat() === 'game-over') throw new Error('La partida llegó a GameOver antes de seleccionar una carta.');
      try {
        await card.click({ timeout: 2_500 });
        return;
      } catch {
        await page.waitForTimeout(50);
      }
    }
    throw new Error('No se pudo pulsar la carta');
  };

  /**
   * Press a button and report whether Phase moved the game. The panel can
   * change between reading it and clicking it, so a miss is not an error
   * unless the driver stalls.
   */
  const press = async (button: Locator, timeout = 2_500): Promise<boolean> => {
    if (await settleSeat() === 'game-over') return false;
    if (!(await button.count())) return false;
    const before = await revision();
    await button.click({ timeout: 2_000 }).catch(() => {});
    await page
      .waitForFunction(
        (value) => Number(document.querySelector('.app')?.getAttribute('data-actions-applied')) > value,
        before,
        { timeout }
      )
      .catch(() => {});
    const advanced = (await revision()) > before;
    if (advanced && !(await gameOver.isVisible().catch(() => false))) {
      // A successful action may switch seats and unmount the panel. Return only
      // after the next decision is ready; GameOver remains an explicit terminal
      // result rather than a successful wait for a missing player prompt.
      await waitForSettledSurface();
    }
    return advanced;
  };

  /**
   * The cleanup step asks the active player to discard down to the maximum
   * hand size (CR 514.1). Mesa shows how many cards Phase asks for and which
   * ones it accepts; the driver picks exactly that many from the hand and
   * confirms. The number is read from the panel, never guessed here.
   */
  const discardIfAsked = async (): Promise<boolean> => {
    if (await settleSeat() === 'game-over') return false;
    if (!(await discard.isVisible().catch(() => false))) return false;
    const needed = Number((await discard.locator('strong').innerText()).match(/(\d+)/)?.[1] ?? 1);
    for (let index = 0; index < needed; index += 1) {
      await clickCard(hand.locator('[data-card-id]').nth(index));
    }
    return press(discard.locator('button').filter({ hasText: 'Confirmar descarte' }).first());
  };

  /**
   * Answer whatever the panel is asking for, the way a person would: the
   * cleanup discard first (it holds the turn), then the mulligan, the mana
   * payment, the combat windows and finally the priority pass.
   */
  const answerAnyPrompt = async (): Promise<boolean> => {
    if (await settleSeat() === 'game-over') return false;
    if (await discardIfAsked()) return true;
    if (await press(decision.locator('button:visible').filter({ hasText: 'Conservar mano' }).first())) return true;
    if (await press(decision.locator('button:visible').filter({ hasText: 'Confirmar pago' }).first())) return true;
    if (await press(decision.locator('button:visible').filter({ hasText: /^No atacar$/ }).first())) return true;
    if (await press(decision.locator('button:visible').filter({ hasText: /^No bloquear$/ }).first())) return true;
    // UX-DECISION: la acción principal se mudó de `.confirmations` a
    // `[data-decision-primary]`. El driver sigue reconociendo ambas formas
    // (la segunda es la del commit base que mide la evidencia comparativa).
    if (await press(decision.locator('[data-decision-primary]').filter({ hasText: /^Pasar/ }).first())) return true;
    if (await press(decision.locator('.confirmations button').filter({ hasText: /^Pasar/ }).first())) return true;
    if (await press(decision.locator('[data-decision-primary]').first())) return true;
    // UX-DECISION: las acciones no dominantes viven bajo divulgación
    // progresiva. Un jugador abre el desplegable antes de elegir una de ellas;
    // el driver hace lo mismo en vez de intentar pulsar un botón oculto.
    const tiers = decision.locator('details[data-decision-tiers]');
    if (await tiers.count()) {
      const isOpen = await tiers.getAttribute('open');
      if (isOpen === null) await tiers.locator('summary').click({ timeout: 2_000 }).catch(() => {});
    }
    if (await press(decision.locator('[data-decision-tiers] button:visible:not([disabled])').first())) return true;
    if (await press(decision.locator('button:visible:not([disabled])').first())) return true;
    return press(decision.locator('.confirmations button:visible:not([disabled])').first());
  };

  /**
   * Play the first card Mesa marks as playable: select it and press the
   * action the panel offers for it (jugar una tierra, lanzar un hechizo).
   */
  const playPlayableCard = async (): Promise<boolean> => {
    if (await settleSeat() === 'game-over') return false;
    const card = hand
      .locator('.hand-card')
      .filter({ hasText: 'Disponible para jugar' })
      .locator('[data-card-id]')
      .first();
    if (!(await card.count())) return false;
    await clickCard(card);
    const action = decision.locator('.prompt .actions button').first();
    if (!(await action.count())) return false;
    return press(action);
  };

  /** Declare every attacker Phase offers, the way the panel asks for it. */
  const declareAttackers = async (): Promise<boolean> => {
    if (await settleSeat() === 'game-over') return false;
    const attackers = battlefield.locator('[data-card-id][data-attack-options]:not([data-attack-options="0"])');
    if (!(await attackers.count())) return false;
    for (const card of await attackers.all()) await clickCard(card);
    const confirm = decision.locator('button:visible').filter({ hasText: /^Confirmar ataque/ }).first();
    if (await confirm.count()) return press(confirm);
    return press(decision.locator('button:visible').filter({ hasText: /^No atacar$/ }).first());
  };

  /** Assign one blocker to one attacker, the way the panel asks for it. */
  const declareBlocker = async (): Promise<boolean> => {
    if (await settleSeat() === 'game-over') return false;
    const blocker = battlefield.locator('[data-card-id][data-block-options]:not([data-block-options="0"])').first();
    const attacker = rivalField.locator('[data-combat-role="Atacando"]').first();
    if (!(await blocker.count()) || !(await attacker.count())) return false;
    await clickCard(blocker);
    await clickCard(attacker);
    const confirm = decision.locator('button:visible').filter({ hasText: /^Confirmar bloqueos/ }).first();
    if (await confirm.count()) return press(confirm);
    return press(decision.locator('button:visible').filter({ hasText: /^No bloquear$/ }).first());
  };

  return {
    app,
    hand,
    decision,
    battlefield,
    rivalField,
    log,
    handoff,
    discard,
    revision,
    viewer,
    waiting,
    settleSeat,
    waitForDecision,
    clickCard,
    press,
    discardIfAsked,
    answerAnyPrompt,
    playPlayableCard,
    declareAttackers,
    declareBlocker
  };
}

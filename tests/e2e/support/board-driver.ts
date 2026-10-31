import { type Locator, type Page } from '@playwright/test';

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
  /** Pass the device on, if the seat dialog is up. */
  settleSeat(): Promise<void>;
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
  const discard = page.locator('[aria-label="Descartar hasta siete cartas"]');

  const revision = async () => Number(await app.getAttribute('data-actions-applied'));
  const viewer = async () => Number(await app.getAttribute('data-viewer'));
  const waiting = async () => await decision.getAttribute('data-waiting');

  /**
   * The seat dialog covers the board, so a person passes the device before
   * acting. The dialog is the product's own privacy guard: it is dismissed
   * here, never bypassed.
   */
  const settleSeat = async () => {
    if (!(await handoff.isVisible().catch(() => false))) return;
    await handoff.locator('button').click({ timeout: 2_000 }).catch(() => {});
    await handoff.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  };

  /** Card clicks also cross the seat dialog; keep their timeout short and retry. */
  const clickCard = async (card: Locator) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await settleSeat();
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
    await settleSeat();
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
    return (await revision()) > before;
  };

  /**
   * The cleanup step asks the active player to discard down to the maximum
   * hand size (CR 514.1). Mesa shows how many cards Phase asks for and which
   * ones it accepts; the driver picks exactly that many from the hand and
   * confirms. The number is read from the panel, never guessed here.
   */
  const discardIfAsked = async (): Promise<boolean> => {
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
    if (await discardIfAsked()) return true;
    if (await press(decision.locator('button').filter({ hasText: 'Conservar mano' }).first())) return true;
    if (await press(decision.locator('button').filter({ hasText: 'Confirmar pago' }).first())) return true;
    if (await press(decision.locator('button').filter({ hasText: /^No atacar$/ }).first())) return true;
    if (await press(decision.locator('button').filter({ hasText: /^No bloquear$/ }).first())) return true;
    if (await press(decision.locator('.confirmations button').filter({ hasText: /^Pasar/ }).first())) return true;
    return press(decision.locator('.confirmations button:not([disabled])').first());
  };

  /**
   * Play the first card Mesa marks as playable: select it and press the
   * action the panel offers for it (jugar una tierra, lanzar un hechizo).
   */
  const playPlayableCard = async (): Promise<boolean> => {
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
    const attackers = battlefield.locator('[data-card-id][data-attack-options]:not([data-attack-options="0"])');
    if (!(await attackers.count())) return false;
    for (const card of await attackers.all()) await clickCard(card);
    const confirm = decision.locator('button').filter({ hasText: /^Confirmar ataque/ }).first();
    if (await confirm.count()) return press(confirm);
    return press(decision.locator('button').filter({ hasText: /^No atacar$/ }).first());
  };

  /** Assign one blocker to one attacker, the way the panel asks for it. */
  const declareBlocker = async (): Promise<boolean> => {
    const blocker = battlefield.locator('[data-card-id][data-block-options]:not([data-block-options="0"])').first();
    const attacker = rivalField.locator('[data-combat-role="Atacando"]').first();
    if (!(await blocker.count()) || !(await attacker.count())) return false;
    await clickCard(blocker);
    await clickCard(attacker);
    const confirm = decision.locator('button').filter({ hasText: /^Confirmar bloqueos/ }).first();
    if (await confirm.count()) return press(confirm);
    return press(decision.locator('button').filter({ hasText: /^No bloquear$/ }).first());
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
    clickCard,
    press,
    discardIfAsked,
    answerAnyPrompt,
    playPlayableCard,
    declareAttackers,
    declareBlocker
  };
}

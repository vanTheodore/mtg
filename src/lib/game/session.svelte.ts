import { tick } from 'svelte';
import { EngineClient, isSnapshot } from '#lib/engine/client.ts';
import { ENGINE_PROTOCOL_VERSION, type AttackTarget, type EngineReply, type EngineSnapshot, type GameAction, type ObjectId, type TargetRef } from '#lib/engine/types.ts';
import {
  attackDeclaration, attackTargets, blockDeclaration, blockTargets, cancelCastAction, chooseXAction,
  decideOptionalEffect, decideTribute, defaultOrder, defaultX, digPrompt as readDigPrompt, digReady as isDigReady,
  discardSelection,
  discardPrompt as readDiscardPrompt, manaActions,
  modeChoicePrompt as readModeChoice, modeConfirmable, modeSelectAction, modeSingleChoice,
  modeToggle, moveInOrder, nextBlockAssignment, objectTarget, orderTriggersAction, parseX,
  optionalEffectPrompt as readOptionalEffect, playerTarget, rememberOptionalEffect,
  choosePair, chooseTokenHost, chooseUnlessCostBranch, pairPrompt as readPairPrompt,
  unlessBranchPrompt as readUnlessBranch,
  tokenHostPrompt as readTokenHost, tributePrompt as readTribute, payUnlessCost,
  wardSacrificePrompt as readWardSacrifice, wardSacrificeAction,
  startingPlayerPrompt as readStartingPlayer, chooseStartingPlayer,
  scryPrompt as readScry, scryAction,
  tapPowerPrompt as readTapPower, tapPowerAction, tapPowerTotal, equipPrompt as readEquip, equipAction, stationPrompt as readStation, stationAction, multiTargetPrompt as readMultiTarget, multiTargetAction, distributePrompt as readDistribute, distributeAction, moveCountersPrompt as readMoveCounters, moveCountersAction, removeCountersPrompt as readRemoveCounters, removeCountersAction, type CounterRemovalSelection, retargetPrompt as readRetarget, retargetAction, chooseObjectsPrompt as readChooseObjects, chooseObjectsAction, proliferatePrompt as readProliferate, timeTravelPrompt as readTimeTravel, categoryPrompt as readCategory, categoryAction, copyChosenPrompt as readCopyChosen, copyChosenAction, keepPowerPrompt as readKeepPower, keepPowerAction, keepExactPrompt as readKeepExact, keepExactAction, selectTargetsAction, evenSplit, targetKey as splitKey, revealAction, revealPrompt as readRevealPrompt,
  unlessPrompt as readUnless,
  searchPrompt as readSearchPrompt, searchReady as isSearchReady, secondActivation,
  selectCardsAction, targetAction, togglePick, triggerOrderPrompt as readTriggerOrder,
  payAmountKey, parseAmount, payAmountPrompt as readPayAmountPrompt, submitPayAmount,
  xPrompt as readXPrompt
} from './interaction.ts';
import { summarizeEvents, type HistoryEntry } from './events.ts';

export type Theme = 'light' | 'dark' | 'system';
export type BoardStyle = 'arena' | 'classic';
export type CardImageLanguage = 'en' | 'es';

class GameSession {
  snapshot = $state.raw<EngineSnapshot | null>(null);
  status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  /** Human label of the deck/format in play, set by the start screen. */
  modeLabel = $state<string>('');
  busy = $state(false);
  error = $state<string | null>(null);
  selected = $state<number | null>(null);
  /** Card whose action menu is open (context menu / Shift+F10). UI state only. */
  cardMenu = $state<number | null>(null);
  inspect = $state<number | null>(null);
  revealedViewer = $state<number | null>(null);
  revealedTurn = $state<number | null>(null);
  handoffMode = $state<'turn' | 'every'>('turn');
  theme = $state<Theme>('system');
  boardStyle = $state<BoardStyle>('arena');
  cardImageLanguage = $state<CardImageLanguage>('en');
  cardScale = $state(1);
  density = $state<'comfortable' | 'compact'>('comfortable');
  lastMetrics = $state<EngineSnapshot['metrics'] | null>(null);
  attacks = $state<Record<string, AttackTarget>>({});
  /**
   * Anchored attack-target picker (`AttackTargetPicker`): which attacker, and
   * where its card was when the picker opened. The choices it offers are read
   * from the engine's `valid_attack_targets_by_attacker`; nothing is invented.
   */
  attackPicker = $state<{ id: ObjectId; anchor: DOMRect | null } | null>(null);
  blocks = $state<Record<string, ObjectId>>({});
  history = $state<HistoryEntry[]>([]);
  lifeChanges = $state<Record<string, { amount: number; revision: number }>>({});
  autoPass = $state(true);
  /**
   * Stops per step (`PhaseStopBar`). A stop means "do not let the auto-pass
   * close this window": Phase still decides whether there *is* a window and
   * whether passing is recommended, and the UI only refuses to take the
   * recommendation on the steps the player marked.
   *
   * Presentation preference, persisted per device. It never creates a priority
   * window the engine did not offer.
   */
  stops = $state<Record<string, boolean>>({});
  /**
   * Phone hand drawer. On a touch-sized screen the hand is a fixed sheet over
   * the board instead of an inline row: thirty cards inline pushed the
   * battlefield off screen (measured on /stress at 390×844: 3261px of
   * document height, of which the hand alone was ~1500px).
   *
   * This is presentation state only. The hand still renders exactly the
   * viewer's own cards and Phase's legality marks; nothing about the game
   * changes when the sheet opens or closes.
   */
  handDrawerOpen = $state(false);
  setHandDrawer(open: boolean) { this.handDrawerOpen = open; }
  autoPasses = $state(0);
  choosing = $state<number[]>([]);
  private autoPassQueued = false;
  private historyId = 0;
  private client = new EngineClient();
  private queue: Promise<unknown> = Promise.resolve();

  constructor() {
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('mesa:theme') as Theme | null;
      if (saved) this.theme = saved;
      const savedBoard = localStorage.getItem('mesa:boardStyle');
      if (savedBoard === 'arena' || savedBoard === 'classic') this.boardStyle = savedBoard;
      const imageLanguage = localStorage.getItem('mesa:cardImageLanguage');
      if (imageLanguage === 'es' || imageLanguage === 'en') this.cardImageLanguage = imageLanguage;
      const scale = Number(localStorage.getItem('mesa:cardScale'));
      if (scale >= 0.7 && scale <= 1.6) this.cardScale = scale;
      const density = localStorage.getItem('mesa:density');
      if (density === 'compact' || density === 'comfortable') this.density = density;
      if (localStorage.getItem('mesa:autoPass') === 'off') this.autoPass = false;
      if (localStorage.getItem('mesa:handoffMode') === 'every') this.handoffMode = 'every';
      try {
        const savedStops = JSON.parse(localStorage.getItem('mesa:stops') ?? '{}') as Record<string, unknown>;
        this.stops = Object.fromEntries(Object.entries(savedStops).filter(([, on]) => on === true)) as Record<string, boolean>;
      } catch {
        this.stops = {};
      }
    }
  }
  setTheme(theme: Theme) {
    this.theme = theme; localStorage.setItem('mesa:theme', theme);
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }
  setBoardStyle(style: BoardStyle) { this.boardStyle = style; localStorage.setItem('mesa:boardStyle', style); }
  setCardImageLanguage(lang: CardImageLanguage) { this.cardImageLanguage = lang; localStorage.setItem('mesa:cardImageLanguage', lang); }
  setCardScale(scale: number) { this.cardScale = scale; localStorage.setItem('mesa:cardScale', String(scale)); }
  setDensity(density: 'comfortable' | 'compact') { this.density = density; localStorage.setItem('mesa:density', density); }
  setHandoffMode(mode: 'turn' | 'every') {
    this.handoffMode = mode;
    localStorage.setItem('mesa:handoffMode', mode);
    this.revealedViewer = this.snapshot?.viewer ?? null;
    this.revealedTurn = this.snapshot?.state.turn_number ?? null;
  }
  /**
   * A blocking seat handoff is only required when another player's turn starts
   * (default) or on every seat change (strict). Priority windows inside one turn
   * swap only the visible hand, which is already the acting seat's own hand.
   */
  get needsHandoff() {
    const s = this.snapshot;
    if (!s || s.outcome || this.revealedViewer === null) return false;
    if (this.autoPassPending) return false;
    if (s.viewer === this.revealedViewer) return false;
    return this.handoffMode === 'every' || s.state.turn_number !== this.revealedTurn || s.state.waiting_for.type === 'MulliganDecision';
  }
  setAutoPass(enabled: boolean) { this.autoPass = enabled; localStorage.setItem('mesa:autoPass', enabled ? 'on' : 'off'); if (enabled) this.maybeAutoPass(); }
  /** Whether the player asked to hold this step. Unknown steps are never stops. */
  isStop(step: string | null | undefined): boolean { return !!step && this.stops[step] === true; }
  setStop(step: string, enabled: boolean) {
    const next = { ...this.stops };
    if (enabled) next[step] = true; else delete next[step];
    this.stops = next;
    try { localStorage.setItem('mesa:stops', JSON.stringify(next)); } catch { /* private mode */ }
    // Turning a stop off may release a window the player was holding.
    if (!enabled) this.maybeAutoPass();
  }
  toggleStop(step: string) { this.setStop(step, !this.isStop(step)); }
  get stopActive() { return this.isStop(this.snapshot?.state.phase); }
  /** Phase's viewer-scoped recommendation; the UI never decides that by itself. */
  get autoPassPending() {
    return this.autoPass
      && !this.stopActive
      && !!this.snapshot
      && !this.snapshot.outcome
      && this.snapshot.state.waiting_for.type === 'Priority'
      && this.snapshot.auto_pass_recommended === true;
  }
  private maybeAutoPass() {
    if (this.autoPassQueued || !this.autoPassPending) return;
    if (this.autoPasses >= 5000) { this.autoPass = false; this.error = 'Se desactivó el auto-paso tras 5000 ventanas; revisa la partida.'; return; }
    this.autoPassQueued = true;
    queueMicrotask(() => {
      this.autoPassQueued = false;
      if (!this.autoPassPending) return;
      this.autoPasses++;
      void this.dispatch({ type: 'PassPriority' });
    });
  }

  async start(catalog: unknown, decks: unknown, seed = 42) {
    await this.queue.catch(() => {});
    this.status = 'loading'; this.error = null; this.snapshot = null;
    this.revealedViewer = null; this.revealedTurn = null; this.selected = null; this.inspect = null;
    this.attacks = {}; this.blocks = {}; this.attackPicker = null; this.history = []; this.lifeChanges = {}; this.lastMetrics = null;
    this.choosing = []; this.autoPasses = 0; this.autoPassQueued = false; this.historyId = 0;
    try {
      const reply = await this.client.init({ protocol_version: ENGINE_PROTOCOL_VERSION, catalog, decks, seed, first_player: 0 });
      await this.apply(reply);
      if (reply.ok) { this.revealedViewer = reply.viewer; this.revealedTurn = reply.state.turn_number; this.status = 'ready'; }
      else this.status = 'error';
    } catch (e) { this.status = 'error'; this.error = e instanceof Error ? e.message : String(e); }
  }

  /**
   * Forget the current game and go back to the start screen.
   *
   * The engine keeps one session at a time, so leaving the tutorial (or
   * starting a different game) has to release it: the worker is terminated
   * and the next {@link start} builds a fresh one.
   */
  reset() {
    this.client.terminate();
    this.snapshot = null;
    this.status = 'idle';
    this.error = null;
    this.modeLabel = '';
    this.selected = null;
    this.inspect = null;
    this.revealedViewer = null;
    this.revealedTurn = null;
    this.attacks = {};
    this.blocks = {};
    this.attackPicker = null;
    this.choosing = [];
    this.xEntry = null;
    this.payEntry = null;
    this.orderEntry = null;
    this.modeEntry = null;
    this.searched = [];
    this.dug = [];
    this.revealPick = null;
    this.pairPick = null;
    this.hostPick = null;
    this.branchPick = null;
    this.scryKeep = [];
    this.tapPick = [];
    this.multiPick = [];
    this.splitAmount = {};
    this.movePick = {};
    this.removePick = {};
    this.retargetPick = {};
    this.choosePick = [];
    this.proliferatePick = [];
    this.timeTravelPick = [];
    this.categoryPick = {};
    this.copyChosenPick = [];
    this.keepPowerPick = [];
    this.keepExactPick = [];
    this.optionalRemember = false;
    this.optionalSameCard = false;
    this.history = [];
    this.lifeChanges = {};
    this.lastMetrics = null;
    this.busy = false;
  }

  dispatch(action: GameAction): Promise<void> {
    const run = async () => {
      if (!this.snapshot || this.busy || this.snapshot.outcome) return;
      this.busy = true; this.error = null;
      try {
        const reply = await this.client.action(this.snapshot.viewer, action, this.snapshot.revision);
        await this.apply(reply);
        if (!reply.ok && reply.code === 'stale_action') await this.apply(await this.client.view(this.snapshot.viewer));
      } catch (e) { this.error = e instanceof Error ? e.message : String(e); }
      finally { this.busy = false; }
    };
    this.queue = this.queue.then(run, run);
    return this.queue as Promise<void>;
  }

  openCardMenu(id: ObjectId) { this.cardMenu = id; }
  closeCardMenu() { this.cardMenu = null; }
  openAttackPicker(id: ObjectId, anchor: DOMRect | null) { this.attackPicker = { id, anchor }; }
  closeAttackPicker() {
    const id = this.attackPicker?.id;
    this.attackPicker = null;
    // Dropping the selection too is what stops the picker from reopening: the
    // table opens it when a multi-target attacker becomes the selection.
    if (id !== undefined && this.selected === id) this.selected = null;
  }

  selectObject(id: ObjectId) {
    const s = this.snapshot;
    if (!s || this.busy) return;
    if (this.discardPrompt) { this.toggleChoice(id); return; }
    const target = targetAction(s, objectTarget(id));
    if (target) { void this.dispatch(target); return; }
    const w = s.state.waiting_for;
    if (w.type === 'DeclareBlockers') {
      const next = nextBlockAssignment(this.selected, id, (s.state.combat?.attackers ?? []).map((a) => a.object_id), (blocker) => blockTargets(s, blocker));
      this.selected = next.selected;
      if (next.assignment) this.blocks = { ...this.blocks, [next.assignment[0]]: next.assignment[1] };
      return;
    }
    if (w.type === 'DeclareAttackers' && attackTargets(s, id).length) {
      if (this.selected === id) { this.selected = null; return; }
      this.selected = id;
      const destinations = attackTargets(s, id);
      if (destinations.length === 1) this.attacks = { ...this.attacks, [id]: destinations[0] };
      return;
    }
    const mana = manaActions(s, id);
    if (mana.length === 1) { void this.dispatch(mana[0]); return; }
    // A second activation on the same card commits the single obvious action
    // (play the land, cast the only option). Ambiguity keeps it a selection.
    if (this.selected === id) {
      const commit = secondActivation(s, id);
      if (commit.action) { void this.dispatch(commit.action); return; }
    }
    this.selected = this.selected === id ? null : id;
  }

  selectPlayer(id: number) {
    const target = targetAction(this.snapshot, playerTarget(id));
    if (target) { void this.dispatch(target); return; }
    const selected = this.selected;
    if (selected !== null && this.snapshot?.state.waiting_for.type === 'DeclareAttackers') {
      const destination = attackTargets(this.snapshot, selected).find((t) => t.type === 'Player' && t.data === id);
      if (destination) { this.attacks = { ...this.attacks, [selected]: destination }; this.selected = null; }
    }
  }
  chooseAttackDestination(id: ObjectId, target: AttackTarget) {
    if (attackTargets(this.snapshot, id).some((t) => JSON.stringify(t) === JSON.stringify(target))) {
      this.attacks = { ...this.attacks, [id]: target }; this.selected = null;
    }
  }
  removeAttack(id: ObjectId) { const next = { ...this.attacks }; delete next[id]; this.attacks = next; }
  removeBlock(id: ObjectId) { const next = { ...this.blocks }; delete next[id]; this.blocks = next; }
  confirmAttackers() {
    void this.dispatch(attackDeclaration(this.attacks));
  }
  confirmBlockers() {
    void this.dispatch(blockDeclaration(this.blocks));
  }
  confirmHandoff() {
    if (!this.snapshot) return;
    this.revealedViewer = this.snapshot.viewer;
    this.revealedTurn = this.snapshot.state.turn_number;
  }
  /** Discard prompts publish the chooseable set and exact count; the UI only picks among them. */
  get discardPrompt() {
    return readDiscardPrompt(this.snapshot);
  }
  toggleChoice(id: number) {
    const prompt = this.discardPrompt;
    if (!prompt || !prompt.cards.includes(id)) return;
    const has = this.choosing.includes(id);
    if (has) this.choosing = this.choosing.filter((x) => x !== id);
    else if (this.choosing.length < prompt.count) this.choosing = [...this.choosing, id];
  }
  /** True while the current discard answer is one the engine will accept. */
  get discardReady() {
    const prompt = this.discardPrompt;
    if (!prompt) return false;
    return prompt.upTo ? this.choosing.length <= prompt.count : this.choosing.length === prompt.count;
  }
  confirmDiscard() {
    const prompt = this.discardPrompt;
    if (!prompt || !this.discardReady) return;
    const cards = [...this.choosing];
    this.choosing = [];
    void this.dispatch(discardSelection(cards));
  }

  /** CR 702.122a / CR 702.171a: tap creatures until their contribution adds up. */
  get tapPowerPrompt() {
    return readTapPower(this.snapshot);
  }
  tapPick = $state<ObjectId[]>([]);
  toggleTapPick(id: ObjectId) {
    const picked = this.tapPick;
    this.tapPick = picked.includes(id) ? picked.filter((card) => card !== id) : [...picked, id];
  }
  /** CR 702.122a: the sum of the engine's contributions for the picked creatures. */
  get tapTotal(): number | null {
    const prompt = this.tapPowerPrompt;
    return prompt ? tapPowerTotal(prompt, this.tapPick) : null;
  }
  get tapReady(): boolean {
    const prompt = this.tapPowerPrompt;
    if (!prompt) return false;
    const total = this.tapTotal;
    // Without a published contribution there is no sum to claim: Phase decides.
    if (total === null) return this.tapPick.length > 0;
    return total >= prompt.required;
  }
  confirmTapPick() {
    const prompt = this.tapPowerPrompt;
    if (!prompt || !this.tapPick.length) return;
    const ids = this.tapPick;
    this.tapPick = [];
    void this.dispatch(tapPowerAction(prompt, ids));
  }

  /** CR 122.5 + CR 608.2d: which counters leave the source and where they land. */
  get moveCountersPrompt() {
    return readMoveCounters(this.snapshot);
  }
  /** Amounts keyed by `type|destination`; the validator forbids repeated pairs. */
  movePick = $state<Record<string, number>>({});
  moveAmount(type: string, destination: ObjectId): number {
    return this.movePick[`${type}|${destination}`] ?? 0;
  }
  /** What is left of one counter type after the picks. */
  moveRemaining(type: string): number {
    const prompt = this.moveCountersPrompt;
    const offer = prompt?.available.find((entry) => entry.type === type);
    if (!prompt || !offer) return 0;
    const spent = prompt.destinations.reduce((sum, id) => sum + this.moveAmount(type, id), 0);
    return Math.max(0, offer.count - spent);
  }
  setMove(type: string, destination: ObjectId, amount: number) {
    const prompt = this.moveCountersPrompt;
    if (!prompt) return;
    const offer = prompt.available.find((entry) => entry.type === type);
    if (!offer) return;
    const others = prompt.destinations
      .filter((id) => id !== destination)
      .reduce((sum, id) => sum + this.moveAmount(type, id), 0);
    // The engine's ceiling is per counter type, not global.
    const clamped = Math.max(0, Math.min(Math.trunc(amount), offer.count - others));
    this.movePick = { ...this.movePick, [`${type}|${destination}`]: clamped };
  }
  get moveSelections(): { destinationId: ObjectId; counterType: string; count: number }[] {
    const prompt = this.moveCountersPrompt;
    if (!prompt) return [];
    return prompt.available.flatMap((offer) =>
      prompt.destinations
        .map((id) => ({ destinationId: id, counterType: offer.type, count: this.moveAmount(offer.type, id) }))
        .filter((entry) => entry.count > 0)
    );
  }
  /** Moving nothing is legal: the text says "may move any number". */
  confirmMoveCounters() {
    const prompt = this.moveCountersPrompt;
    if (!prompt) return;
    const selections = this.moveSelections;
    this.movePick = {};
    void this.dispatch(moveCountersAction(selections));
  }

  /** CR 107.1c + CR 608.2d: counters leaving the source, one amount per kind. */
  get removeCountersPrompt() {
    return readRemoveCounters(this.snapshot);
  }
  /** Amounts keyed by counter type; the validator forbids repeated kinds. */
  removePick = $state<Record<string, number>>({});
  removeAmount(type: string): number {
    return this.removePick[type] ?? 0;
  }
  get removeTotal(): number {
    return Object.values(this.removePick).reduce((sum, count) => sum + count, 0);
  }
  /** CR 608.2d: what is left of "up to N"; `null` is the uncapped "any number". */
  get removeBudget(): number | null {
    const prompt = this.removeCountersPrompt;
    if (!prompt || prompt.maxTotal === null) return null;
    return Math.max(0, prompt.maxTotal - this.removeTotal);
  }
  /** The per-kind ceiling the engine published: what is actually on the source. */
  removeAvailable(type: string): number {
    return this.removeCountersPrompt?.available.find((entry) => entry.type === type)?.count ?? 0;
  }
  setRemove(type: string, amount: number) {
    const prompt = this.removeCountersPrompt;
    if (!prompt) return;
    const offer = prompt.available.find((entry) => entry.type === type);
    if (!offer) return;
    const current = this.removeAmount(type);
    // Two ceilings, both the engine's: the counters of that kind, and — when the
    // text says "up to N" — the budget still free after the other kinds.
    const budget = this.removeBudget;
    const ceiling = budget === null ? offer.count : Math.min(offer.count, current + budget);
    const clamped = Math.max(0, Math.min(Math.trunc(amount), ceiling));
    this.removePick = { ...this.removePick, [type]: clamped };
  }
  /** Steps one kind by ±1 so the block never asks the player for a number. */
  stepRemove(type: string, delta: number) {
    this.setRemove(type, this.removeAmount(type) + delta);
  }
  get removeSelections(): CounterRemovalSelection[] {
    const prompt = this.removeCountersPrompt;
    if (!prompt) return [];
    return prompt.available
      .map((offer) => ({ counterType: offer.type, count: this.removeAmount(offer.type) }))
      .filter((entry) => entry.count > 0);
  }
  get removeReady(): boolean {
    // CR 107.1c: zero is a legal number of counters, so the empty set confirms.
    return this.removeCountersPrompt !== null;
  }
  confirmRemoveCounters() {
    const prompt = this.removeCountersPrompt;
    if (!prompt) return;
    const selections = this.removeSelections;
    this.removePick = {};
    void this.dispatch(removeCountersAction(selections));
  }

  /** CR 115.7: repointing a spell (or ability) that is already on the stack. */
  get retargetPrompt() {
    return readRetarget(this.snapshot);
  }
  /** Position → replacement; a position absent from the map keeps its target. */
  retargetPick = $state<Record<number, TargetRef>>({});
  retargetPicked(index: number): TargetRef | undefined {
    return this.retargetPick[index];
  }
  /**
   * Only what that position admits is selectable — the per-position pool is the
   * engine's own admission set, so the UI cannot offer a target it would reject.
   */
  retargetCandidates(index: number): TargetRef[] {
    const prompt = this.retargetPrompt;
    if (!prompt) return [];
    const pool = prompt.pools[index] ?? prompt.union;
    const declared = prompt.current[index];
    // The declared target is its own alternative only where the announced object
    // is gone: naming that id elects the object that came back (CR 400.7).
    if (!declared || prompt.keepDistinct[index]) return pool;
    return pool.filter((ref) => splitKey(ref) !== splitKey(declared));
  }
  setRetarget(index: number, target: TargetRef | null) {
    const prompt = this.retargetPrompt;
    if (!prompt) return;
    if (!target) {
      const next = { ...this.retargetPick };
      delete next[index];
      this.retargetPick = next;
      return;
    }
    if (!this.retargetCandidates(index).some((ref) => splitKey(ref) === splitKey(target))) return;
    // "Change the target" names one new target: there is nothing else to keep.
    this.retargetPick = prompt.scope === 'single' ? { [index]: target } : { ...this.retargetPick, [index]: target };
  }
  /** One entry per position, in the prompt's order; `null` is the engine's keep. */
  get retargetSelections(): (TargetRef | null)[] {
    const prompt = this.retargetPrompt;
    if (!prompt) return [];
    return prompt.current.map((_, index) => this.retargetPick[index] ?? null);
  }
  get retargetReady(): boolean {
    const prompt = this.retargetPrompt;
    if (!prompt) return false;
    return prompt.scope === 'single' ? Object.keys(this.retargetPick).length === 1 : true;
  }
  get retargetChanged(): number {
    return Object.keys(this.retargetPick).length;
  }
  confirmRetarget() {
    if (!this.retargetReady) return;
    const newTargets = this.retargetSelections;
    this.retargetPick = {};
    void this.dispatch(retargetAction(newTargets));
  }

  /** CR 608.2c + CR 115.10a: a set of permanents (or a damage recipient). */
  get chooseObjectsPrompt() {
    return readChooseObjects(this.snapshot);
  }
  /** Picks by `targetKey`, in the order they were made. */
  choosePick = $state<string[]>([]);
  chooseIsPicked(target: TargetRef): boolean {
    return this.choosePick.includes(splitKey(target));
  }
  get chooseSelected(): TargetRef[] {
    const prompt = this.chooseObjectsPrompt;
    if (!prompt) return [];
    return this.choosePick
      .map((key) => prompt.eligible.find((target) => splitKey(target) === key))
      .filter((target): target is TargetRef => !!target);
  }
  toggleChooseObject(target: TargetRef) {
    const prompt = this.chooseObjectsPrompt;
    if (!prompt) return;
    const key = splitKey(target);
    if (this.choosePick.includes(key)) {
      this.choosePick = this.choosePick.filter((entry) => entry !== key);
      return;
    }
    // The ceiling is the engine's: never hold more than it will accept.
    if (this.choosePick.length >= prompt.max) return;
    if (!prompt.eligible.some((entry) => splitKey(entry) === key)) return;
    this.choosePick = [...this.choosePick, key];
  }
  get chooseReady(): boolean {
    const prompt = this.chooseObjectsPrompt;
    if (!prompt) return false;
    return this.choosePick.length >= prompt.min && this.choosePick.length <= prompt.max;
  }
  confirmChooseObjects() {
    if (!this.chooseReady) return;
    const targets = this.chooseSelected;
    this.choosePick = [];
    void this.dispatch(chooseObjectsAction(targets));
  }

  /** CR 701.34a: any number of the objects that already have a counter. */
  get proliferatePrompt() {
    return readProliferate(this.snapshot);
  }
  proliferatePick = $state<string[]>([]);
  proliferateIsPicked(target: TargetRef): boolean {
    return this.proliferatePick.includes(splitKey(target));
  }
  get proliferateSelected(): TargetRef[] {
    const prompt = this.proliferatePrompt;
    if (!prompt) return [];
    return this.proliferatePick
      .map((key) => prompt.eligible.find((target) => splitKey(target) === key))
      .filter((target): target is TargetRef => !!target);
  }
  toggleProliferate(target: TargetRef) {
    const prompt = this.proliferatePrompt;
    if (!prompt) return;
    const key = splitKey(target);
    if (this.proliferatePick.includes(key)) {
      this.proliferatePick = this.proliferatePick.filter((entry) => entry !== key);
      return;
    }
    if (!prompt.eligible.some((entry) => splitKey(entry) === key)) return;
    this.proliferatePick = [...this.proliferatePick, key];
  }
  confirmProliferate() {
    const prompt = this.proliferatePrompt;
    if (!prompt) return;
    const targets = this.proliferateSelected;
    this.proliferatePick = [];
    void this.dispatch(selectTargetsAction(targets));
  }

  /** CR 701.56a: the same list twice — first which to remove from, then which to add to. */
  get timeTravelPrompt() {
    return readTimeTravel(this.snapshot);
  }
  timeTravelPick = $state<string[]>([]);
  timeTravelIsPicked(target: TargetRef): boolean {
    return this.timeTravelPick.includes(splitKey(target));
  }
  get timeTravelSelected(): TargetRef[] {
    const prompt = this.timeTravelPrompt;
    if (!prompt) return [];
    return this.timeTravelPick
      .map((key) => prompt.eligible.find((target) => splitKey(target) === key))
      .filter((target): target is TargetRef => !!target);
  }
  toggleTimeTravel(target: TargetRef) {
    const prompt = this.timeTravelPrompt;
    if (!prompt) return;
    const key = splitKey(target);
    if (this.timeTravelPick.includes(key)) {
      this.timeTravelPick = this.timeTravelPick.filter((entry) => entry !== key);
      return;
    }
    if (!prompt.eligible.some((entry) => splitKey(entry) === key)) return;
    this.timeTravelPick = [...this.timeTravelPick, key];
  }
  confirmTimeTravel() {
    const prompt = this.timeTravelPrompt;
    if (!prompt) return;
    const targets = this.timeTravelSelected;
    // The next phase (or priority) arrives with the new snapshot, which clears the picks.
    this.timeTravelPick = [];
    void this.dispatch(selectTargetsAction(targets));
  }

  /** CR 101.4: one permanent per type category kept, the rest sacrificed. */
  get categoryPrompt() {
    return readCategory(this.snapshot);
  }
  /** Category index → the permanent kept for it; absent means "nothing to keep". */
  categoryPick = $state<Record<number, ObjectId>>({});
  categoryPicked(index: number): ObjectId | undefined {
    return this.categoryPick[index];
  }
  setCategoryPick(index: number, id: ObjectId | null) {
    const prompt = this.categoryPrompt;
    if (!prompt) return;
    const next = { ...this.categoryPick };
    if (id === null) {
      delete next[index];
      this.categoryPick = next;
      return;
    }
    // Each slot admits exactly what its own category published, and one pick.
    if (!prompt.categories[index]?.eligible.includes(id)) return;
    this.categoryPick = { ...next, [index]: id };
  }
  /** One slot per category, in the prompt's order; `null` where it offered none. */
  get categoryChoices(): (ObjectId | null)[] {
    const prompt = this.categoryPrompt;
    if (!prompt) return [];
    return prompt.categories.map((_, index) => this.categoryPick[index] ?? null);
  }
  /** Distinct permanents kept: two categories can name the same artifact creature. */
  get categoryKeptCount(): number {
    return new Set(Object.values(this.categoryPick)).size;
  }
  get categoryReady(): boolean {
    const prompt = this.categoryPrompt;
    if (!prompt) return false;
    return prompt.categories.every(({ eligible }, index) => !eligible.length || this.categoryPick[index] !== undefined);
  }
  confirmCategory() {
    if (!this.categoryReady) return;
    const choices = this.categoryChoices;
    this.categoryPick = {};
    void this.dispatch(categoryAction(choices));
  }

  /** CR 707.2: an ordered pick — the first is copied, the second scales the copy. */
  get copyChosenPrompt() {
    return readCopyChosen(this.snapshot);
  }
  /** Object ids in the order the player picked them; order is the rule. */
  copyChosenPick = $state<ObjectId[]>([]);
  copyChosenRank(id: ObjectId): number {
    return this.copyChosenPick.indexOf(id);
  }
  toggleCopyChosen(id: ObjectId) {
    const prompt = this.copyChosenPrompt;
    if (!prompt) return;
    if (this.copyChosenPick.includes(id)) {
      // Removing an earlier pick re-ranks the ones after it, which is the point.
      this.copyChosenPick = this.copyChosenPick.filter((entry) => entry !== id);
      return;
    }
    if (this.copyChosenPick.length >= prompt.max) return;
    if (!prompt.eligible.includes(id)) return;
    this.copyChosenPick = [...this.copyChosenPick, id];
  }
  get copyChosenReady(): boolean {
    const prompt = this.copyChosenPrompt;
    if (!prompt) return false;
    return this.copyChosenPick.length >= prompt.min && this.copyChosenPick.length <= prompt.max;
  }
  confirmCopyChosen() {
    if (!this.copyChosenReady) return;
    const ids = this.copyChosenPick;
    this.copyChosenPick = [];
    void this.dispatch(copyChosenAction(ids));
  }

  /** CR 107.1c: keep a subset whose combined power fits the cap. */
  get keepPowerPrompt() {
    return readKeepPower(this.snapshot);
  }
  /** CR 208.3: the power the engine publishes for that creature, if it does. */
  powerOf(id: ObjectId): number | undefined {
    const value = (this.snapshot?.state.objects[String(id)] as { power?: unknown } | undefined)?.power;
    return typeof value === 'number' ? value : undefined;
  }
  keepPowerPick = $state<ObjectId[]>([]);
  keepPowerIsPicked(id: ObjectId): boolean {
    return this.keepPowerPick.includes(id);
  }
  /** Sum of the picked powers; `null` when any of them is unpublished. */
  get keepPowerTotal(): number | null {
    let total = 0;
    for (const id of this.keepPowerPick) {
      const power = this.powerOf(id);
      if (power === undefined) return null;
      total += power;
    }
    return total;
  }
  /** True when that creature still fits under the cap (CR 208.3). */
  keepPowerFits(id: ObjectId): boolean {
    const prompt = this.keepPowerPrompt;
    if (!prompt) return false;
    const total = this.keepPowerTotal;
    const power = this.powerOf(id);
    // Without a published power the screen cannot promise it fits; it lets the
    // engine be the one to refuse.
    if (total === null || power === undefined) return true;
    return total + power <= prompt.cap;
  }
  toggleKeepPower(id: ObjectId) {
    const prompt = this.keepPowerPrompt;
    if (!prompt) return;
    if (this.keepPowerPick.includes(id)) {
      this.keepPowerPick = this.keepPowerPick.filter((entry) => entry !== id);
      return;
    }
    if (!prompt.eligible.includes(id) || !this.keepPowerFits(id)) return;
    this.keepPowerPick = [...this.keepPowerPick, id];
  }
  /** Zero is a legal answer, and it sacrifices everything: nothing blocks here. */
  confirmKeepPower() {
    const prompt = this.keepPowerPrompt;
    if (!prompt) return;
    const kept = this.keepPowerPick;
    this.keepPowerPick = [];
    void this.dispatch(keepPowerAction(kept));
  }

  /** CR 101.4 + CR 609.3: exactly the number the engine resolved, all distinct. */
  get keepExactPrompt() {
    return readKeepExact(this.snapshot);
  }
  keepExactPick = $state<ObjectId[]>([]);
  keepExactIsPicked(id: ObjectId): boolean {
    return this.keepExactPick.includes(id);
  }
  get keepExactRemaining(): number {
    const prompt = this.keepExactPrompt;
    return prompt ? Math.max(0, prompt.requiredCount - this.keepExactPick.length) : 0;
  }
  toggleKeepExact(id: ObjectId) {
    const prompt = this.keepExactPrompt;
    if (!prompt) return;
    if (this.keepExactPick.includes(id)) {
      this.keepExactPick = this.keepExactPick.filter((entry) => entry !== id);
      return;
    }
    // The ceiling is the engine's own number; it is not derived from the pool.
    if (this.keepExactPick.length >= prompt.requiredCount) return;
    if (!prompt.eligible.includes(id)) return;
    this.keepExactPick = [...this.keepExactPick, id];
  }
  get keepExactReady(): boolean {
    const prompt = this.keepExactPrompt;
    if (!prompt) return false;
    return this.keepExactPick.length === prompt.requiredCount;
  }
  confirmKeepExact() {
    if (!this.keepExactReady) return;
    const kept = this.keepExactPick;
    this.keepExactPick = [];
    void this.dispatch(keepExactAction(kept));
  }

  /** CR 601.2d / CR 608.2d: how much of an amount each recipient gets. */
  get distributePrompt() {
    return readDistribute(this.snapshot);
  }
  /** Portions by `TargetRef` key; a recipient absent from the map gets zero. */
  splitAmount = $state<Record<string, number>>({});
  get splitEntries(): [TargetRef, number][] {
    const prompt = this.distributePrompt;
    if (!prompt) return [];
    return prompt.targets
      .filter((target) => (this.splitAmount[splitKey(target)] ?? 0) > 0)
      .map((target) => [target, this.splitAmount[splitKey(target)] ?? 0]);
  }
  get splitTotal(): number {
    return this.splitEntries.reduce((sum, [, amount]) => sum + amount, 0);
  }
  setSplit(target: TargetRef, amount: number) {
    const prompt = this.distributePrompt;
    if (!prompt) return;
    // The window is the engine's: never below zero, never above what is left —
    // the validator requires the portions to sum to exactly `total`.
    const clamped = Math.max(0, Math.min(Math.trunc(amount), prompt.total));
    this.splitAmount = { ...this.splitAmount, [splitKey(target)]: clamped };
  }
  get splitReady(): boolean {
    const prompt = this.distributePrompt;
    if (!prompt) return false;
    if (prompt.unit === 'even') return evenSplit(prompt.total, prompt.targets.length) !== null;
    if (this.splitTotal !== prompt.total) return false;
    // CR 601.2d: an announce-time division names every target with at least one.
    if (prompt.scope === 'announced') {
      return prompt.targets.every((target) => (this.splitAmount[splitKey(target)] ?? 0) >= 1);
    }
    return true;
  }
  confirmSplit() {
    const prompt = this.distributePrompt;
    if (!prompt || !this.splitReady) return;
    const entries: [TargetRef, number][] =
      prompt.unit === 'even'
        ? (evenSplit(prompt.total, prompt.targets.length) ?? []).map((amount, index) => [prompt.targets[index], amount])
        : this.splitEntries;
    this.splitAmount = {};
    void this.dispatch(distributeAction(entries));
  }

  /** CR 601.2c: the set of targets a multi-target spell or ability asks for. */
  get multiTargetPrompt() {
    return readMultiTarget(this.snapshot);
  }
  multiPick = $state<ObjectId[]>([]);
  toggleMultiPick(id: ObjectId) {
    const prompt = this.multiTargetPrompt;
    const picked = this.multiPick;
    if (!prompt) return;
    if (picked.includes(id)) {
      this.multiPick = picked.filter((card) => card !== id);
      return;
    }
    // CR 601.2c: the window is the engine's; above it the extra target is not a
    // choice the engine would take, so the row stops accepting one.
    if (picked.length >= prompt.max) return;
    this.multiPick = [...picked, id];
  }
  get multiReady(): boolean {
    const prompt = this.multiTargetPrompt;
    if (!prompt) return false;
    return this.multiPick.length >= prompt.min && this.multiPick.length <= prompt.max;
  }
  confirmMultiPick() {
    if (!this.multiReady) return;
    const ids = this.multiPick;
    this.multiPick = [];
    void this.dispatch(multiTargetAction(ids));
  }

  /** CR 702.184a: which single creature pays the station cost. */
  get stationPrompt() {
    return readStation(this.snapshot);
  }
  stationTo(creatureId: ObjectId) {
    const prompt = this.stationPrompt;
    if (!prompt) return;
    void this.dispatch(stationAction(prompt.spacecraftId, creatureId));
  }

  /** CR 702.6a: which permanent the equipment attaches to. */
  get equipPrompt() {
    return readEquip(this.snapshot);
  }
  equipTo(targetId: ObjectId) {
    const prompt = this.equipPrompt;
    if (!prompt) return;
    void this.dispatch(equipAction(prompt.equipmentId, targetId));
  }

  /** CR 701.22a / CR 701.25a: look at the top N and keep any of it on top. */
  get scryPrompt() {
    return readScry(this.snapshot);
  }
  /** The keep-on-top cards, in the order they will sit on the library. */
  scryKeep = $state<ObjectId[]>([]);
  toggleScryKeep(id: ObjectId) {
    const kept = this.scryKeep;
    this.scryKeep = kept.includes(id) ? kept.filter((card) => card !== id) : [...kept, id];
  }
  /** Order matters: the first kept card ends up on the very top. */
  moveScryKeep(id: ObjectId, direction: -1 | 1) {
    const kept = [...this.scryKeep];
    const at = kept.indexOf(id);
    const to = at + direction;
    if (at < 0 || to < 0 || to >= kept.length) return;
    [kept[at], kept[to]] = [kept[to]!, kept[at]!];
    this.scryKeep = kept;
  }
  confirmScry() {
    const cards = this.scryKeep;
    this.scryKeep = [];
    void this.dispatch(scryAction(cards));
  }

  /** CR 103.1: the roll winner names who takes the first turn. */
  get startingPlayerPrompt() {
    return readStartingPlayer(this.snapshot);
  }
  startWith(player: number) {
    void this.dispatch(chooseStartingPlayer(player));
  }

  /** CR 702.21b: which permanents pay the ward cost. */
  get wardSacrificePrompt() {
    return readWardSacrifice(this.snapshot);
  }
  payWard(cards: ObjectId[]) {
    void this.dispatch(wardSacrificeAction(cards));
  }

  /** CR 702.104a: an opponent decides whether the tribute is paid. */
  get tributePrompt() {
    return readTribute(this.snapshot);
  }
  decideTribute(pay: boolean) {
    void this.dispatch(decideTribute(pay));
  }

  /** CR 118.12a: which sub-cost of a disjunctive unless-cost to pay. */
  get unlessBranchPrompt() {
    return readUnlessBranch(this.snapshot);
  }
  /** Position in `costs`; the engine identifies a branch by index, not by shape. */
  branchPick = $state<number | null>(null);
  pickBranch(index: number) {
    this.branchPick = this.branchPick === index ? null : index;
  }
  confirmBranch() {
    const index = this.branchPick;
    if (index === null || !this.unlessBranchPrompt) return;
    this.branchPick = null;
    void this.dispatch(chooseUnlessCostBranch(index));
  }
  declineBranch() {
    this.branchPick = null;
    void this.dispatch(chooseUnlessCostBranch(null));
  }

  /** Alchemy batch entry: which of the stamped creatures receives the token. */
  get tokenHostPrompt() {
    return readTokenHost(this.snapshot);
  }
  /** Index into `hosts`, because a `TargetRef` is an object, not a key. */
  hostPick = $state<number | null>(null);
  toggleHost(index: number) {
    if (!this.tokenHostPrompt) return;
    this.hostPick = this.hostPick === index ? null : index;
  }
  get hostReady() {
    const prompt = this.tokenHostPrompt;
    return prompt !== null && this.hostPick !== null && prompt.hosts[this.hostPick] !== undefined;
  }
  confirmHost() {
    const prompt = this.tokenHostPrompt;
    const index = this.hostPick;
    if (!prompt || index === null) return;
    const host = prompt.hosts[index];
    if (!host) return;
    this.hostPick = null;
    void this.dispatch(chooseTokenHost(host));
  }

  /** CR 702.95a: which creature becomes the soulbond partner, or none. */
  get pairPrompt() {
    return readPairPrompt(this.snapshot);
  }
  pairPick = $state<ObjectId | null>(null);
  get pairReady() {
    const prompt = this.pairPrompt;
    return prompt !== null && prompt.choices.includes(this.pairPick ?? -1);
  }
  togglePair(id: ObjectId) {
    if (!this.pairPrompt) return;
    this.pairPick = this.pairPick === id ? null : id;
  }
  confirmPair() {
    if (!this.pairReady) return;
    const partner = this.pairPick;
    this.pairPick = null;
    void this.dispatch(choosePair(partner));
  }
  /** CR 608.2d: the pairing is optional, so declining is an answer. */
  declinePair() {
    if (!this.pairPrompt) return;
    this.pairPick = null;
    void this.dispatch(choosePair(null));
  }

  /** CR 118.12: pay the unless-cost, or let the effect happen. */
  get unlessPrompt() {
    return readUnless(this.snapshot);
  }
  decideUnless(pay: boolean) {
    if (!this.unlessPrompt) return;
    void this.dispatch(payUnlessCost(pay));
  }

  /** CR 701.20a: which card the player shows, or none. */
  get revealPrompt() {
    return readRevealPrompt(this.snapshot);
  }
  /** The single card marked for the reveal. One pick, so a plain id or nothing. */
  revealPick = $state<ObjectId | null>(null);
  get revealReady() {
    const prompt = this.revealPrompt;
    return prompt !== null && prompt.cards.includes(this.revealPick ?? -1);
  }
  toggleReveal(id: ObjectId) {
    if (!this.revealPrompt) return;
    this.revealPick = this.revealPick === id ? null : id;
  }
  confirmReveal() {
    if (!this.revealReady) return;
    const card = this.revealPick;
    this.revealPick = null;
    void this.dispatch(revealAction(card));
  }
  /** CR 701.20a: revealing nothing — only when the engine offered the decline. */
  declineReveal() {
    const prompt = this.revealPrompt;
    if (!prompt?.optional) return;
    this.revealPick = null;
    void this.dispatch(revealAction(null));
  }

  /** CR 608.2d: an optional instruction the controller may decline. */
  get optionalEffectPrompt() {
    return readOptionalEffect(this.snapshot);
  }
  /** CR 603.5: the "do not ask again" boxes, reset with every new prompt. */
  optionalRemember = $state(false);
  optionalSameCard = $state(false);
  decideOptional(accept: boolean) {
    const prompt = this.optionalEffectPrompt;
    if (!prompt) return;
    // Read both boxes before clearing them: the dispatch below is what sends them.
    const remembered = prompt.rememberable && this.optionalRemember;
    const sameCard = prompt.sameCardAvailable && this.optionalSameCard;
    this.optionalRemember = false;
    this.optionalSameCard = false;
    void this.dispatch(remembered
      ? rememberOptionalEffect(accept, sameCard)
      : decideOptionalEffect(accept));
  }

  /** CR 701.20e: cards looked at, of which the player keeps some. */
  get digPrompt() {
    return readDigPrompt(this.snapshot);
  }
  dug = $state<ObjectId[]>([]);
  get digReady() {
    const prompt = this.digPrompt;
    return prompt ? isDigReady(prompt, this.dug) : false;
  }
  toggleDig(id: ObjectId) {
    const prompt = this.digPrompt;
    if (!prompt) return;
    const next = togglePick(prompt.selectable, this.dug, id, prompt.count);
    if (next !== this.dug) this.dug = next;
  }
  confirmDig() {
    if (!this.digPrompt || !this.digReady) return;
    const cards = [...this.dug];
    this.dug = [];
    void this.dispatch(selectCardsAction(cards));
  }

  /** CR 701.23: a search whose searcher must pick from the offered cards. */
  get searchPrompt() {
    return readSearchPrompt(this.snapshot);
  }
  /** The cards marked for the search. Cleared whenever the position moves on. */
  searched = $state<ObjectId[]>([]);
  get searchReady() {
    const prompt = this.searchPrompt;
    return prompt ? isSearchReady(prompt, this.searched) : false;
  }
  toggleSearch(id: ObjectId) {
    const prompt = this.searchPrompt;
    if (!prompt) return;
    const next = togglePick(prompt.cards, this.searched, id, prompt.count);
    if (next !== this.searched) this.searched = next;
  }
  confirmSearch() {
    if (!this.searchPrompt || !this.searchReady) return;
    const cards = [...this.searched];
    this.searched = [];
    void this.dispatch(selectCardsAction(cards));
  }

  /** CR 700.2: the modal spell or ability waiting for its modes. */
  get modeChoicePrompt() {
    return readModeChoice(this.snapshot);
  }
  /**
   * The modes being chosen, keyed to the prompt: two modal spells in a row (or
   * a mode prompt re-entering for the same card) start from an empty choice,
   * never from the previous spell's answer.
   */
  private modeEntry = $state<{ key: string; selected: number[] } | null>(null);
  private get modeKey() {
    const prompt = this.modeChoicePrompt;
    if (!prompt) return '';
    const revision = this.snapshot?.revision ?? 0;
    return `${revision}:${prompt.kind}:${prompt.objectId ?? ''}:${prompt.descriptions.length}`;
  }
  get modes() {
    if (!this.modeChoicePrompt) return [];
    return this.modeEntry?.key === this.modeKey ? this.modeEntry.selected : [];
  }
  get modesReady() {
    const prompt = this.modeChoicePrompt;
    return prompt ? modeConfirmable(prompt, this.modes) : false;
  }
  toggleMode(index: number) {
    const prompt = this.modeChoicePrompt;
    if (!prompt) return;
    // A one-of-one modal answers with the click itself, exactly like Phase's
    // single candidate; the row never waits for a confirmation.
    if (modeSingleChoice(prompt)) {
      void this.dispatch(modeSelectAction([index]));
      return;
    }
    const next = modeToggle(prompt, this.modes, index);
    if (next !== this.modes) this.modeEntry = { key: this.modeKey, selected: next };
  }
  clearModes() {
    if (this.modeChoicePrompt) this.modeEntry = { key: this.modeKey, selected: [] };
  }
  confirmModes() {
    const prompt = this.modeChoicePrompt;
    if (!prompt || !this.modesReady) return;
    const indices = [...this.modes];
    this.modeEntry = null;
    void this.dispatch(modeSelectAction(indices));
  }

  /** CR 603.3b: the player whose simultaneous triggers need an order. */
  get triggerOrderPrompt() {
    return readTriggerOrder(this.snapshot);
  }
  /**
   * The permutation being built, keyed to the prompt it belongs to: successive
   * CR 603.3b groups can have the same size, so a new prompt must start from
   * the engine's own order instead of inheriting the previous arrangement.
   */
  private orderEntry = $state<{ key: string; order: number[] } | null>(null);
  private get orderKey() {
    const prompt = this.triggerOrderPrompt;
    if (!prompt) return '';
    const revision = this.snapshot?.revision ?? 0;
    const ids = prompt.triggers.map((trigger) => trigger.sourceId).join(',');
    return `${revision}:${ids}`;
  }
  get triggerOrder() {
    const prompt = this.triggerOrderPrompt;
    if (!prompt) return [];
    return this.orderEntry?.key === this.orderKey ? this.orderEntry.order : defaultOrder(prompt.triggers.length);
  }
  moveTrigger(from: number, to: number) {
    const prompt = this.triggerOrderPrompt;
    if (!prompt) return;
    const next = moveInOrder(this.triggerOrder, from, to);
    if (next !== this.triggerOrder) this.orderEntry = { key: this.orderKey, order: next };
  }
  confirmTriggerOrder() {
    const prompt = this.triggerOrderPrompt;
    if (!prompt) return;
    void this.dispatch(orderTriggersAction(this.triggerOrder));
  }

  /** CR 107.3a: the value of X the caster is announcing, as Phase published it. */
  get chooseXPrompt() {
    return readXPrompt(this.snapshot);
  }
  /**
   * The typed entry, keyed to the prompt it belongs to. A successor prompt —
   * another spell, a narrower window — starts from the engine's minimum again
   * instead of inheriting a value chosen for someone else's X.
   */
  private xEntry = $state<{ key: string; raw: string } | null>(null);
  private get xKey() {
    const prompt = this.chooseXPrompt;
    if (!prompt) return '';
    const revision = this.snapshot?.revision ?? 0;
    return `${revision}:${prompt.objectId ?? ''}:${prompt.min}:${prompt.max}`;
  }
  get xRaw() {
    const prompt = this.chooseXPrompt;
    if (!prompt) return '0';
    return this.xEntry?.key === this.xKey ? this.xEntry.raw : String(defaultX(prompt));
  }
  setXRaw(raw: string) {
    const prompt = this.chooseXPrompt;
    if (prompt) this.xEntry = { key: this.xKey, raw };
  }
  /**
   * Steppers RECOVER an out-of-range entry towards the window; they never
   * clamp a submission. They step from the digits the player typed, so a
   * refused 99 does not throw away readable input.
   */
  stepX(delta: number) {
    const prompt = this.chooseXPrompt;
    if (!prompt) return;
    const digits = /^\d+$/.test(this.xRaw) ? Number(this.xRaw) : defaultX(prompt);
    this.setXRaw(String(Math.min(Math.max(digits + delta, prompt.min), prompt.max)));
  }
  /** The announced value, or `null` while the entry is not one Phase would take. */
  get xValue() {
    const prompt = this.chooseXPrompt;
    return prompt ? parseX(this.xRaw, prompt.min, prompt.max) : null;
  }
  confirmX() {
    const value = this.xValue;
    if (value === null) return;
    void this.dispatch(chooseXAction(value));
  }
  cancelCast() {
    void this.dispatch(cancelCastAction());
  }

  /**
   * CR 107.1c + CR 118.1: an amount the engine asks for, inside a window the
   * engine owns. The box starts at the engine's minimum and is reset per prompt
   * (`payAmountKey`), because the engine mints consecutive prompts that share a
   * `source_id` and differ only in `player`.
   */
  get payAmountPrompt() {
    return readPayAmountPrompt(this.snapshot);
  }
  private payEntry = $state<{ key: string; raw: string } | null>(null);
  private get payKey() {
    const prompt = this.payAmountPrompt;
    if (!prompt) return '';
    return `${this.snapshot?.revision ?? 0}:${payAmountKey(prompt)}`;
  }
  get payRaw() {
    const prompt = this.payAmountPrompt;
    if (!prompt) return '0';
    return this.payEntry?.key === this.payKey ? this.payEntry.raw : String(prompt.min);
  }
  setPayRaw(raw: string) {
    if (this.payAmountPrompt) this.payEntry = { key: this.payKey, raw };
  }
  /** Steppers recover an out-of-range entry; the submission is never clamped. */
  stepPay(delta: number) {
    const prompt = this.payAmountPrompt;
    if (!prompt) return;
    const digits = /^\d+$/.test(this.payRaw) ? Number(this.payRaw) : prompt.min;
    this.setPayRaw(String(Math.min(Math.max(digits + delta, prompt.min), prompt.max)));
  }
  /** The amount Phase would accept, or `null` while the entry is not one. */
  get payValue() {
    const prompt = this.payAmountPrompt;
    return prompt ? parseAmount(this.payRaw, prompt.min, prompt.max) : null;
  }
  confirmPay() {
    const value = this.payValue;
    if (value === null) return;
    void this.dispatch(submitPayAmount(value));
  }

  private async apply(reply: EngineReply) {
    if (!isSnapshot(reply)) {
      this.error = reply.code === 'stale_action'
        ? 'La partida cambió mientras elegías. La vista se actualizó; vuelve a seleccionar.'
        : reply.code === 'invalid_action' || reply.rejected
          ? 'Phase no acepta esa elección todavía. Revisa objetivos, fuentes de maná o criaturas seleccionadas y vuelve a confirmar.'
          : reply.error;
      return;
    }
    const start = performance.now();
    if (this.snapshot && this.snapshot.viewer !== reply.viewer) { this.selected = null; this.inspect = null; }
    if (this.snapshot?.revision !== reply.revision) {
      this.attacks = {}; this.blocks = {}; this.choosing = []; this.searched = []; this.dug = [];
      this.optionalRemember = false; this.optionalSameCard = false; this.payEntry = null; this.revealPick = null; this.pairPick = null;
      this.scryKeep = [];
      this.tapPick = [];
      this.multiPick = [];
      this.splitAmount = {};
      this.movePick = {};
      this.removePick = {};
      this.retargetPick = {};
      this.choosePick = [];
      this.proliferatePick = [];
      this.timeTravelPick = [];
      this.categoryPick = {};
      this.copyChosenPick = [];
      this.keepPowerPick = [];
      this.keepExactPick = [];
      this.history = [...summarizeEvents(reply.events ?? [], reply.state.objects, reply.revision, () => ++this.historyId), ...this.history].slice(0, 40);
      for (const raw of reply.events ?? []) {
        const e = raw as { type?: string; data?: { player_id?: number; amount?: number } };
        if (e.type === 'LifeChanged' && e.data?.player_id !== undefined) this.lifeChanges[e.data.player_id] = { amount: e.data.amount ?? 0, revision: reply.revision };
      }
    }
    this.snapshot = reply;
    this.lastMetrics = { ...reply.metrics };
    if (this.selected !== null && !reply.state.objects[String(this.selected)]) this.selected = null;
    // Never hold the interaction lock on presentation frames: a throttled or
    // background tab would leave every control disabled forever.
    this.busy = false;
    await tick();
    const commit = performance.now();
    this.lastMetrics = { ...this.lastMetrics, svelte_commit_ms: commit - start };
    // Two frames: the DOM commit happened, then the browser reached the next
    // presentation opportunity. This is a presentation-latency proxy, not a
    // measurement of the GPU's internal paint duration.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (this.snapshot?.revision !== reply.revision) return;
      this.lastMetrics = { ...this.lastMetrics, presentation_ms: performance.now() - start };
    }));
    this.maybeAutoPass();
  }
}
export const session = new GameSession();

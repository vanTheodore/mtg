import { tick } from 'svelte';
import { EngineClient, isSnapshot } from '#lib/engine/client.ts';
import { ENGINE_PROTOCOL_VERSION, type AttackTarget, type EngineReply, type EngineSnapshot, type GameAction, type ObjectId } from '#lib/engine/types.ts';
import {
  attackDeclaration, attackTargets, blockDeclaration, blockTargets, discardSelection,
  discardPrompt as readDiscardPrompt, manaActions, nextBlockAssignment, objectTarget,
  playerTarget, secondActivation, targetAction
} from './interaction.ts';
import { summarizeEvents, type HistoryEntry } from './events.ts';

export type Theme = 'light' | 'dark' | 'system';

class GameSession {
  snapshot = $state.raw<EngineSnapshot | null>(null);
  status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  /** Human label of the deck/format in play, set by the start screen. */
  modeLabel = $state<string>('');
  busy = $state(false);
  error = $state<string | null>(null);
  selected = $state<number | null>(null);
  inspect = $state<number | null>(null);
  revealedViewer = $state<number | null>(null);
  revealedTurn = $state<number | null>(null);
  handoffMode = $state<'turn' | 'every'>('turn');
  theme = $state<Theme>('system');
  cardScale = $state(1);
  density = $state<'comfortable' | 'compact'>('comfortable');
  lastMetrics = $state<EngineSnapshot['metrics'] | null>(null);
  attacks = $state<Record<string, AttackTarget>>({});
  blocks = $state<Record<string, ObjectId>>({});
  history = $state<HistoryEntry[]>([]);
  lifeChanges = $state<Record<string, { amount: number; revision: number }>>({});
  autoPass = $state(true);
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
      const scale = Number(localStorage.getItem('mesa:cardScale'));
      if (scale >= 0.7 && scale <= 1.6) this.cardScale = scale;
      const density = localStorage.getItem('mesa:density');
      if (density === 'compact' || density === 'comfortable') this.density = density;
      if (localStorage.getItem('mesa:autoPass') === 'off') this.autoPass = false;
      if (localStorage.getItem('mesa:handoffMode') === 'every') this.handoffMode = 'every';
    }
  }
  setTheme(theme: Theme) {
    this.theme = theme; localStorage.setItem('mesa:theme', theme);
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }
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
  /** Phase's viewer-scoped recommendation; the UI never decides that by itself. */
  get autoPassPending() {
    return this.autoPass && !!this.snapshot && !this.snapshot.outcome && this.snapshot.state.waiting_for.type === 'Priority' && this.snapshot.auto_pass_recommended === true;
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
    this.attacks = {}; this.blocks = {}; this.history = []; this.lifeChanges = {}; this.lastMetrics = null;
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
    this.choosing = [];
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
  confirmDiscard() {
    const prompt = this.discardPrompt;
    if (!prompt || this.choosing.length !== prompt.count) return;
    const cards = [...this.choosing];
    this.choosing = [];
    void this.dispatch(discardSelection(cards));
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
      this.attacks = {}; this.blocks = {}; this.choosing = [];
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

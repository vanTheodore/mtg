import { EngineClient, isSnapshot } from '#lib/engine/client.ts';
import { ENGINE_PROTOCOL_VERSION, type EngineReply, type EngineSnapshot, type GameAction } from '#lib/engine/types.ts';

export type Theme = 'light' | 'dark' | 'system';

class GameSession {
  snapshot = $state.raw<EngineSnapshot | null>(null);
  status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  busy = $state(false);
  error = $state<string | null>(null);
  selected = $state<number | null>(null);
  inspect = $state<number | null>(null);
  revealedViewer = $state<number | null>(null);
  theme = $state<Theme>('system');
  cardScale = $state(1);
  density = $state<'comfortable' | 'compact'>('comfortable');
  lastMetrics = $state<EngineSnapshot['metrics'] | null>(null);
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
    }
  }

  setTheme(theme: Theme) {
    this.theme = theme;
    localStorage.setItem('mesa:theme', theme);
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  }

  setCardScale(scale: number) {
    this.cardScale = scale;
    localStorage.setItem('mesa:cardScale', String(scale));
  }

  setDensity(density: 'comfortable' | 'compact') {
    this.density = density;
    localStorage.setItem('mesa:density', density);
  }

  async start(catalog: unknown, decks: unknown, seed = 42) {
    this.status = 'loading';
    this.error = null;
    this.snapshot = null;
    this.revealedViewer = null;
    try {
      const reply = await this.client.init({ protocol_version: ENGINE_PROTOCOL_VERSION, catalog, decks, seed, first_player: 0 });
      this.apply(reply);
      if (reply.ok) {
        this.revealedViewer = reply.viewer;
        this.status = 'ready';
      } else this.status = 'error';
    } catch (e) {
      this.status = 'error';
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  dispatch(action: GameAction): Promise<void> {
    const run = async () => {
      if (!this.snapshot || this.busy || this.snapshot.outcome) return;
      this.busy = true;
      this.error = null;
      try {
        const reply = await this.client.action(this.snapshot.viewer, action, this.snapshot.revision);
        this.apply(reply);
        if (!reply.ok && reply.code === 'stale_action') this.apply(await this.client.view(this.snapshot.viewer));
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e);
      } finally {
        this.busy = false;
      }
    };
    this.queue = this.queue.then(run, run);
    return this.queue as Promise<void>;
  }

  confirmHandoff() {
    if (this.snapshot) this.revealedViewer = this.snapshot.viewer;
  }

  private apply(reply: EngineReply) {
    if (isSnapshot(reply)) {
      if (this.snapshot && this.snapshot.viewer !== reply.viewer) {
        this.selected = null;
        this.inspect = null;
      }
      this.snapshot = reply;
      this.lastMetrics = reply.metrics;
      if (this.selected !== null && !reply.state.objects[String(this.selected)]) this.selected = null;
    } else {
      this.error = reply.code === 'stale_action'
        ? 'La partida cambió mientras elegías. La vista se actualizó; vuelve a seleccionar.'
        : reply.error;
    }
  }
}

export const session = new GameSession();

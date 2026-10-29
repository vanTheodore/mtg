/**
 * Reactive holder for the optional Spanish impressions layer.
 *
 * Kept separate from `impressions.ts` so that module stays pure and unit-testable
 * while components can read a rune. Loading is idempotent and failure is silent
 * by design: the layer is optional and English always remains the fallback.
 */
import { createLookup, loadImpressions, type ImpressionLookup } from './impressions.ts';

const EMPTY: ImpressionLookup = createLookup(null);

class ImpressionsStore {
  lookup = $state<ImpressionLookup>(EMPTY);
  status = $state<'idle' | 'loading' | 'ready' | 'unavailable'>('idle');
  private pending: Promise<void> | null = null;

  load(fetcher: (url: string) => Promise<{ ok: boolean; status?: number; json: () => Promise<unknown> }>): Promise<void> {
    if (this.pending) return this.pending;
    this.status = 'loading';
    this.pending = loadImpressions(fetcher).then((lookup) => {
      this.lookup = lookup;
      this.status = lookup.size > 0 ? 'ready' : 'unavailable';
    }).catch(() => {
      this.status = 'unavailable';
    });
    return this.pending;
  }

  reset() {
    this.lookup = EMPTY;
    this.status = 'idle';
    this.pending = null;
  }
}

export const impressions = new ImpressionsStore();

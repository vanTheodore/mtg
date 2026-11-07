<script lang="ts">
  /**
   * The one-line coach Phase shows over the action row the first time the table
   * starts skipping windows on its own.
   *
   * Ported from the bottom-right tip in Phase's table (`chrome/` +
   * `mobile/` copy in `client/src/i18n` (one file per locale), key `coach.autoPass`). It
   * only explains a behaviour the engine already has: `session.autoPass`.
   * Dismissing it writes one preference, so it never comes back on its own.
   */
  import { onMount } from 'svelte';
  import { session } from '#lib/game/session.svelte.ts';

  const KEY = 'mesa:coach:autoPass';

  let dismissed = $state(true);
  let ready = $state(false);

  onMount(() => {
    try {
      dismissed = localStorage.getItem(KEY) === 'off';
    } catch {
      dismissed = false;
    }
    ready = true;
  });

  const visible = $derived(ready && !dismissed && session.autoPass && !!session.snapshot && !session.snapshot.outcome);

  function dismiss() {
    dismissed = true;
    try {
      localStorage.setItem(KEY, 'off');
    } catch {
      /* Private mode: the tip stays dismissed for this page only. */
    }
  }
</script>

{#if visible}
  <aside class="coach" aria-label="Consejo de flujo">
    <p>
      Los saltos de fase son automáticos. Usa <strong>Control</strong> cuando quieras ventanas de prioridad al estilo del
      papel.
    </p>
    <div class="coach-actions">
      <button type="button" class="ghost" onclick={dismiss}>Descartar</button>
      <a class="accept" href="/aprender">Conocer el flujo</a>
    </div>
  </aside>
{/if}

<style>
  .coach {
    justify-self: end;
    max-width: min(34rem, 100%);
    display: grid;
    gap: .5rem;
    padding: .6rem .75rem;
    border-radius: 12px;
    border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--line));
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    box-shadow: var(--shadow);
    font-size: .8rem;
    color: var(--ink);
  }
  .coach p { margin: 0; line-height: 1.4; }
  .coach-actions { display: flex; justify-content: flex-end; gap: .5rem; flex-wrap: wrap; }
  .coach button,
  .coach a {
    display: inline-grid;
    place-items: center;
    min-height: 32px;
    padding: .25rem .75rem;
    border-radius: 999px;
    font: inherit;
    font-weight: 650;
    text-decoration: none;
    cursor: pointer;
  }
  .ghost { border: 1px solid transparent; background: none; color: var(--ink-muted); }
  .ghost:hover { color: var(--ink); border-color: var(--line); }
  .accept {
    border: 1px solid color-mix(in srgb, var(--accent) 60%, var(--line));
    background: var(--accent);
    color: var(--accent-ink);
  }
  .coach button:focus-visible,
  .coach a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  @media (max-width: 640px) {
    .coach { justify-self: stretch; max-width: none; }
  }
</style>

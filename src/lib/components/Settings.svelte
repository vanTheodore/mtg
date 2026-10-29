<script lang="ts">
  import { session } from '#lib/game/session.svelte.ts';
  let open = $state(false);
</script>

<div class="settings">
  <button type="button" aria-expanded={open} aria-controls="settings-panel" onclick={() => open = !open}>Ajustes</button>
  {#if open}
    <div id="settings-panel" class="panel" role="group" aria-label="Ajustes de apariencia">
      <label>
        Tema
        <select value={session.theme} onchange={(e) => session.setTheme((e.currentTarget as HTMLSelectElement).value as 'light' | 'dark' | 'system')}>
          <option value="system">Sistema</option>
          <option value="light">Claro</option>
          <option value="dark">Oscuro</option>
        </select>
      </label>
      <label>
        Tamaño de carta
        <input type="range" min="0.7" max="1.6" step="0.1" value={session.cardScale} oninput={(e) => session.setCardScale(Number((e.currentTarget as HTMLInputElement).value))} />
      </label>
      <label>
        Densidad
        <select value={session.density} onchange={(e) => session.setDensity((e.currentTarget as HTMLSelectElement).value as 'comfortable' | 'compact')}>
          <option value="comfortable">Cómoda</option>
          <option value="compact">Compacta</option>
        </select>
      </label>
      <div class="locale" role="note">
        <strong>Idioma</strong>
        <span>Español (Latinoamérica). Los nombres y textos de las cartas llegan en inglés desde el motor Phase.</span>
      </div>
      <button type="button" onclick={() => open = false}>Cerrar</button>
    </div>
  {/if}
</div>

<style>
  .settings { position: relative; }
  .settings > button { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 9px; padding: .4rem .7rem; }
  .panel { position: absolute; right: 0; top: calc(100% + .4rem); z-index: 20; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: .8rem; display: grid; gap: .6rem; min-width: 220px; box-shadow: var(--shadow); }
  label { display: grid; gap: .25rem; font-size: .82rem; color: var(--ink-muted); }
  select, input { accent-color: var(--accent); }
  .locale { display: grid; gap: .2rem; font-size: .78rem; color: var(--ink-muted); border-top: 1px solid var(--line); padding-top: .55rem; }
  .locale strong { color: var(--ink); }
  .panel button { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 8px; padding: .35rem; }
</style>

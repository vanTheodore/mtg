<script lang="ts">
  /**
   * UX-PRIORITY · controls for Phase-owned priority modes and pass sessions.
   *
   * Mesa stores only presentation preferences by local seat. The engine remains
   * the authority for recommendations, legal passes, stack responses and turn
   * boundaries; the buttons below either synchronize a pinned Phase preference
   * or send an explicit Phase action.
   */
  import { session } from '#lib/game/session.svelte.ts';
  import type { GameAction } from '#lib/engine/types.ts';
  import type { ProjectedAction } from '#lib/game/decisionProjection.ts';
  import type { PriorityMode, TurnBoundary } from '#lib/game/priority.ts';

  let {
    modes = [], disabled = false, onplay
  }: {
    modes?: ProjectedAction[];
    disabled?: boolean;
    onplay: (action: GameAction) => void;
  } = $props();

  const MODE_LABELS: Record<string, string> = {
    Standard: 'Estándar',
    SkipLowUseWindows: 'Saltar ventanas de poco uso',
    FullControl: 'Control total'
  };
  const MODE_DESCRIPTIONS: Record<string, string> = {
    Standard: 'Phase decide qué ventanas recomienda pasar. Mesa nunca calcula esa recomendación.',
    SkipLowUseWindows: 'Phase puede omitir ventanas de poco uso; el motor decide cuáles.',
    FullControl: 'Conserva todas las ventanas de prioridad de este asiento, también con la pila ocupada. Sólo dura esta partida.'
  };
  const MODE_OPTIONS: readonly (PriorityMode | 'FullControl')[] = [
    'Standard', 'SkipLowUseWindows', 'FullControl'
  ];

  const stops = $derived(Object.keys(session.stops ?? {}).length);
  const snapshot = $derived(session.snapshot);
  const waitingForPriority = $derived(snapshot?.state.waiting_for.type === 'Priority');
  const canRequestPass = $derived(!!snapshot?.legal.actions.some((action) => action.type === 'PassPriority'));
  const canResolveStack = $derived(waitingForPriority && (snapshot?.state.stack.length ?? 0) > 0);
  const publishedModes = $derived(new Set(modes.map((entry) => String(entry.action.data?.mode ?? ''))));
  const unrecognizedModes = $derived(modes.filter((entry) => !MODE_OPTIONS.includes(String(entry.action.data?.mode ?? '') as PriorityMode | 'FullControl')));

  function openStops() {
    // On a phone the touch-sized Phase sheet replaces the hidden desktop row.
    // Use the chip's own dialog so focus never lands on a display:none control.
    const chip = document.querySelector<HTMLButtonElement>('.phase-chip .chip');
    if (chip && getComputedStyle(chip).display !== 'none') {
      chip.click();
      return;
    }
    const details = document.querySelector<HTMLDetailsElement>('details[data-advanced-controls]');
    if (!details) return;
    details.open = true;
    details.querySelector<HTMLButtonElement>('button[data-step]')?.focus();
  }

  function selectMode(mode: PriorityMode | 'FullControl') {
    if (mode === 'FullControl') session.setFullControl(!session.fullControl);
    else session.setPriorityMode(mode);
  }

  function passUntil(until: TurnBoundary) {
    session.passUntilBoundary(until);
  }

  function modeLabel(action: GameAction): string {
    const mode = action.data?.mode;
    return typeof mode === 'string' ? (MODE_LABELS[mode] ?? mode) : 'Modo de prioridad';
  }
</script>

<div
  class="advanced"
  data-advanced-surface
  data-priority-mode={session.effectivePriorityMode}
  data-engine-priority-mode={session.enginePriorityMode}
  data-priority-sync={session.prioritySyncFailed ? 'failed' : session.prioritySyncPending ? 'pending' : 'synced'}
  data-engine-stop-count={session.enginePhaseStops.length}
>
  <p class="state" data-auto-pass={session.autoPass} data-stops={stops} data-paused={session.autoPassPaused}>
    Modo: {MODE_LABELS[session.effectivePriorityMode]} · Paradas configuradas: {stops}
    {#if snapshot?.auto_pass_recommended}· Phase recomienda pasar esta ventana{/if}
  </p>
  <p class="explanation">
    La recomendación y la legalidad pertenecen a Phase. Una parada sólo retiene; no crea ventanas ni fuerza pases.
  </p>

  <fieldset class="modes" aria-label="Modo de prioridad">
    <legend>Modo de prioridad · este asiento</legend>
    {#each MODE_OPTIONS as mode (mode)}
      <button
        type="button"
        class="mode"
        data-priority-mode={mode}
        data-engine-published={publishedModes.has(mode)}
        aria-pressed={session.effectivePriorityMode === mode}
        aria-label={`${MODE_LABELS[mode]}. ${MODE_DESCRIPTIONS[mode]}`}
        disabled={disabled}
        onclick={() => selectMode(mode)}
      >
        <span>{MODE_LABELS[mode]}</span>
        <small>{MODE_DESCRIPTIONS[mode]}</small>
      </button>
    {/each}
  </fieldset>

  {#if unrecognizedModes.length}
    <div class="modes" aria-label="Otros modos de prioridad de Phase">
      {#each unrecognizedModes as mode (mode.key)}
        <button type="button" class="mode" disabled={disabled} onclick={() => onplay(mode.action)}>
          <span>{modeLabel(mode.action)}</span>
          {#if mode.hint}<small>{mode.hint}</small>{/if}
        </button>
      {/each}
    </div>
  {/if}

  <div class="row">
    <button type="button" class="link" data-open-phase-stops onclick={openStops}>Abrir paradas de fase</button>
  </div>

  {#if waitingForPriority && canRequestPass}
    <section class="session" aria-label="Automatización explícita de Phase">
      <h3>Pasar hasta una frontera</h3>
      <p>Estas opciones pasan ahora y siguen pasando tus ventanas hasta la frontera elegida. Phase aún puede detenerse ante respuestas o paradas aplicables.</p>
      <button type="button" data-auto-pass-until="EndOfCurrentTurn" disabled={disabled} onclick={() => passUntil('EndOfCurrentTurn')}>
        Pasar hasta el inicio del siguiente turno
      </button>
      <button type="button" data-auto-pass-until="MyNextTurnStart" disabled={disabled} onclick={() => passUntil('MyNextTurnStart')}>
        Pasar hasta que vuelva a empezar mi turno
      </button>
    </section>
  {/if}

  {#if canResolveStack}
    <section class="session" aria-label="Resolución de pila">
      <h3>Resolver la pila</h3>
      <p>Phase gestiona cada pase, respuesta y consentimiento. Esta opción sólo solicita pasar tus propias ventanas; no autoriza a otros asientos.</p>
      <button type="button" data-resolve-all-own disabled={disabled} onclick={() => session.beginResolveAllOwn()}>
        Resolver mis ventanas hasta vaciar la pila
      </button>
    </section>
  {/if}

  {#if session.prioritySyncFailed}
    <p class="warning" role="status">Phase no confirmó la sincronización de estas preferencias; no se reintentará en silencio.</p>
    <button type="button" class="retry" disabled={disabled} onclick={() => session.retryPrioritySync()}>
      Reintentar sincronización
    </button>
  {:else if session.autoPassPaused}
    <p class="warning" role="status">El pase automático está pausado tras un cambio o rechazo. No se volverá a intentar solo.</p>
    <button type="button" class="retry" disabled={disabled} onclick={() => session.resumeAutoPass()}>
      Reanudar pase recomendado
    </button>
  {/if}
</div>

<style>
  .advanced { display: grid; gap: .45rem; font-size: .76rem; }
  .state, .explanation, .session p, .warning { margin: 0; color: var(--ink-muted); line-height: 1.4; }
  .explanation { font-size: .72rem; }
  .row { display: flex; }
  .link, .retry {
    background: none; border: 1px solid transparent; color: var(--focus); font: inherit;
    padding: .25rem .35rem; text-align: left; cursor: pointer; min-height: 44px; border-radius: 8px;
  }
  .link { padding-inline: 0; }
  .modes { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: .3rem; }
  .modes legend, .session h3 { margin: 0 0 .1rem; padding: 0; font-size: .72rem; text-transform: uppercase; letter-spacing: .07em; color: var(--ink-muted); }
  .mode, .session button {
    display: grid; gap: .12rem; width: 100%; min-height: 44px; padding: .4rem .55rem; text-align: left;
    font: inherit; font-size: .74rem; border: 1px solid var(--line); border-radius: 8px;
    background: var(--surface); color: var(--ink); cursor: pointer;
  }
  .mode[aria-pressed='true'] { border-color: var(--focus); background: color-mix(in srgb, var(--focus) 12%, var(--surface)); }
  .mode small { color: var(--ink-muted); font-size: .68rem; line-height: 1.3; }
  .session { display: grid; gap: .3rem; padding-top: .35rem; border-top: 1px solid var(--line); }
  .session button { min-height: 44px; }
  .warning { color: var(--danger); }
  .retry { border-color: var(--line); background: var(--surface); }
  .mode:focus-visible, .session button:focus-visible, .link:focus-visible, .retry:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  button:disabled { opacity: .55; cursor: wait; }
</style>

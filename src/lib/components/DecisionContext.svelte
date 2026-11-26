<script lang="ts">
  /**
   * UX-DECISION · información contextual de la decisión, en dos líneas.
   *
   * Aquí no hay botones: este componente responde a «de quién es el turno»,
   * «quién tiene prioridad», «qué fase está en curso» y «qué ocurrirá si
   * continúo». Todo sale de `DecisionProjection.context`, que a su vez sólo lee
   * los DTO de Phase. La guía larga y los datos adicionales se exponen como
   * `title`/`aria-label`, no como filas nuevas: el panel debe seguir cabiendo
   * entero en el rail de escritorio y en la hoja fija del teléfono.
   */
  import type { DecisionProjection } from '#lib/game/decisionProjection.ts';

  let { projection, guide }: { projection: DecisionProjection; guide: string } = $props();
  const context = $derived(projection.context);
  const extra = $derived(context.needed.slice(1).join(' · '));
</script>

<header
  class="decision-context"
  data-decision-context
  data-intent={context.intent}
  data-waiting={context.waitingKind}
  data-viewer-priority={context.viewerHasPriority}
  data-active-player={context.activePlayer}
  data-priority-player={context.priorityPlayer}
  title={extra ? `${guide} · ${extra}` : guide}
>
  <div class="heading">
    <h2>Tu siguiente decisión</h2>
    <span class="intent" aria-label={`Intención: ${context.intent}`}>{context.intent}</span>
  </div>
  <p class="phase" aria-label="Guía de decisión">
    Turno {context.turn} · {context.phaseLabel} · Jugador {context.activePlayer + 1}
    <span class="priority" data-priority-owner={context.priorityPlayer}>
      · Prioridad: Jugador {context.priorityPlayer + 1}{context.viewerHasPriority ? ' (tú)' : ''}
    </span>
  </p>
  <p class="consequence" data-decision-consequence>{context.consequence}</p>
  {#if context.targetProgress}
    <p class="progress" data-decision-progress={`${context.targetProgress.current}/${context.targetProgress.total}`}>
      Objetivo {context.targetProgress.current} de {context.targetProgress.total}{context.targetProgress.label ? ` · ${context.targetProgress.label}` : ''}
    </p>
  {/if}
  {#if projection.integrity.ok === false}
    <span class="warning" role="status">Hay opciones legales sin superficie; revisa la proyección.</span>
  {/if}
</header>

<style>
  .decision-context { display: grid; gap: .1rem; min-width: 0; }
  .heading { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; }
  h2 { margin: 0; font-size: .9rem; }
  .intent {
    font-size: .62rem; font-weight: 750; text-transform: uppercase; letter-spacing: .08em;
    color: var(--accent-ink); background: var(--accent); border-radius: 999px; padding: .1rem .45rem;
    white-space: nowrap;
  }
  .phase { margin: 0; font-size: .72rem; color: var(--ink-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .priority { font-weight: 650; color: var(--ink); }
  .consequence {
    margin: 0; font-size: .7rem; line-height: 1.25; color: var(--ink);
    border-left: 2px solid var(--accent); padding-left: .4rem;
    display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .progress { margin: 0; font-size: .7rem; font-weight: 650; }
  .warning { font-size: .7rem; color: #b45309; }
</style>

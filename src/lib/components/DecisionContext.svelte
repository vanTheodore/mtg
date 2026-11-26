<script lang="ts">
  /**
   * UX-DECISION · información contextual de la decisión.
   *
   * Aquí no hay botones: este componente responde a «de quién es el turno»,
   * «quién tiene prioridad», «qué fase está en curso», «qué información necesito»
   * y «qué ocurrirá si continúo». Todo sale de `DecisionProjection.context`, que
   * a su vez sólo lee los DTO de Phase. La jerarquía visual está inspirada en la
   * divulgación progresiva de Arena, no en su pintura.
   */
  import type { DecisionProjection } from '#lib/game/decisionProjection.ts';

  let { projection, guide }: { projection: DecisionProjection; guide: string } = $props();
  const context = $derived(projection.context);
  const needed = $derived(context.needed.slice(0, 3));
  const hiddenNeeded = $derived(Math.max(0, context.needed.length - 3));
</script>

<header
  class="decision-context"
  data-decision-context
  data-intent={context.intent}
  data-waiting={context.waitingKind}
  data-viewer-priority={context.viewerHasPriority}
>
  <div class="heading">
    <h2>Tu siguiente decisión</h2>
    <span class="intent" aria-label={`Intención: ${context.intent}`}>{context.intent}</span>
  </div>
  <p class="phase">
    Turno {context.turn} · {context.phaseLabel} · Jugador {context.activePlayer + 1}
    <span class="priority" data-priority-owner={context.priorityPlayer}>
      · Prioridad: Jugador {context.priorityPlayer + 1}{context.viewerHasPriority ? ' (tú)' : ''}
    </span>
  </p>
  <p class="waiting" aria-label="Guía de decisión" aria-live="polite">{guide}</p>
  <ul class="needed" aria-label="Información necesaria">
    {#each needed as line (line)}<li>{line}</li>{/each}
    {#if hiddenNeeded}<li class="muted">+{hiddenNeeded} dato(s) del motor</li>{/if}
  </ul>
  {#if context.targetProgress}
    <p class="progress" data-decision-progress={`${context.targetProgress.current}/${context.targetProgress.total}`}>
      Objetivo {context.targetProgress.current} de {context.targetProgress.total}{context.targetProgress.label ? ` · ${context.targetProgress.label}` : ''}
    </p>
  {/if}
  <p class="consequence" data-decision-consequence>{context.consequence}</p>
  {#if projection.integrity.ok === false}
    <p class="warning" role="status">Hay opciones legales sin superficie; revisa la proyección.</p>
  {/if}
</header>

<style>
  .decision-context { display: grid; gap: .25rem; min-width: 0; }
  .heading { display: flex; align-items: baseline; justify-content: space-between; gap: .5rem; }
  h2 { margin: 0; font-size: .95rem; }
  .intent {
    font-size: .66rem; font-weight: 750; text-transform: uppercase; letter-spacing: .08em;
    color: var(--accent-ink); background: var(--accent); border-radius: 999px; padding: .15rem .5rem;
    white-space: nowrap;
  }
  .phase { margin: 0; font-size: .8rem; color: var(--ink-muted); }
  .priority { font-weight: 650; color: var(--ink); }
  .waiting { margin: .1rem 0 .25rem; font-size: .88rem; font-weight: 600; }
  .needed { display: flex; flex-wrap: wrap; gap: .2rem .5rem; list-style: none; margin: 0; padding: 0; }
  .needed li { font-size: .72rem; color: var(--ink-muted); }
  .needed li + li::before { content: '·'; margin-right: .5rem; color: var(--line); }
  .progress { margin: .1rem 0 0; font-size: .76rem; font-weight: 650; }
  .consequence {
    margin: .3rem 0 0; font-size: .76rem; line-height: 1.35; color: var(--ink);
    border-left: 2px solid var(--accent); padding-left: .5rem;
  }
  .muted { opacity: .8; }
  .warning { margin: .2rem 0 0; font-size: .74rem; color: #b45309; }
</style>

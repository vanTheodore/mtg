<script lang="ts">
  import { onMount } from 'svelte';
  import Hand from './Hand.svelte';
  import Battlefield from './Battlefield.svelte';
  import PlayerPanel from './PlayerPanel.svelte';
  import ManaPool from './ManaPool.svelte';
  import ManaCost from './ManaCost.svelte';
  import Settings from './Settings.svelte';
  import { session } from '#lib/game/session.svelte.ts';
  import { tutorial } from '#lib/tutorial/controller.svelte.ts';
  import { STEPS } from '#lib/tutorial/lesson.ts';
  import { GLOSSARY } from '#lib/tutorial/glossary.ts';
  import type { CardMeta, GameObject } from '#lib/engine/types.ts';

  /** The learner always plays the first seat; the dummy plays the second. */
  const LEARNER = 0;
  const DUMMY = 1;

  let metas = $state<Record<string, CardMeta>>({});
  let showGlossary = $state(false);
  let showRecap = $state(false);

  const view = $derived(tutorial.view);
  const snapshot = $derived(session.snapshot);
  const objects = $derived(snapshot?.state.objects ?? {});
  const player = $derived(snapshot?.state.players[LEARNER]);
  const rival = $derived(snapshot?.state.players[DUMMY]);
  const handObjects = $derived((player?.hand ?? []).map((id) => objects[String(id)]).filter(Boolean) as GameObject[]);
  const battlefieldObjects = $derived((snapshot?.state.battlefield ?? []).map((id) => objects[String(id)]).filter(Boolean) as GameObject[]);
  const focusId = $derived(view.focusId);
  const focusObject = $derived(focusId !== null ? objects[String(focusId)] : undefined);
  const activePlayer = $derived(snapshot?.state.active_player);
  const attackers = $derived(snapshot?.state.combat?.attackers ?? []);
  const attackNames = $derived(
    attackers
      .map((attacker) => objects[String(attacker.object_id)]?.name)
      .filter(Boolean)
      .join(', ')
  );
  const PHASES: Record<string, string> = {
    Untap: 'Enderezar', Upkeep: 'Mantenimiento', Draw: 'Robar', PreCombatMain: 'Fase principal',
    BeginCombat: 'Inicio de combate', DeclareAttackers: 'Declarar atacantes', DeclareBlockers: 'Declarar bloqueadoras',
    CombatDamage: 'Daño de combate', EndCombat: 'Fin de combate', PostCombatMain: 'Fase principal posterior',
    End: 'Final del turno', Cleanup: 'Limpieza'
  };

  onMount(async () => {
    metas = await fetch('/data/card-meta.json')
      .then((response) => (response.ok ? response.json() : {}))
      .catch(() => ({}));
    await tutorial.start();
  });

  // The engine publishes a snapshot; the machine reads it and proposes at most
  // one legal action. Nothing here decides rules.
  $effect(() => {
    const published = session.snapshot;
    void published;
    tutorial.observe();
  });

  function metaFor(object: GameObject): CardMeta | undefined {
    return metas[object.printed_ref?.oracle_id ?? ''] ?? metas[object.name.toLowerCase()];
  }

  const isFinal = $derived(view.kind === 'final');
</script>

<svelte:head>
  <title>Mesa · Mi primera partida</title>
  <meta name="description" content="Lección jugable de Magic: The Gathering para principiantes, con el motor Phase." />
</svelte:head>

<div
  class="app"
  data-tutorial-step={view.stepIndex}
  data-actions-applied={snapshot?.actions_applied ?? 0}
  data-viewer={snapshot?.viewer ?? 0}
  data-phase={snapshot?.state.phase ?? ''}
  data-turn={snapshot?.state.turn_number ?? 0}
  data-waiting={snapshot?.state.waiting_for?.type ?? ''}
  data-active={snapshot?.state.active_player ?? ''}
>
  <header class="topbar">
    <div class="brand">
      <span class="mark" aria-hidden="true">M</span>
      <div>
        <h1>Mi primera partida</h1>
        <p>Mesa · lección guiada con el motor Phase</p>
      </div>
    </div>
    <div class="top-actions">
      <a class="link" href="/" onclick={() => tutorial.leave()}>Volver al inicio</a>
      <button type="button" class="ghost" onclick={() => tutorial.restart()}>Reiniciar lección</button>
      <Settings />
    </div>
  </header>

  {#if view.status === 'loading' || view.status === 'idle'}
    <p class="notice" role="status">Preparando el motor Phase y la partida de la lección…</p>
  {:else if view.status === 'error'}
    <p class="notice error" role="alert">{view.error ?? 'No se pudo iniciar la lección.'}</p>
  {:else if session.error}
    <p class="notice error" role="alert">{session.error}</p>
  {/if}

  <div class="layout">
    <!-- The lesson panel comes first in the DOM: on a phone the instruction is
         above the board, and a screen reader reads the lesson before the
         cards. On wide screens the grid moves it to the right column. -->
    <aside class="lesson" aria-label="Lección">
      <div class="lesson-head">
        <p class="eyebrow">Paso {Math.min(view.stepIndex + 1, view.stepCount)} de {view.stepCount}</p>
        <h2>{view.title}</h2>
        <!-- The dots are decoration: "Paso 1 de 9" is what a screen reader reads. -->
        <ol class="dots" aria-hidden="true">
          {#each STEPS as entry, index (entry.id)}
            <li class:done={index < view.stepIndex} class:current={index === view.stepIndex}></li>
          {/each}
        </ol>
      </div>

      <div class="lesson-body">
        <p class="teach" aria-live="polite">{view.teach}</p>
        <p class="goal" id="lesson-goal">{view.goal}</p>

        {#if view.kind === 'act' && !view.actionReady}
          <p class="focus-note waiting">
            <span class="focus-mark" aria-hidden="true">◎</span>
            Preparando el momento justo… en cuanto el motor pueda, la carta se resaltará.
          </p>
        {/if}

        {#if focusObject}
          <p class="focus-note">
            <span class="focus-mark" aria-hidden="true">◎</span>
            Toca <strong>{focusObject.name}</strong> {focusObject.zone === 'Hand' ? 'en tu mano' : 'en tu campo de batalla'}.
            {#if focusObject.mana_cost}
              <span class="cost-line">Coste: <ManaCost cost={focusObject.mana_cost} label={`Coste de ${focusObject.name}`} /></span>
            {/if}
          </p>
        {/if}

        {#if player}
          <p class="status-line">
            <span>Tus vidas: <strong>{player.life}</strong></span>
            <span>Maniquí: <strong>{rival?.life ?? 20}</strong> vidas</span>
            <ManaPool pool={player.mana_pool} />
          </p>
        {/if}

        {#if attackNames}
          <p class="combat-line" role="status">Atacan: {attackNames}</p>
        {/if}

        {#if !isFinal}
          <div class="actions">
            <button
              type="button"
              class="primary"
              disabled={view.busy || (view.kind === 'act' && !view.actionReady)}
              aria-describedby="lesson-goal"
              onclick={() => tutorial.act()}
            >
              {view.action}
            </button>
            <button type="button" class="ghost" onclick={() => tutorial.skip()}>Saltar este paso</button>
          </div>
        {/if}

        {#if view.message}
          <p class="message" role="status">{view.message}</p>
        {/if}

        {#if view.notes.length}
          <ul class="notes" aria-label="Notas de Mesa">
            {#each view.notes as note (note.id)}<li>{note.text}</li>{/each}
          </ul>
        {/if}
      </div>

      {#if isFinal}
        <div class="final">
          <h3>Lo que ya sabes hacer</h3>
          <ul class="summary">
            <li>Jugar una tierra y entender que produce maná al girarse.</li>
            <li>Pagar el coste de un hechizo con tu reserva de maná.</li>
            <li>Leer la fuerza y la resistencia de una criatura.</li>
            <li>Declarar un ataque y ver el daño que causa.</li>
          </ul>
          <div class="actions">
            <button type="button" class="primary" onclick={() => tutorial.restart()}>Repetir la lección</button>
            <a class="link" href="/" onclick={() => tutorial.leave()}>Volver al inicio</a>
          </div>
          <p class="next">Lo siguiente: jugar contra una persona. En una partida real el rival puede <strong>bloquear</strong> tu criatura, y tus hechizos pueden tener efectos que esta lección no muestra.</p>
        </div>
      {/if}

      <div class="lesson-tools">
        <button type="button" class="ghost" aria-expanded={showRecap} onclick={() => (showRecap = !showRecap)}>
          {showRecap ? 'Ocultar el repaso' : 'Ver el repaso'}
        </button>
        <button type="button" class="ghost" aria-expanded={showGlossary} onclick={() => (showGlossary = !showGlossary)}>
          {showGlossary ? 'Ocultar las palabras' : 'Palabras nuevas'}
        </button>
      </div>

      {#if showRecap}
        <section class="recap" aria-label="Repaso de los pasos anteriores">
          <h3>Lo que ya te expliqué</h3>
          <ol>
            {#each STEPS.slice(0, Math.max(0, view.stepIndex)) as entry (entry.id)}
              <li><strong>{entry.title}</strong><span>{entry.teach}</span></li>
            {/each}
            {#if view.stepIndex === 0}<li class="muted">Todavía no hay pasos anteriores.</li>{/if}
          </ol>
        </section>
      {/if}

      {#if showGlossary}
        <section class="glossary" aria-label="Palabras nuevas">
          <h3>Palabras nuevas</h3>
          <dl>
            {#each GLOSSARY as entry (entry.term)}
              <div class="entry" class:new={view.words.includes(entry.term)}>
                <dt>{entry.term}</dt>
                <dd>{entry.meaning}</dd>
              </div>
            {/each}
          </dl>
        </section>
      {/if}
    </aside>

    <main class="board" aria-label="Tablero de la lección">
      <p class="turn" role="status">
        {#if activePlayer === undefined}
          Esperando al motor…
        {:else if activePlayer === LEARNER}
          Tu turno · turno {view.learnerTurn} · {PHASES[snapshot?.state.phase ?? ''] ?? snapshot?.state.phase}
        {:else}
          Turno del maniquí · el rival no ataca, solo espera
        {/if}
      </p>

      {#if player && rival}
        {#if !handObjects.length}
          <p class="waiting-board">El motor está repartiendo la mano inicial. En cuanto esté lista verás tus cartas aquí.</p>
        {/if}
        <PlayerPanel player={rival} />
        <Battlefield objects={battlefieldObjects} {metas} owner={DUMMY} label="Campo de batalla · maniquí" />
        <Battlefield objects={battlefieldObjects} {metas} owner={LEARNER} label="Tu campo de batalla" focusId={focusId} onselect={(id) => tutorial.pick(id)} />
        <PlayerPanel player={player} />
        <Hand objects={handObjects} {metas} title="Tu mano" focusId={focusId} onselect={(id) => tutorial.pick(id)} />
      {:else}
        <p class="waiting-board">El motor Phase está despertando. En cuanto esté listo verás aquí las cartas de la lección.</p>
      {/if}
    </main>
  </div>
</div>

<style>
  .app { min-height: 100vh; display: flex; flex-direction: column; gap: .8rem; padding: .8rem clamp(.6rem, 2vw, 1.4rem); max-width: 1600px; margin: 0 auto; }
  .topbar { display: flex; justify-content: space-between; align-items: center; gap: .8rem; flex-wrap: wrap; }
  .brand { display: flex; align-items: center; gap: .65rem; }
  .mark { width: 2.4rem; height: 2.4rem; border-radius: 10px; background: var(--accent); color: var(--accent-ink); display: grid; place-items: center; font-weight: 800; font-size: 1.2rem; }
  h1 { margin: 0; font-size: 1.15rem; letter-spacing: .02em; }
  .brand p { margin: 0; font-size: .74rem; color: var(--ink-muted); }
  .top-actions { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
  .link { color: var(--focus); font-size: .82rem; }
  button.ghost { border: 1px solid var(--line); background: var(--surface); color: var(--ink); border-radius: 9px; padding: .4rem .7rem; font-size: .82rem; }
  .notice { padding: .7rem .9rem; border-radius: 10px; font-size: .88rem; background: var(--surface-2); border: 1px solid var(--line); margin: 0; }
  .notice.error { background: color-mix(in srgb, var(--danger) 14%, var(--surface)); border-color: var(--danger); color: var(--danger); }

  .layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: .8rem; align-items: start; }

  .lesson { background: var(--surface); border: 1px solid var(--line); border-radius: 16px; padding: .9rem; display: grid; gap: .7rem; min-width: 0; }
  .lesson-head { display: grid; gap: .3rem; }
  .eyebrow { margin: 0; font-size: .72rem; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-muted); }
  h2 { margin: 0; font-size: 1.1rem; }
  .dots { display: flex; gap: .25rem; list-style: none; margin: .1rem 0 0; padding: 0; }
  .dots li { width: .55rem; height: .55rem; border-radius: 999px; border: 1px solid var(--line); background: var(--surface-2); }
  .dots li.done { background: var(--ok); border-color: var(--ok); }
  .dots li.current { background: var(--accent); border-color: var(--accent); transform: scale(1.35); }
  .lesson-body { display: grid; gap: .55rem; }
  .teach { margin: 0; font-size: .9rem; line-height: 1.5; }
  .goal { margin: 0; font-size: .88rem; font-weight: 650; color: var(--ink); }
  .focus-note { margin: 0; font-size: .82rem; color: var(--ink); display: flex; gap: .4rem; align-items: baseline; flex-wrap: wrap; background: var(--surface-2); border: 1px solid var(--accent); border-radius: 10px; padding: .45rem .55rem; }
  .focus-mark { color: var(--accent); font-weight: 800; }
  .focus-note.waiting { border-style: dashed; color: var(--ink-muted); }
  .cost-line { display: inline-flex; gap: .3rem; align-items: center; color: var(--ink-muted); }
  .status-line { margin: 0; display: flex; gap: .8rem; flex-wrap: wrap; align-items: center; font-size: .8rem; color: var(--ink-muted); }
  .status-line strong { color: var(--ink); }
  .combat-line { margin: 0; font-size: .82rem; font-weight: 650; color: var(--accent); }
  .actions { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; }
  button.primary { background: var(--accent); color: var(--accent-ink); border: none; border-radius: 10px; padding: .6rem 1rem; font-weight: 650; min-height: 40px; }
  .message { margin: 0; font-size: .8rem; color: var(--ink); background: var(--surface-2); border-left: 3px solid var(--accent); border-radius: 6px; padding: .45rem .55rem; }
  .notes { margin: 0; padding-left: 1.1rem; font-size: .76rem; color: var(--ink-muted); display: grid; gap: .2rem; }
  .final { border-top: 1px solid var(--line); padding-top: .7rem; display: grid; gap: .5rem; }
  .final h3 { margin: 0; font-size: .95rem; }
  .summary { margin: 0; padding-left: 1.1rem; font-size: .85rem; display: grid; gap: .3rem; }
  .next { margin: 0; font-size: .8rem; color: var(--ink-muted); }
  .lesson-tools { display: flex; gap: .4rem; flex-wrap: wrap; border-top: 1px solid var(--line); padding-top: .6rem; }
  .recap, .glossary { border-top: 1px solid var(--line); padding-top: .6rem; display: grid; gap: .4rem; }
  .recap h3, .glossary h3 { margin: 0; font-size: .88rem; }
  .recap ol { margin: 0; padding-left: 1.1rem; display: grid; gap: .4rem; font-size: .8rem; }
  .recap li span { display: block; color: var(--ink-muted); }
  .glossary dl { margin: 0; display: grid; gap: .35rem; font-size: .8rem; }
  .entry { display: grid; grid-template-columns: minmax(6rem, auto) 1fr; gap: .4rem; }
  .entry dt { font-weight: 700; }
  .entry dd { margin: 0; color: var(--ink-muted); }
  .entry.new dt::after { content: " ·"; color: var(--accent); }
  .entry.new dd { color: var(--ink); }
  .muted { color: var(--ink-muted); }

  .board { display: grid; gap: .6rem; min-width: 0; }
  .turn { margin: 0; font-size: .8rem; color: var(--ink-muted); text-align: center; }
  .waiting-board { background: var(--surface); border: 1px dashed var(--line); border-radius: 14px; padding: 1.2rem; font-size: .85rem; color: var(--ink-muted); text-align: center; margin: 0; }

  @media (min-width: 960px) {
    .layout { grid-template-columns: minmax(0, 1fr) minmax(19rem, 22rem); }
    .lesson { order: 2; position: sticky; top: .8rem; max-height: calc(100vh - 1.6rem); overflow-y: auto; }
    .board { order: 1; }
  }
</style>

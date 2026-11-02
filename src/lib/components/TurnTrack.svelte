<script lang="ts">
  // Presentation only. The authoritative phase and active player come from Phase.
  let { phase, turn, activePlayer }: { phase: string; turn: number; activePlayer: number } = $props();
  const phases = [
    { label: 'Inicio', values: ['Untap', 'Upkeep', 'Draw'] },
    { label: 'Principal', values: ['PreCombatMain'] },
    { label: 'Combate', values: ['BeginCombat', 'DeclareAttackers', 'DeclareBlockers', 'CombatDamage', 'EndCombat'] },
    { label: 'Principal 2', values: ['PostCombatMain'] },
    { label: 'Final', values: ['End', 'Cleanup'] }
  ];
  const index = $derived(phases.findIndex((item) => item.values.some((value) => value === phase)));
</script>

<div class="turn-track" data-current-phase={phase} aria-label="Fases del turno">
  <p class="turn-caption">Turno {turn} · Jugador {activePlayer + 1}</p>
  <ol class="segments">
    {#each phases as item, i (item.label)}
      <li class:current={index === i} aria-current={index === i ? 'step' : undefined}>
        {item.label}
      </li>
    {/each}
  </ol>
</div>

<style>
  .turn-track {
    grid-column: 1 / -1;
    display: grid;
    gap: .35rem;
    width: min(100%, 760px);
    margin-inline: auto;
    min-width: 0;
  }
  .turn-caption {
    margin: 0;
    text-align: center;
    color: var(--ink);
    font-size: .76rem;
    font-weight: 700;
    letter-spacing: .035em;
  }
  .segments {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 3px;
    padding: .25rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--surface) 94%, transparent);
    border: 1px solid var(--line);
    margin: 0;
    list-style: none;
  }
  li {
    min-width: 0;
    text-align: center;
    border-radius: 999px;
    padding: .3rem .2rem;
    font-size: .7rem;
    color: var(--ink-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  li.current {
    font-weight: 800;
    color: var(--accent-ink);
    background: var(--accent);
    box-shadow: 0 1px 8px var(--accent-dim);
  }
  @media (max-width: 440px) {
    li { font-size: .59rem; padding: .3rem .1rem; }
    .segments { gap: 1px; }
  }
</style>

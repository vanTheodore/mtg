<script lang="ts">
  import { session } from '#lib/game/session.svelte.ts';
  const snapshot = $derived(session.snapshot);
  const stack = $derived(snapshot?.state.stack ?? []);
  const objects = $derived(snapshot?.state.objects ?? {});
  const KINDS: Record<string, string> = { Spell: 'Hechizo', ActivatedAbility: 'Habilidad activada', TriggeredAbility: 'Habilidad disparada' };
  type Detail = { source_name?: string; kind_label?: string; ability_kind?: { type?: string }; ability_description?: string; targets?: { label: string; target: unknown }[]; paid?: unknown[]; controller?: number };
  const entries = $derived(stack.map((raw, i) => {
    const entry = raw as { id?: number; source_id?: number; controller?: number; kind?: { type?: string } };
    const details = (snapshot?.derived.stack_entry_details ?? {}) as Record<string, Detail>;
    const detail = details[String(entry.id)];
    const source = entry.source_id !== undefined ? objects[String(entry.source_id)] : undefined;
    const kindType = entry.kind?.type ?? '';
    return {
      key: entry.id ?? i,
      name: detail?.source_name ?? source?.name ?? 'Objeto en la pila',
      controller: `Jugador ${(detail?.controller ?? entry.controller ?? 0) + 1}`,
      kind: detail?.kind_label ?? KINDS[kindType] ?? (kindType ? 'Efecto en la pila' : ''),
      description: detail?.ability_description ?? '',
      targets: (detail?.targets ?? []).map((t) => t.label).filter(Boolean),
      paid: detail?.paid?.length ?? 0
    };
  }));
</script>

<section class="stack" aria-label="Pila">
  <h2>Pila <span class="count">{stack.length}</span></h2>
  {#if stack.length === 0}
    <p class="muted">La pila está vacía.</p>
  {:else}
    <ol>
      {#each entries as entry (entry.key)}
        <li>
          <strong>{entry.name}</strong>
          <span>{[entry.controller, entry.kind].filter(Boolean).join(' · ')}{entry.paid ? ` · ${entry.paid} pago(s)` : ''}</span>
          {#if entry.description}<span class="desc">{entry.description}</span>{/if}
          {#if entry.targets.length}<span class="desc">Objetivos: {entry.targets.join(', ')}</span>{/if}
        </li>
      {/each}
    </ol>
  {/if}
</section>

<style>
  .stack { background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: .8rem; }
  h2 { margin: 0 0 .4rem; font-size: .95rem; }
  .count { color: var(--ink-muted); font-weight: 500; }
  .muted { color: var(--ink-muted); font-size: .84rem; margin: .3rem 0; }
  ol { margin: .3rem 0; padding-left: 1.1rem; display: grid; gap: .35rem; }
  li { font-size: .82rem; display: flex; flex-direction: column; }
  li span { color: var(--ink-muted); font-size: .74rem; }
</style>

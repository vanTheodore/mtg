<script lang="ts">
  import BoardCard from './BoardCard.svelte';
  import { session } from '#lib/game/session.svelte.ts';
  import { groupTokens, isToken } from '#lib/game/cards.ts';
  import { combatRole, permanentStates } from '#lib/game/interaction.ts';
  import type { CardMeta, GameObject } from '#lib/engine/types.ts';

  let { objects, metas, owner, label }: { objects: GameObject[]; metas: Record<string, CardMeta>; owner: number; label: string } = $props();
  let expanded = $state<Record<string, boolean>>({});
  const mine = $derived(objects.filter((o) => o.controller === owner));
  const lands = $derived(mine.filter((o) => !isToken(o) && o.card_types?.core_types?.includes('Land')));
  const creatures = $derived(mine.filter((o) => !isToken(o) && o.card_types?.core_types?.includes('Creature') && !o.card_types?.core_types?.includes('Land')));
  const other = $derived(mine.filter((o) => !isToken(o) && !o.card_types?.core_types?.includes('Land') && !o.card_types?.core_types?.includes('Creature')));
  const tokenGroups = $derived(groupTokens(mine.filter(isToken), {
    combatRole: (id) => combatRole(session.snapshot, id),
    keywordBadges: (session.snapshot?.derived.battlefield_keyword_badges ?? {}) as Record<string, unknown[]>,
    copyStatus: Object.fromEntries(((session.snapshot?.derived.copied_permanents ?? []) as number[]).map((id) => [String(id), true]))
  }));
  function metaFor(obj: GameObject): CardMeta | undefined { return metas[obj.printed_ref?.oracle_id ?? ''] ?? metas[obj.name.toLowerCase()]; }
  function toggle(key: string) { expanded[key] = !expanded[key]; }
</script>

<section class="battlefield" aria-label={label}>
  <h2>{label} <span class="count">{mine.length}</span></h2>
  {#if mine.length === 0}<p class="empty">Campo de batalla vacío.</p>{:else}
    {#if lands.length}
      <div class="row" aria-label="Tierras">{#each lands as obj (obj.id)}<BoardCard object={obj} meta={metaFor(obj)} compact={session.density === 'compact'} />{/each}</div>
    {/if}
    {#if creatures.length}
      <div class="row" aria-label="Criaturas">{#each creatures as obj (obj.id)}<BoardCard object={obj} meta={metaFor(obj)} compact={session.density === 'compact'} />{/each}</div>
    {/if}
    {#if other.length}
      <div class="row" aria-label="Otros permanentes">{#each other as obj (obj.id)}<BoardCard object={obj} meta={metaFor(obj)} compact={session.density === 'compact'} />{/each}</div>
    {/if}
    {#each tokenGroups as group (group.key)}
      <div class="token-group">
        {#if group.items.length > 3}
          <button type="button" class="group-toggle" aria-expanded={!!expanded[group.key]} onclick={() => toggle(group.key)}>
            {group.name} × {group.items.length} · {[group.items[0].power != null ? `${group.items[0].power}/${group.items[0].toughness}` : '', ...permanentStates(group.items[0], combatRole(session.snapshot, group.items[0].id))].filter(Boolean).join(' · ')} {expanded[group.key] ? '▾' : '▸'}
          </button>
        {/if}
        {#if expanded[group.key] || group.items.length <= 3}
          <div class="row">{#each group.items as obj (obj.id)}<BoardCard object={obj} meta={metaFor(obj)} compact />{/each}</div>
        {:else}<p class="group-hint">Mismas características y estado. Expande para elegir una ficha concreta.</p>{/if}
      </div>
    {/each}
  {/if}
</section>

<style>
  .battlefield { min-width: 0; max-width: 100%; background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: .7rem .8rem; }
  h2 { margin: 0 0 .5rem; font-size: .9rem; font-weight: 650; }
  .count { color: var(--ink-muted); font-weight: 500; }
  .row { display: flex; flex-wrap: wrap; gap: .8rem; padding: .5rem .2rem; overflow: visible; }
  .empty { color: var(--ink-muted); font-size: .85rem; margin: .4rem 0; }
  .token-group { margin-top: .4rem; }
  .group-toggle { border: 1px solid var(--line); background: var(--surface-2); color: var(--ink); border-radius: 8px; padding: .4rem .6rem; font-size: .8rem; text-align: left; max-width: 100%; overflow-wrap: anywhere; }
  .group-hint { margin: .3rem 0; font-size: .75rem; color: var(--ink-muted); }
</style>

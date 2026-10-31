<script lang="ts">
  import CardView from './CardView.svelte';
  import { session } from '#lib/game/session.svelte.ts';
  import { attackTargets, blockTargets, canSelectObject, combatRole, objectSelectLabel } from '#lib/game/interaction.ts';
  import type { CardMeta, GameObject } from '#lib/engine/types.ts';
  let {
    object,
    meta,
    compact = false,
    highlight = false,
    onselect
  }: {
    object: GameObject;
    meta?: CardMeta;
    compact?: boolean;
    /** The tutorial points at this card. */
    highlight?: boolean;
    /** Overrides the default selection (the tutorial performs the step). */
    onselect?: (id: number) => void;
  } = $props();
  const s = $derived(session.snapshot);
  const badges = $derived((s?.derived.battlefield_keyword_badges ?? {}) as Record<string, unknown[]>);
  const copies = $derived((s?.derived.copied_permanents ?? []) as number[]);
</script>

<CardView {object} {meta} {compact}
  selected={session.selected === object.id || session.choosing.includes(object.id)}
  combat={combatRole(s, object.id)}
  keywords={badges[String(object.id)] ?? []}
  copy={copies.includes(object.id)}
  targetable={canSelectObject(s, object.id)}
  attackOptions={attackTargets(s, object.id).length}
  blockOptions={blockTargets(s, object.id).length}
  selectLabel={objectSelectLabel(s, object.id)}
  {highlight}
  onselect={(id) => (onselect ? onselect(id) : session.selectObject(id))}
  oninspect={(id) => { session.inspect = id; }} />

<script lang="ts">
  import Hand from '#lib/components/Hand.svelte';
  import Battlefield from '#lib/components/Battlefield.svelte';
  import InspectDialog from '#lib/components/InspectDialog.svelte';
  import Settings from '#lib/components/Settings.svelte';
  import { session } from '#lib/game/session.svelte.ts';
  import type { CardMeta, GameObject } from '#lib/engine/types.ts';
  import { onMount } from 'svelte';

  // This route is a deterministic UI fixture, not a rules simulation.
  // Gameplay fidelity is tested against the real WASM engine on /.
  const initialParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initialHand = Number(initialParams.get('hand'));
  const initialTokens = Number(initialParams.get('tokens'));
  let handCount = $state(initialHand >= 0 && initialHand <= 60 ? initialHand : 15);
  let tokenCount = $state(initialTokens >= 0 && initialTokens <= 60 ? initialTokens : 12);
  let imageMode = $state<'fallback' | 'hidden'>(initialParams.get('images') === 'hidden' ? 'hidden' : 'fallback');

  onMount(() => {
    const params = new URLSearchParams(location.search);
    const h = Number(params.get('hand'));
    const t = Number(params.get('tokens'));
    if (h >= 0 && h <= 60) handCount = h;
    if (t >= 0 && t <= 60) tokenCount = t;
    if (params.get('images') === 'hidden') imageMode = 'hidden';
  });

  const metas: Record<string, CardMeta> = {
    'oracle-forest': { name: 'Forest', oracle_id: 'oracle-forest', card_type: { core_types: ['Basic', 'Land'], subtypes: ['Forest'] } },
    'oracle-bears': { name: 'Grizzly Bears', oracle_id: 'oracle-bears', mana_cost: '{1}{G}', card_type: { core_types: ['Creature'], subtypes: ['Bear'] }, power: 2, toughness: 2, oracle_text: 'Una criatura sencilla para probar la disposición.' },
    'oracle-delver': { name: 'Delver of Secrets', oracle_id: 'oracle-delver', card_type: { core_types: ['Creature'], subtypes: ['Human', 'Wizard'] }, power: 1, toughness: 1 },
    'oracle-token': { name: 'Soldier Token', oracle_id: 'oracle-token', card_type: { core_types: ['Token', 'Creature'], subtypes: ['Soldier'] }, power: 1, toughness: 1 }
  };

  function card(id: number, overrides: Partial<GameObject> = {}): GameObject {
    return {
      id, card_id: id, owner: 0, controller: 0, zone: 'Hand', name: `Carta de prueba ${id}`,
      display_visible_to_viewer: imageMode !== 'hidden',
      ...overrides
    };
  }

  const hand = $derived(Array.from({ length: handCount }, (_, i) => {
    if (i === 0) return card(1000 + i, { name: 'Forest', zone: 'Hand', card_types: { core_types: ['Land'] }, printed_ref: { oracle_id: 'oracle-forest', face_name: 'Forest' } });
    if (i === 1) return card(1000 + i, { name: 'Grizzly Bears', card_types: { core_types: ['Creature'], subtypes: ['Bear'] }, power: 2, toughness: 2, printed_ref: { oracle_id: 'oracle-bears', face_name: 'Grizzly Bears' } });
    if (i === 2) return card(1000 + i, { name: 'Insectile Aberration', transformed: true, back_face: { name: 'Delver of Secrets' }, printed_ref: { oracle_id: 'oracle-delver', face_name: 'Insectile Aberration' }, card_types: { core_types: ['Creature'], subtypes: ['Insect'] }, power: 3, toughness: 2 });
    if (i === 3) return card(1000 + i, { name: 'Lightning Bolt', mana_cost: '{R}', card_types: { core_types: ['Instant'] }, oracle_text: 'Lightning Bolt deals 3 damage to any target.' });
    if (i === 4) return card(1000 + i, { name: 'Insectile Aberration', transformed: true, back_face: { name: 'Delver of Secrets' }, card_types: { core_types: ['Creature'], subtypes: ['Insect'] }, power: 3, toughness: 2 });
    return card(1000 + i, { name: `Hechizo ${i}`, mana_cost: '{2}{U}', oracle_text: 'Texto de prueba para verificar que la carta sigue siendo identificable sin ilustración.' });
  }));

  const battlefield = $derived([
    ...Array.from({ length: 6 }, (_, i) => card(2000 + i, { name: 'Forest', zone: 'Battlefield', card_types: { core_types: ['Land'] }, tapped: i % 2 === 0, printed_ref: { oracle_id: 'oracle-forest', face_name: 'Forest' } })),
    ...Array.from({ length: 4 }, (_, i) => card(2100 + i, { name: 'Grizzly Bears', zone: 'Battlefield', card_types: { core_types: ['Creature'], subtypes: ['Bear'] }, power: 2, toughness: 2, printed_ref: { oracle_id: 'oracle-bears', face_name: 'Grizzly Bears' }, attached_to: i === 0 ? 2101 : undefined, attachments: i === 1 ? [2100] : [] })),
    ...Array.from({ length: tokenCount }, (_, i) => card(3000 + i, { name: 'Soldier Token', zone: 'Battlefield', display_source: 'Token', card_types: { core_types: ['Creature'], subtypes: ['Soldier'] }, power: 1, toughness: 1, token_art: { power: 1, toughness: 1, colors: ['White'], subtypes: ['Soldier'], keywords: [], has_abilities: false } }))
  ]);

  const allObjects = $derived(Object.fromEntries([...hand, ...battlefield].map((o) => [String(o.id), o])));
  const cardWidth = $derived(Math.round(148 * session.cardScale));
</script>

<svelte:head><title>Mesa · pruebas de visibilidad</title></svelte:head>

<div class="stress" style="--card-w: {cardWidth}px" data-testid="stress-page">
  <header>
    <h1>Pruebas de visibilidad</h1>
    <p>Fixture de interfaz determinista. No ejecuta reglas; la partida real está en <a href="/">/</a>.</p>
    <Settings />
  </header>
  <div class="controls">
    <label>Mano <input type="number" min="0" max="60" bind:value={handCount} /></label>
    <label>Fichas <input type="number" min="0" max="60" bind:value={tokenCount} /></label>
    <label>Imágenes
      <select bind:value={imageMode}>
        <option value="fallback">Fallback identificable</option>
        <option value="hidden">Información oculta</option>
      </select>
    </label>
  </div>
  <Battlefield objects={battlefield} {metas} owner={0} label="Campo de prueba" />
  <Hand objects={hand} {metas} title="Mano de prueba" />
  <InspectDialog {metas} objects={allObjects} byObject={{}} />
</div>

<style>
  .stress { grid-template-columns: minmax(0, 1fr); max-width: 1600px; margin: 0 auto; padding: .8rem; display: grid; gap: .8rem; }
  .stress > * { min-width: 0; }
  header { display: flex; flex-wrap: wrap; align-items: center; gap: .8rem; }
  h1 { font-size: 1.2rem; margin: 0; }
  header p { margin: 0; color: var(--ink-muted); font-size: .85rem; flex: 1; }
  .controls { display: flex; flex-wrap: wrap; gap: .8rem; background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: .6rem; }
  label { display: grid; gap: .25rem; font-size: .8rem; color: var(--ink-muted); }
  input, select { background: var(--surface-2); border: 1px solid var(--line); color: var(--ink); border-radius: 8px; padding: .35rem; }
</style>

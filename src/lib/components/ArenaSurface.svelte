<script lang="ts">
  // Original Phase arena paintings; source SHA and Git blobs are pinned in
  // static/phase/arenas/SOURCE.md. Pure Svelte: no React or WebGL.
  type ArenaMana = 'white' | 'blue' | 'black' | 'red' | 'green';
  let { color = 'blue' }: { color?: ArenaMana } = $props();

  const artwork: Record<ArenaMana, string> = {
    white: '/phase/arenas/angelic-sky-topdown.webp',
    blue: '/phase/arenas/ocean-temple-topdown.webp',
    black: '/phase/arenas/moon-coven-topdown.webp',
    red: '/phase/arenas/molten-topdown.webp',
    green: '/phase/arenas/elderwood-topdown.webp'
  };
</script>

<div class="arena-surface" data-mana={color} aria-hidden="true">
  <img class="arena-art" src={artwork[color]} alt="" loading="eager" decoding="async" />
  <div class="arena-shade"></div>
</div>

<style>
  .arena-surface {
    position: absolute;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
    border-radius: inherit;
    /* Only visible while the painting loads or cannot be decoded. */
    background: linear-gradient(160deg, #263b42, #0c151e 48%, #183438);
  }
  .arena-art {
    display: block;
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
  }
  .arena-shade {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, rgb(3 10 15 / 15%), transparent 19%, transparent 81%, rgb(3 10 15 / 28%));
  }
</style>

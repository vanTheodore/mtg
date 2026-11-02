<script lang="ts">
  // Lightweight Svelte-native interpretation of Phase's ArenaBackground.tsx.
  // Static CSS only: no shaders, WebGL, React or animation frameworks.
  type ArenaMana = 'white' | 'blue' | 'black' | 'red' | 'green';
  let { color = 'blue' }: { color?: ArenaMana } = $props();
</script>

<div class="arena-surface" data-mana={color} aria-hidden="true">
  <div class="light"></div>
  <div class="stones"></div>
  <div class="ring"></div>
  <div class="axis"></div>
  <div class="shade"></div>
</div>

<style>
  .arena-surface {
    --glow: #569ac1;
    --edge: #274658;
    position: absolute; inset: 0; z-index: -1; overflow: hidden;
    pointer-events: none; border-radius: inherit;
    background:
      radial-gradient(ellipse 105% 66% at 50% 50%, color-mix(in srgb, var(--glow) 21%, #142128) 0%, transparent 74%),
      linear-gradient(160deg, #1b2b32, #0c151e 48%, #162630);
  }
  .arena-surface[data-mana="white"] { --glow: #e2b76d; --edge: #876a45; }
  .arena-surface[data-mana="blue"] { --glow: #4d9cdd; --edge: #335882; }
  .arena-surface[data-mana="black"] { --glow: #9c76b8; --edge: #57456c; }
  .arena-surface[data-mana="red"] { --glow: #e46d4a; --edge: #914b42; }
  .arena-surface[data-mana="green"] { --glow: #6da681; --edge: #42634d; }
  .light, .stones, .ring, .axis, .shade { position: absolute; inset: 0; }
  .light {
    background:
      radial-gradient(ellipse 42% 25% at 50% 49%, color-mix(in srgb, var(--glow) 19%, transparent), transparent),
      radial-gradient(ellipse 45% 45% at 0% 0%, color-mix(in srgb, var(--edge) 40%, transparent), transparent),
      radial-gradient(ellipse 45% 45% at 100% 100%, color-mix(in srgb, var(--edge) 34%, transparent), transparent);
  }
  .stones {
    opacity: .36;
    background-image:
      repeating-linear-gradient(0deg, transparent 0 49px, color-mix(in srgb, var(--edge) 45%, transparent) 50px 51px),
      repeating-linear-gradient(90deg, transparent 0 94px, color-mix(in srgb, var(--edge) 40%, transparent) 95px 96px);
    mask-image: radial-gradient(ellipse 86% 68% at 50% 50%, black, transparent 100%);
    transform: perspective(580px) rotateX(18deg) scale(1.2);
  }
  .ring {
    inset: 14% 13%;
    border: 1px solid color-mix(in srgb, var(--glow) 30%, transparent);
    border-radius: 50%;
    opacity: .55;
    box-shadow: 0 0 0 26px color-mix(in srgb, var(--edge) 9%, transparent),
                inset 0 0 70px color-mix(in srgb, var(--glow) 8%, transparent);
  }
  .axis {
    top: 50%; bottom: auto; height: 1px;
    background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--glow) 38%, transparent), transparent);
    box-shadow: 0 0 24px 4px color-mix(in srgb, var(--glow) 13%, transparent);
  }
  .shade { background: radial-gradient(ellipse 82% 80% at center, transparent 24%, rgb(4 9 14 / 58%) 100%); }
  @media (max-width: 600px) {
    .stones { opacity: .16; }
    .ring { inset: 22% -28%; }
  }
</style>

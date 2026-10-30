import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({ fallback: 'index.html' })
    })
  ],
  server: {
    host: '0.0.0.0', port: 5173, allowedHosts: true,
    watch: { ignored: ['**/.cargo/**', '**/crates/**', '**/target*/**', '**/static/wasm/**', '**/test-results/**'] }
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: { target: 'es2022' }
});

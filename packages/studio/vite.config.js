import { defineConfig } from 'vite';

export default defineConfig({
  root: './',
  css: {
    postcss: {},
  },
  server: {
    port: 5173,
  },
  build: {
    // three is 521 kB minified on its own and that is not going to change — a
    // WebGL renderer is simply this big. Left at the default, the warning fires
    // on every single build, which is how a useful warning becomes noise nobody
    // reads. Raised just above three so it still fires if an *app* chunk grows
    // into the same territory, which would be worth knowing about.
    chunkSizeWarningLimit: 560,
    rollupOptions: {
      output: {
        // Measured composition of the single 942 kB entry chunk this replaces:
        // three 55.7%, the engine layer 20.5%, studio 16.8%, the rest of the
        // runtime 6.9%. Shiki was already lazy and stays that way.
        //
        // This splits for *caching*, not for first paint — every chunk here is
        // still needed to render the first frame, so the bytes over the wire on
        // a cold load are unchanged. What changes is that shipping a studio fix
        // no longer invalidates 600 kB of three.js in everyone's cache, and
        // editing one engine no longer invalidates the other twenty-one.
        //
        // Making the engines genuinely lazy would cut the cold load, and was
        // considered and rejected: mountEngine is synchronous, the variation
        // grid builds nine instances at once, and switching engines is the main
        // thing this tool does. Awaiting a network round trip on every switch
        // to save roughly 50 kB gzipped is the wrong trade for an instrument.
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('/packages/orb/src/engines/')) return 'engines';
          return undefined;
        },
      },
    },
  },
});

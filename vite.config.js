import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',          // index.html à la racine
  base: './',
  build: {
    outDir: 'dist',   // sortie du bundle
  }
});

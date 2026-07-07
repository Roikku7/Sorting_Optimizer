import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',          // index.html à la racine
  base: './',
  build: {
    outDir: 'dist',   // sortie du bundle
    commonjsOptions: {
      // mapping.js est en CommonJS (module.exports) et importé par le
      // renderer (settings_panel). Par défaut le plugin commonjs de Rollup
      // ne traite que node_modules → l'import devenait un module vide et
      // tout le bundle plantait au chargement ("reading 'sets'").
      include: [/mapping\.js$/, /node_modules/],
    },
  }
});

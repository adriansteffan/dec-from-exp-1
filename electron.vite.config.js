// electron.vite.config.js
import { defineConfig } from 'electron-vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { sharedConfig } from './shared.vite.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  main: {
    build: {
      outDir: 'dist-electron/main',
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'electron/main.js'),
        },
      },
    },
  },
  preload: {
    build: {
      outDir: 'dist-electron/preload',
      lib: {
        entry: path.resolve(__dirname, 'electron/preload.js'),
        formats: ['cjs']
      },
      rollupOptions: {
        external: ['electron']
      }
    }
  },
  renderer: {
    ...sharedConfig,
    root: path.resolve(__dirname, '.'),
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'index.html'),
        },
      },
    },
  },
});

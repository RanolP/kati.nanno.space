import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import soonlohVite from 'soonloh/vite';

export default defineConfig({
  plugins: [solid({ ssr: true }), soonlohVite()],
  build: {
    rollupOptions: {
      input: {
        'entry-server': 'src/entry-server.tsx',
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-web'
  },
  // Tells Vite not to scramble or strip Electron components during compilation
  optimizeDeps: {
    exclude: ['electron']
  }
});

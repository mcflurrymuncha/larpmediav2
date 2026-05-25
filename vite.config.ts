import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './', // CRITICAL: Forces relative paths so Electron can read the build
  build: {
    outDir: 'dist-web' // Separates web assets from final executable app
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Necessary for Electron file:// protocol
  server: {
    host: '127.0.0.1',
  },
  // `as any`: el bloque `test` es de Vitest; casteamos para no jalar los tipos de
  // Vite anidados dentro de Vitest (chocan con el Plugin de @vitejs/plugin-react).
  test: {
    environment: 'jsdom',
    globals: true,
  },
} as any)

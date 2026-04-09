import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './', // Necessary for Electron file:// protocol
  server: {
    host: '127.0.0.1',
  },
})

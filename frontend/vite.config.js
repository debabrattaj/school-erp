import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Most deployments (Vercel, local dev) serve this app from the domain
  // root. Some (e.g. a cPanel host that also serves a separate marketing
  // site at the root) mount it under a subpath instead — set
  // VITE_BASE_PATH at build time for those, e.g. VITE_BASE_PATH=/school-admin/.
  // App.jsx's <BrowserRouter basename={import.meta.env.BASE_URL}> picks
  // this up automatically, since Vite derives BASE_URL from `base`.
  base: process.env.VITE_BASE_PATH || '/',
})

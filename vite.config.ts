import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages project-page path (github.io/sentinel2-compare/). Applies to
// both the production build and `npm run dev` (Vite serves under this path
// in dev too), so local links must include the prefix, e.g.
// http://localhost:5173/sentinel2-compare/.
export default defineConfig({
  base: '/sentinel2-compare/',
  plugins: [react()],
})

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const useLocalApi = env.VITE_USE_LOCAL_API === 'true'

  return {
    plugins: [react(), tailwindcss()],
    server: useLocalApi
      ? {
          proxy: {
            '/api': 'http://localhost:5000'
          }
        }
      : undefined
  }
})

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/v1/auth': {
        target: 'http://127.0.0.1:8082',
        changeOrigin: true,
      },
      '/api/v1/skills': {
        target: 'http://127.0.0.1:8084',
        changeOrigin: true,
      },
      '/api/v1/sandboxes': {
        target: 'http://127.0.0.1:8084',
        changeOrigin: true,
      },
      '/api/v1/github': {
        target: 'http://127.0.0.1:8081',
        changeOrigin: true,
      },
      '/api/chats': {
        target: 'http://127.0.0.1:8083',
        changeOrigin: true,
      },
      '/api/sessions': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/repos': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/ide': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/workspace': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/workspaces': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/v1/context': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/v1/organizations': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/v1/teams': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/v1/analytics': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/api/spinworkspace': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      }
    }
  }
})

import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 13334,
        host: '0.0.0.0',
        allowedHosts: ['g-13334.cicy.de5.net'],
        proxy: {
          '/api': 'http://127.0.0.1:13335',
          '/vnc': { target: 'http://127.0.0.1:13335', ws: true },
          '/ttyd': { target: 'http://127.0.0.1:13335', ws: true },
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});

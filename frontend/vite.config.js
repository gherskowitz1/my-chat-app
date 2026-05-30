import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          livekit: ['livekit-client', '@livekit/components-react', '@livekit/components-styles'],
          vendor: ['react', 'react-dom', 'react-router-dom', 'socket.io-client'],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Configuracion de Vite.
 *
 * El proxy de desarrollo es clave: en lugar de que el navegador llame a
 * http://localhost:4000 (lo que dispararia CORS y obligaria a configurar
 * origenes), el servidor de desarrollo reenvia /api hacia el backend. Asi el
 * frontend usa rutas relativas y funciona igual en desarrollo y en produccion
 * (donde nginx hace el mismo reenvio).
 */
export default defineConfig({
  plugins: [react()],

  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY || 'http://localhost:4000',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  preview: {
    port: 4173,
    host: true,
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    // Separa las dependencias del codigo propio: el navegador cachea el
    // trozo de librerias y no lo vuelve a descargar en cada despliegue.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
        },
      },
    },
  },
});

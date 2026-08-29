import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      // Split vendor chunks to improve caching — each big library gets its own file
      // so a code change doesn't invalidate the entire vendor bundle
      rollupOptions: {
        output: {
          manualChunks: {
            // Core React runtime
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            // Firebase SDK — very large, changes rarely
            'vendor-firebase': ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            // Charting library
            'vendor-recharts': ['recharts'],
            // PDF generation
            'vendor-pdf': ['jspdf', 'html-to-image'],
            // Icons
            'vendor-icons': ['lucide-react'],
            // UI utilities
            'vendor-ui': ['sonner', 'motion', 'clsx', 'tailwind-merge'],
          },
        },
      },
      // Warn when any single chunk exceeds 500kb
      chunkSizeWarningLimit: 500,
    },
    // Pre-bundle heavy deps for faster dev server startup
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        'axios',
        'recharts',
        'lucide-react',
        'sonner',
      ],
    },
  };
});

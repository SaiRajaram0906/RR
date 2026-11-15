import { defineConfig } from 'vite';
// base './' keeps the build relocatable; it must still be served over http(s) (module scripts do not run from file://).
export default defineConfig({ base: './', build: { target: 'es2020', chunkSizeWarningLimit: 900, rollupOptions: { output: { manualChunks: { three: ['three'] } } } }, server: { host: '127.0.0.1', port: 5173 } });

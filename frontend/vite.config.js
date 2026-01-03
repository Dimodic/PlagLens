/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
export default defineConfig({
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
        host: true,
        // Vite 5 added a Host-header allowlist that defaults to `localhost` only.
        // Inside docker the request can come in with Host: host.docker.internal
        // or any of the published interfaces; for dev we trust everything. Never
        // copy this into production.
        // `true` is meant to allow everything but Vite 5.4 doesn't honor it
        // reliably — explicit list works.
        allowedHosts: ['localhost', '127.0.0.1', 'host.docker.internal', '.local'],
        // When running inside docker the container listens on 5173 but is
        // published to the host on 5174 (so the prod nginx can keep using 5173).
        // The HMR client must connect back on the host-visible port; Vite needs
        // an explicit `clientPort` because it can't auto-detect docker port maps.
        hmr: process.env.VITE_HMR_CLIENT_PORT
            ? { clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) }
            : true,
        proxy: {
            '/api': {
                target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:8000',
                changeOrigin: true,
                secure: false,
            },
        },
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
        target: 'es2022',
        // Embed a build timestamp into asset filenames so each rebuild produces a
        // brand-new URL even when content hashes happen to collide. This bypasses
        // nginx's `Cache-Control: immutable` policy without changing the policy.
        rollupOptions: {
            output: {
                entryFileNames: "assets/[name]-[hash]-".concat(Date.now(), ".js"),
                chunkFileNames: "assets/[name]-[hash]-".concat(Date.now(), ".js"),
                assetFileNames: "assets/[name]-[hash]-".concat(Date.now(), ".[ext]"),
            },
        },
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./tests/setup.ts'],
        css: false,
    },
});

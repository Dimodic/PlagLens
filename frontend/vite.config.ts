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
  // Pre-bundle the heavy deps tree at dev-server boot so the first
  // page navigation doesn't trigger a cascade of on-demand transforms
  // (each radix-ui-* / recharts subpath was costing ~150 ms cold).
  // Without this list Vite discovers them lazily as routes mount and
  // the cold-load skeleton hangs around for tens of seconds.
  // Keep in sync with package.json — adding a new heavy dep without
  // adding it here re-introduces the slow first paint.
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react-router-dom',
      '@tanstack/react-query',
      'axios',
      'sonner',
      'zod',
      'clsx',
      'class-variance-authority',
      'tailwind-merge',
      'lucide-react',
      'dayjs',
      'date-fns',
      'react-hook-form',
      '@hookform/resolvers/zod',
      'cmdk',
      'vaul',
      'embla-carousel-react',
      'input-otp',
      'react-day-picker',
      'react-resizable-panels',
      'next-themes',
      'rxjs',
      '@radix-ui/react-accordion',
      '@radix-ui/react-alert-dialog',
      '@radix-ui/react-aspect-ratio',
      '@radix-ui/react-avatar',
      '@radix-ui/react-checkbox',
      '@radix-ui/react-collapsible',
      '@radix-ui/react-context-menu',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-hover-card',
      '@radix-ui/react-label',
      '@radix-ui/react-menubar',
      '@radix-ui/react-navigation-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-progress',
      '@radix-ui/react-radio-group',
      '@radix-ui/react-scroll-area',
      '@radix-ui/react-select',
      '@radix-ui/react-separator',
      '@radix-ui/react-slider',
      '@radix-ui/react-slot',
      '@radix-ui/react-switch',
      '@radix-ui/react-tabs',
      '@radix-ui/react-toggle',
      '@radix-ui/react-toggle-group',
      '@radix-ui/react-tooltip',
    ],
    // Recharts ships ESM but its barrel imports pull in d3-* with
    // weird CJS shims; excluding it lets it stay lazy-loaded by
    // dashboards only when those routes are visited.
    exclude: ['recharts', '@univerjs/presets', '@univerjs/preset-sheets-core'],
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
        entryFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
        chunkFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
        assetFileNames: `assets/[name]-[hash]-${Date.now()}.[ext]`,
      },
    },
  },
});

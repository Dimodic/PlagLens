// vite.config.ts
import { defineConfig } from "file:///app/node_modules/vite/dist/node/index.js";
import react from "file:///app/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///app/node_modules/@tailwindcss/vite/dist/index.mjs";
import path from "node:path";
var __vite_injected_original_dirname = "/app";
var vite_config_default = defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
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
    allowedHosts: ["localhost", "127.0.0.1", "host.docker.internal", ".local"],
    // When running inside docker the container listens on 5173 but is
    // published to the host on 5174 (so the prod nginx can keep using 5173).
    // The HMR client must connect back on the host-visible port; Vite needs
    // an explicit `clientPort` because it can't auto-detect docker port maps.
    hmr: process.env.VITE_HMR_CLIENT_PORT ? { clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) } : true,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://localhost:8000",
        changeOrigin: true,
        secure: false
      }
    }
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
    // Embed a build timestamp into asset filenames so each rebuild produces a
    // brand-new URL even when content hashes happen to collide. This bypasses
    // nginx's `Cache-Control: immutable` policy without changing the policy.
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
        chunkFileNames: `assets/[name]-[hash]-${Date.now()}.js`,
        assetFileNames: `assets/[name]-[hash]-${Date.now()}.[ext]`
      }
    }
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    css: false
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvYXBwXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvYXBwL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9hcHAvdml0ZS5jb25maWcudHNcIjsvLy8gPHJlZmVyZW5jZSB0eXBlcz1cInZpdGVzdFwiIC8+XG5pbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSAnQHRhaWx3aW5kY3NzL3ZpdGUnO1xuaW1wb3J0IHBhdGggZnJvbSAnbm9kZTpwYXRoJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3JlYWN0KCksIHRhaWx3aW5kY3NzKCldLFxuICByZXNvbHZlOiB7XG4gICAgYWxpYXM6IHtcbiAgICAgICdAJzogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgJy4vc3JjJyksXG4gICAgfSxcbiAgfSxcbiAgc2VydmVyOiB7XG4gICAgcG9ydDogNTE3MyxcbiAgICBob3N0OiB0cnVlLFxuICAgIC8vIFZpdGUgNSBhZGRlZCBhIEhvc3QtaGVhZGVyIGFsbG93bGlzdCB0aGF0IGRlZmF1bHRzIHRvIGBsb2NhbGhvc3RgIG9ubHkuXG4gICAgLy8gSW5zaWRlIGRvY2tlciB0aGUgcmVxdWVzdCBjYW4gY29tZSBpbiB3aXRoIEhvc3Q6IGhvc3QuZG9ja2VyLmludGVybmFsXG4gICAgLy8gb3IgYW55IG9mIHRoZSBwdWJsaXNoZWQgaW50ZXJmYWNlczsgZm9yIGRldiB3ZSB0cnVzdCBldmVyeXRoaW5nLiBOZXZlclxuICAgIC8vIGNvcHkgdGhpcyBpbnRvIHByb2R1Y3Rpb24uXG4gICAgLy8gYHRydWVgIGlzIG1lYW50IHRvIGFsbG93IGV2ZXJ5dGhpbmcgYnV0IFZpdGUgNS40IGRvZXNuJ3QgaG9ub3IgaXRcbiAgICAvLyByZWxpYWJseSBcdTIwMTQgZXhwbGljaXQgbGlzdCB3b3Jrcy5cbiAgICBhbGxvd2VkSG9zdHM6IFsnbG9jYWxob3N0JywgJzEyNy4wLjAuMScsICdob3N0LmRvY2tlci5pbnRlcm5hbCcsICcubG9jYWwnXSxcbiAgICAvLyBXaGVuIHJ1bm5pbmcgaW5zaWRlIGRvY2tlciB0aGUgY29udGFpbmVyIGxpc3RlbnMgb24gNTE3MyBidXQgaXNcbiAgICAvLyBwdWJsaXNoZWQgdG8gdGhlIGhvc3Qgb24gNTE3NCAoc28gdGhlIHByb2QgbmdpbnggY2FuIGtlZXAgdXNpbmcgNTE3MykuXG4gICAgLy8gVGhlIEhNUiBjbGllbnQgbXVzdCBjb25uZWN0IGJhY2sgb24gdGhlIGhvc3QtdmlzaWJsZSBwb3J0OyBWaXRlIG5lZWRzXG4gICAgLy8gYW4gZXhwbGljaXQgYGNsaWVudFBvcnRgIGJlY2F1c2UgaXQgY2FuJ3QgYXV0by1kZXRlY3QgZG9ja2VyIHBvcnQgbWFwcy5cbiAgICBobXI6IHByb2Nlc3MuZW52LlZJVEVfSE1SX0NMSUVOVF9QT1JUXG4gICAgICA/IHsgY2xpZW50UG9ydDogTnVtYmVyKHByb2Nlc3MuZW52LlZJVEVfSE1SX0NMSUVOVF9QT1JUKSB9XG4gICAgICA6IHRydWUsXG4gICAgcHJveHk6IHtcbiAgICAgICcvYXBpJzoge1xuICAgICAgICB0YXJnZXQ6IHByb2Nlc3MuZW52LlZJVEVfQVBJX1BST1hZX1RBUkdFVCB8fCAnaHR0cDovL2xvY2FsaG9zdDo4MDAwJyxcbiAgICAgICAgY2hhbmdlT3JpZ2luOiB0cnVlLFxuICAgICAgICBzZWN1cmU6IGZhbHNlLFxuICAgICAgfSxcbiAgICB9LFxuICB9LFxuICBidWlsZDoge1xuICAgIG91dERpcjogJ2Rpc3QnLFxuICAgIHNvdXJjZW1hcDogdHJ1ZSxcbiAgICB0YXJnZXQ6ICdlczIwMjInLFxuICAgIC8vIEVtYmVkIGEgYnVpbGQgdGltZXN0YW1wIGludG8gYXNzZXQgZmlsZW5hbWVzIHNvIGVhY2ggcmVidWlsZCBwcm9kdWNlcyBhXG4gICAgLy8gYnJhbmQtbmV3IFVSTCBldmVuIHdoZW4gY29udGVudCBoYXNoZXMgaGFwcGVuIHRvIGNvbGxpZGUuIFRoaXMgYnlwYXNzZXNcbiAgICAvLyBuZ2lueCdzIGBDYWNoZS1Db250cm9sOiBpbW11dGFibGVgIHBvbGljeSB3aXRob3V0IGNoYW5naW5nIHRoZSBwb2xpY3kuXG4gICAgcm9sbHVwT3B0aW9uczoge1xuICAgICAgb3V0cHV0OiB7XG4gICAgICAgIGVudHJ5RmlsZU5hbWVzOiBgYXNzZXRzL1tuYW1lXS1baGFzaF0tJHtEYXRlLm5vdygpfS5qc2AsXG4gICAgICAgIGNodW5rRmlsZU5hbWVzOiBgYXNzZXRzL1tuYW1lXS1baGFzaF0tJHtEYXRlLm5vdygpfS5qc2AsXG4gICAgICAgIGFzc2V0RmlsZU5hbWVzOiBgYXNzZXRzL1tuYW1lXS1baGFzaF0tJHtEYXRlLm5vdygpfS5bZXh0XWAsXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIHRlc3Q6IHtcbiAgICBnbG9iYWxzOiB0cnVlLFxuICAgIGVudmlyb25tZW50OiAnanNkb20nLFxuICAgIHNldHVwRmlsZXM6IFsnLi90ZXN0cy9zZXR1cC50cyddLFxuICAgIGNzczogZmFsc2UsXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFDQSxTQUFTLG9CQUFvQjtBQUM3QixPQUFPLFdBQVc7QUFDbEIsT0FBTyxpQkFBaUI7QUFDeEIsT0FBTyxVQUFVO0FBSmpCLElBQU0sbUNBQW1DO0FBTXpDLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQyxNQUFNLEdBQUcsWUFBWSxDQUFDO0FBQUEsRUFDaEMsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxLQUFLLFFBQVEsa0NBQVcsT0FBTztBQUFBLElBQ3RDO0FBQUEsRUFDRjtBQUFBLEVBQ0EsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLElBT04sY0FBYyxDQUFDLGFBQWEsYUFBYSx3QkFBd0IsUUFBUTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFLekUsS0FBSyxRQUFRLElBQUksdUJBQ2IsRUFBRSxZQUFZLE9BQU8sUUFBUSxJQUFJLG9CQUFvQixFQUFFLElBQ3ZEO0FBQUEsSUFDSixPQUFPO0FBQUEsTUFDTCxRQUFRO0FBQUEsUUFDTixRQUFRLFFBQVEsSUFBSSx5QkFBeUI7QUFBQSxRQUM3QyxjQUFjO0FBQUEsUUFDZCxRQUFRO0FBQUEsTUFDVjtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixXQUFXO0FBQUEsSUFDWCxRQUFRO0FBQUE7QUFBQTtBQUFBO0FBQUEsSUFJUixlQUFlO0FBQUEsTUFDYixRQUFRO0FBQUEsUUFDTixnQkFBZ0Isd0JBQXdCLEtBQUssSUFBSSxDQUFDO0FBQUEsUUFDbEQsZ0JBQWdCLHdCQUF3QixLQUFLLElBQUksQ0FBQztBQUFBLFFBQ2xELGdCQUFnQix3QkFBd0IsS0FBSyxJQUFJLENBQUM7QUFBQSxNQUNwRDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQUEsRUFDQSxNQUFNO0FBQUEsSUFDSixTQUFTO0FBQUEsSUFDVCxhQUFhO0FBQUEsSUFDYixZQUFZLENBQUMsa0JBQWtCO0FBQUEsSUFDL0IsS0FBSztBQUFBLEVBQ1A7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=

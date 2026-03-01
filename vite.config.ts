import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "path";

const backendPort = process.env.VITE_BACKEND_PORT || process.env.AGENTOS_WORKBENCH_BACKEND_PORT || "3001";
const backendHost = process.env.VITE_BACKEND_HOST || "localhost";
const backendProtocol = process.env.VITE_BACKEND_PROTOCOL || "http";
const backendTarget = process.env.VITE_API_URL || `${backendProtocol}://${backendHost}:${backendPort}`;

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      // Exclude Node.js built-ins that shouldn't be polyfilled
      exclude: ['fs', 'net', 'tls', 'child_process', 'dgram', 'dns']
    }),
    {
      name: 'replace-node-events',
      enforce: 'pre',
      resolveId(id, importer) {
        // Replace node:events and events imports with browser-compatible polyfill
        if (id === 'node:events' || id === 'events') {
          return path.resolve(__dirname, "src/lib/events-polyfill.ts");
        }
        // Exclude server-only packages from browser bundle
        if (id === 'pg' || id.startsWith('pg/')) {
          return { id: 'pg', external: true };
        }
        return null;
      }
    }
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // Use workspace source for browser-safe build and avoid package exports resolution
      // "@framers/sql-storage-adapter": path.resolve(__dirname, "../../packages/sql-storage-adapter/src/index.ts")
    }
  },
  optimizeDeps: {
    exclude: ['pg', 'pg-native', 'better-sqlite3']
  },
  assetsInclude: ['**/*.wasm'],
  server: {
    port: 5175,
    open: true,
    proxy: {
      "/api/agentos": {
        target: backendTarget,
        changeOrigin: true,
        secure: false
      },
      "/api/evaluation": {
        target: backendTarget,
        changeOrigin: true,
        secure: false
      },
      "/api/planning": {
        target: backendTarget,
        changeOrigin: true,
        secure: false
      }
    }
  }
});

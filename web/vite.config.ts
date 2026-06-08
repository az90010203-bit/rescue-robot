import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@app": "/src/app",
      "@workspaces": "/src/workspaces",
      "@domains": "/src/domains",
      "@platform": "/src/platform",
      "@plugins": "/src/plugins",
      "@adapters": "/src/adapters",
      "@shared": "/src/shared"
    }
  },
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, "/");
          if (id.indexOf("node_modules") >= 0) {
            if (normalizedId.indexOf("node_modules/react/") >= 0 || normalizedId.indexOf("node_modules/react-dom/") >= 0 || normalizedId.indexOf("node_modules/scheduler/") >= 0) {
              return "vendor-react";
            }
            if (normalizedId.indexOf("node_modules/blockly/") >= 0) {
              return "vendor-blockly";
            }
            if (normalizedId.indexOf("node_modules/lucide-react/") >= 0) {
              return "vendor-icons";
            }
            if (normalizedId.indexOf("node_modules/react-grid-layout/") >= 0 || normalizedId.indexOf("node_modules/react-resizable/") >= 0) {
              return "vendor-layout";
            }
            if (normalizedId.indexOf("node_modules/three") >= 0) {
              return "vendor-three";
            }
            if (normalizedId.indexOf("i18next") >= 0 || normalizedId.indexOf("react-i18next") >= 0) {
              return "vendor-i18n";
            }
            return "vendor";
          }
          if (normalizedId.indexOf("/src/i18n/") >= 0) {
            return "app-i18n";
          }
        }
      }
    }
  },
  test: {
    environment: "node",
    globals: true
  }
});

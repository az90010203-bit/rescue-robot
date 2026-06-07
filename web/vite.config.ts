import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.indexOf("node_modules") >= 0) {
            if (id.indexOf("node_modules/three") >= 0 || id.indexOf("node_modules\\three") >= 0) {
              return "vendor-three";
            }
            if (id.indexOf("i18next") >= 0 || id.indexOf("react-i18next") >= 0) {
              return "vendor-i18n";
            }
            return "vendor";
          }
          if (id.indexOf("/src/i18n/") >= 0 || id.indexOf("\\src\\i18n\\") >= 0) {
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

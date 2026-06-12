import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

const webSrc = path.resolve(__dirname, "../web/src");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@adapters": path.resolve(webSrc, "adapters"),
      "@domains": path.resolve(webSrc, "domains"),
      "@shared": path.resolve(webSrc, "shared")
    }
  },
  server: {
    fs: {
      allow: [__dirname, webSrc]
    }
  },
  test: {
    environment: "node",
    globals: true
  }
});

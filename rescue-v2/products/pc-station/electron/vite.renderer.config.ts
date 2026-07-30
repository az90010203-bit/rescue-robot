import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { applyRendererCsp } from "./src/renderer/csp";

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: "rescue-csp",
      transformIndexHtml(html) {
        return applyRendererCsp(html, command);
      }
    }
  ],
  build: {
    sourcemap: true
  }
}));

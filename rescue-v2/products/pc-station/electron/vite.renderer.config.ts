import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    {
      name: "rescue-csp",
      transformIndexHtml(html) {
        const developmentSources =
          command === "serve" ? "ws://localhost:* http://localhost:*" : "";
        return html.replace("__DEV_CONNECT_SOURCES__", developmentSources);
      }
    }
  ],
  build: {
    sourcemap: true
  }
}));

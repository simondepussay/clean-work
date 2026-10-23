/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // En local, /api est servi par Azure Functions (func start) sur le port 7071.
  server: { proxy: { "/api": "http://localhost:7071" } },
  build: {
    rollupOptions: {
      output: {
        // Les bibliothèques changent rarement : dans leurs propres fichiers, elles restent en cache
        // d'une version de l'app à l'autre (seul le code de Clean Work est retéléchargé).
        manualChunks(id) {
          if (id.includes("node_modules/@azure/msal")) return "msal";
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
        },
      },
    },
  },
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"] },
});

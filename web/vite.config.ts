/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // En local, /api est servi par Azure Functions (func start) sur le port 7071.
  server: { proxy: { "/api": "http://localhost:7071" } },
  test: { environment: "jsdom", setupFiles: ["./src/test-setup.ts"] },
});

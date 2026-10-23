import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Prototype of the redesign, served under /next/ on the same domain as the
// current app (so it shares the passkey session). It builds into the main
// app's dist/next, which is deployed together with it.
export default defineConfig({
  base: "/next/",
  plugins: [react(), tailwindcss()],
  server: { port: 5174, host: true },
  build: { outDir: "../dist/next", emptyOutDir: true },
});

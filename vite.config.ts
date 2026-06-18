import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Bind to all interfaces so the dev server is reachable from other devices on
  // the LAN (e.g. testing on a real phone). Vite prints the Network: URL.
  server: { host: true },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});

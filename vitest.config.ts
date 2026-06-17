import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Vitest config for the frontend. Unit/component tests run in jsdom; the
// on-chain integration test opts into the node environment via a file-level
// `// @vitest-environment node` directive.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // The integration test deploys a contract to anvil, which can take a moment.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});

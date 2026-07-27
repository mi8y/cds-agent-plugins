/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  // Testing Configuration (Vitest)
  test: {
    globals: true,
    root: import.meta.dirname,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
    },
  },
});

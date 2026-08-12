/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  // Testing Configuration (Vitest)
  test: {
    name: "cds-langgraph-integration-tests",
    globals: true,
    root: import.meta.dirname,
    environment: "node",
    include: ["tests/**/*.test.{ts,js}"],
    coverage: {
      provider: "v8",
    },
  },
});

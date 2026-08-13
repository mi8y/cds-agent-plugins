/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { builtinModules } from "module";
import pkg from "./package.json";

const externalDependencies = Object.keys(pkg.dependencies || {}).filter(
  (dependency) => dependency !== "@mi8y/cds-agent-utils",
);

export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true, // Automatically links types in package.json
      include: ["src"],
    }),
  ],

  resolve: {
    tsconfigPaths: true,
  },

  // Build Configuration
  build: {
    minify: false, // disable since this is a node library
    lib: {
      entry: "src/index.ts",
      name: "@mi8y/cds-langchain-vectorstore",
      fileName: "index",
      formats: ["es", "cjs"],
    },
    sourcemap: true,
    rolldownOptions: {
      external: [
        // ignore dependencies when bundling
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        ...externalDependencies,
        ...Object.keys(pkg.peerDependencies || {}),
      ],
    },
  },

  // Testing Configuration (Vitest)
  test: {
    name: "cds-langchain-vectorstore",
    globals: true,
    root: import.meta.dirname,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      exclude: ["@cds-models/"],
    },
  },
});

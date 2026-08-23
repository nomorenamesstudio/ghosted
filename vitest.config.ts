import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "tests/unit/**/*.test.{ts,tsx}",
      "tests/integration/**/*.test.ts",
      "tests/component/**/*.test.{ts,tsx}",
    ],
    // next-auth imports subpaths like "next/server"; Next ships no `exports`
    // map, so Node ESM can't resolve them when externalized. Bundle it via Vite.
    server: {
      deps: {
        inline: ["next-auth"],
      },
    },
    // Integration tests share one real Postgres database → run files serially.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    env: { NODE_ENV: "test" },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
});

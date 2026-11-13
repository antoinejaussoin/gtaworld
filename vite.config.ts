import { defineConfig } from "vitest/config";

export default defineConfig({
  server: { port: 1420, strictPort: true, host: "127.0.0.1" },
  preview: { port: 1420, strictPort: true, host: "127.0.0.1" },
  clearScreen: false,
  base: "./",
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    testTimeout: 30000,
  },
});

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/live/setup-dotenv.ts"],
  },
  resolve: {
    alias: {
      "@": resolve(rootDir, "./src"),
    },
  },
});

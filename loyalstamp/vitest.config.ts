import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import path from "node:path";

export default defineConfig(({ mode }) => ({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Load .env into process.env (DATABASE_URL, secrets) and give tests a fallback secret.
    env: { AUTH_SECRET: "test-auth-secret-at-least-16", ...loadEnv(mode, process.cwd(), "") },
    // Integration tests share one database, so run test files one at a time.
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
}));

import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = {
  "@": path.resolve(import.meta.dirname, "src"),
  // `server-only` throws outside the Next.js server bundle; tests run server code directly.
  "server-only": path.resolve(import.meta.dirname, "tests/setup/server-only.ts"),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["tests/unit/**/*.test.tsx"],
          setupFiles: ["tests/setup/dom.ts"],
        },
      },
    ],
  },
});

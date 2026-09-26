import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // Must stay last: turns off stylistic rules that Prettier owns.
  prettier,

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    "src/generated/**",
    "prisma/migrations/**",
    "playwright-report/**",
    "test-results/**",
  ]),

  // Machine-checked versions of the rules in AGENTS.md.
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error", // rule 7
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-ignore": true, "ts-expect-error": true, "ts-nocheck": true },
      ], // rule 6
      "no-empty": ["error", { allowEmptyCatch: false }], // rule 5
      // Parameters named `_x` are intentionally unused (e.g. required by a function signature).
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Rule 9: UI must not reach the database directly — go through server actions/services.
    files: ["src/components/**", "src/features/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@/lib/db",
                "@/lib/db/*",
                "@/generated/prisma",
                "@/generated/prisma/*",
                "@/server/repositories/*",
              ],
              message: "UI components must not access the database. Use a server action or service.",
            },
          ],
        },
      ],
    },
  },
]);

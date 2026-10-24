import js from "@eslint/js";
import ts from "typescript-eslint";
import hooks from "eslint-plugin-react-hooks";
import globals from "globals";
export default ts.config(
  {
    ignores: [
      "artifacts/**",
      "node_modules/**",
      "dist/**",
      "backend/dist/**",
      "backend/.postgres/**",
    ],
  },
  {
    ...js.configs.recommended,
    files: [
      "src/**/*.{ts,tsx}",
      "backend/{src,tests}/**/*.ts",
      "packages/shared/**/*.ts",
      "tests/**/*.ts",
      "scripts/*.{js,mjs}",
      "scripts/ops/*.mjs",
      "*.config.{js,ts}",
    ],
  },
  ...ts.configs.recommended.map((config) => ({
    ...config,
    files: [
      "src/**/*.{ts,tsx}",
      "backend/{src,tests}/**/*.ts",
      "packages/shared/**/*.ts",
      "tests/**/*.ts",
      "scripts/*.ts",
      "*.config.ts",
    ],
  })),
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { "no-unused-vars": "off" },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "@typescript-eslint": ts.plugin },
    languageOptions: { parser: ts.parser },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": hooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);

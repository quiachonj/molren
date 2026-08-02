import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";

export default tseslint.config(
  {
    ignores: [
      "main.js",
      "RDKit_minimal.wasm",
      "node_modules/**",
      "coverage/**",
    ],
  },
  // Bundles ESLint + typescript-eslint (type-checked) + the Obsidian rules.
  ...obsidianmd.configs.recommended,
  {
    // Type-aware linting needs a TS program; use the project service.
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow intentionally-unused args/vars when prefixed with underscore.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // We support minAppVersion 1.4.0, so we use the classic settings-tab API
      // rather than the declarative one introduced in 1.13.
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
  {
    // Tests build loosely-typed mocks of RDKit handles via casts; the
    // no-unsafe-* family is intentional noise there. (Kept type-checked so
    // obsidianmd's type-aware rules still have a program to run against.)
    files: ["test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-return": "off",
    },
  },
  {
    // Build/config scripts run in Node and aren't part of the plugin bundle.
    files: ["**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
    rules: {
      "no-console": "off",
      "obsidianmd/rule-custom-message": "off",
    },
  },
  {
    // We deliberately use builtin-modules in the esbuild config (as the official
    // Obsidian sample plugin does) to externalize Node builtins.
    files: ["package.json"],
    rules: {
      "depend/ban-dependencies": "off",
    },
  },
  {
    // The stereo-annotation description uses R/S and E/Z, which are standard
    // stereochemistry descriptors and must stay uppercase — sentence-case can't
    // accommodate that, and the rule can't be disabled inline.
    files: ["src/settings.ts"],
    rules: {
      "obsidianmd/ui/sentence-case": "off",
    },
  },
);

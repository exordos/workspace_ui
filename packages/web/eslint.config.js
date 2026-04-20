import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import importX from "eslint-plugin-import-x";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";
import globals from "globals";
import sonarjs from "eslint-plugin-sonarjs";
import eslintPluginPromise from "eslint-plugin-promise";
import eslintPluginUnicorn from "eslint-plugin-unicorn";

/** Map plugin preset "error" to "warn" so new quality rules do not fail CI until addressed. */
function softenErrors(rules) {
  return Object.fromEntries(
    Object.entries(rules).map(([key, value]) => [key, value === "error" ? "warn" : value]),
  );
}

export default tseslint.config(
  { ignores: ["dist", "node_modules", "*.config.*"] },

  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  prettier,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ["**/src/**/*.{ts,tsx}"],
    ...sonarjs.configs.recommended,
    rules: softenErrors(sonarjs.configs.recommended.rules),
  },

  {
    files: ["**/src/**/*.{ts,tsx}"],
    plugins: { promise: eslintPluginPromise },
    rules: softenErrors(eslintPluginPromise.configs["flat/recommended"].rules),
  },

  {
    files: ["**/src/**/*.{ts,tsx}"],
    rules: {
      // Promise: `always-return` is noisy for void async handlers and fire-and-forget in React.
      "promise/always-return": "off",
      // SonarJS: micro-optimisation hints that dominate the report without catching logic bugs.
      "sonarjs/slow-regex": "off",
      // Default Sonar threshold (15) is tight for real-world React/store code; 25 still flags very heavy functions.
      "sonarjs/cognitive-complexity": ["warn", 25],
    },
  },

  {
    files: ["**/src/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "import-x": importX,
      "jsx-a11y": jsxA11y,
      unicorn: eslintPluginUnicorn,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-compiler/react-compiler": "off",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",

      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-floating-promises": "warn",
      "@typescript-eslint/no-misused-promises": [
        "warn",
        { checksVoidReturn: { attributes: false } },
      ],
      "@typescript-eslint/prefer-nullish-coalescing": "warn",
      "@typescript-eslint/prefer-optional-chain": "warn",
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/non-nullable-type-assertion-style": "off",

      "import-x/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            "parent",
            "sibling",
            "index",
            "type",
          ],
          pathGroups: [
            { pattern: "~/**", group: "internal", position: "before" },
          ],
          "newlines-between": "never",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],
      "import-x/no-duplicates": "warn",

      "no-console": ["warn", { allow: ["warn", "error"] }],
      "prefer-const": "warn",
      "no-var": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],

      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-param-reassign": ["error", { props: false }],
      "no-return-assign": "error",
      "no-self-compare": "error",
      "no-throw-literal": "error",
      "no-unmodified-loop-condition": "error",
      "no-useless-concat": "warn",
      "no-template-curly-in-string": "warn",
      "array-callback-return": "error",
      "default-case-last": "error",
      "no-constructor-return": "error",
      "no-promise-executor-return": "error",
      "no-unreachable-loop": "error",
      "require-atomic-updates": "warn",

      "no-restricted-properties": [
        "error",
        {
          object: "document",
          property: "write",
          message: "document.write is forbidden — use React rendering",
        },
        {
          object: "localStorage",
          property: "clear",
          message: "Use wipeCredentials() from auth-guard.ts — never clear all localStorage",
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "event", message: "Use the event parameter from the handler, not the global" },
        { name: "name", message: "Use a local variable — 'name' is window.name" },
        { name: "status", message: "Use a local variable — 'status' is window.status" },
        { name: "length", message: "Use a local variable — 'length' is window.length" },
      ],

      "@typescript-eslint/unbound-method": "off",

      ...jsxA11y.configs.recommended.rules,
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
      "jsx-a11y/anchor-is-valid": "warn",
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/no-autofocus": "warn",
      "jsx-a11y/no-redundant-roles": "warn",

      // Anti-patterns (eslint-plugin-unicorn — curated; full preset is too noisy for this codebase)
      "unicorn/no-invalid-remove-event-listener": "warn",
      "unicorn/no-abusive-eslint-disable": "warn",
      "unicorn/no-immediate-mutation": "warn",
      "unicorn/no-await-expression-member": "warn",
      "unicorn/prefer-array-find": "warn",
      "unicorn/error-message": "warn",
      "unicorn/no-useless-fallback-in-spread": "warn",
      "unicorn/no-useless-promise-resolve-reject": "warn",
      "unicorn/no-single-promise-in-promise-methods": "warn",
      "unicorn/no-useless-spread": "warn",
    },
  },
);

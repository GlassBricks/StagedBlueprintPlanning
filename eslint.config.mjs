import { fixupPluginRules } from "@eslint/compat"
import path from "node:path"
import { fileURLToPath } from "node:url"
import js from "@eslint/js"
import { FlatCompat } from "@eslint/eslintrc"
import _import from "eslint-plugin-import"
import globals from "globals"

import tseslint from "typescript-eslint"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
})

export default tseslint.config(
  {
    ignores: ["**/tstlPlugin/", "**/factorio-test-data-dir/", "**/out/", "**/*.js", "**/*.mjs", "**/node_modules"],
  },
  tseslint.configs.recommendedTypeChecked,
  ...compat.extends("eslint:recommended", "plugin:eslint-comments/recommended", "plugin:prettier/recommended"),
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: {
      import: fixupPluginRules(_import),
    },

    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },

    settings: {
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"],
      },

      "import/resolver": "typescript",
    },

    rules: {
      "no-useless-constructor": "off",
      "@typescript-eslint/no-useless-constructor": "error",
      "no-inner-declarations": "off",
      "no-use-before-define": "off",
      "class-methods-use-this": "off",
      "no-invalid-this": "off",
      "no-loop-func": "off",
      "no-undef": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/unbound-method": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-var-requires": "off",
      "@typescript-eslint/no-namespace": "off",
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/restrict-template-expressions": "off",
      "@typescript-eslint/restrict-plus-operands": "off",
      "@typescript-eslint/no-unsafe-enum-comparison": "off",
      "@typescript-eslint/only-throw-error": "off",
      "@typescript-eslint/no-unused-vars": ["error", { args: "all", argsIgnorePattern: "^_" }],
      "no-unused-vars": "off",
      "no-redeclare": "off",

      "@typescript-eslint/no-inferrable-types": [
        "warn",
        {
          ignoreProperties: true,
          ignoreParameters: true,
        },
      ],

      "prettier/prettier": "off",
      "no-template-curly-in-string": "error",
      "eslint-comments/no-unused-disable": "error",

      "eslint-comments/disable-enable-pair": [
        "error",
        {
          allowWholeFile: true,
        },
      ],

      "@typescript-eslint/explicit-module-boundary-types": "error",

      "import/no-nodejs-modules": [
        "error",
        {
          allow: ["util"],
        },
      ],

      "@typescript-eslint/explicit-member-accessibility": [
        "error",
        {
          accessibility: "no-public",
        },
      ],
    },
  },
  {
    files: ["scripts/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "import/no-nodejs-modules": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
)

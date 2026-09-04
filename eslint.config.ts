import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import boundaries from "eslint-plugin-boundaries";

export default tseslint.config(
  { ignores: ["**/dist", "**/node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { react, boundaries },
    settings: {
      react: { version: "19.1.0" },
      "import/resolver": {
        typescript: { alwaysTryTypes: true },
      },
      // Elements match module folders (one per bounded context, PLANNING.md
      // §6); controller/service/repository vs. schema is distinguished
      // per-file below via fileInternalPath.
      "boundaries/elements": [
        { type: "module", pattern: "apps/web/src/modules/*", capture: ["module"] },
        { type: "app", pattern: "apps/web/src/{components,lib}/**" },
      ],
    },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      // Layer rule from PLANNING.md §6: UI/app code, and every other module,
      // may only reach a module through its controller — never its
      // repository/service directly.
      "boundaries/dependencies": [
        "error",
        {
          default: "allow",
          policies: [
            {
              from: { element: { type: "app" } },
              disallow: {
                to: { element: { type: "module", fileInternalPath: "*.{repository,service}.ts" } },
              },
              message: "Import the module's controller, not its repository/service directly.",
            },
            {
              from: { element: { type: "module" } },
              disallow: {
                to: {
                  element: {
                    type: "module",
                    captured: { module: "!{{ from.element.captured.module }}" },
                    fileInternalPath: "*.{repository,service}.ts",
                  },
                },
              },
              message: "Import the module's controller, not its repository/service directly.",
            },
          ],
        },
      ],
    },
  },
);

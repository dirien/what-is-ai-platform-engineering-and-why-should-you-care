import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["bin/", "node_modules/", "eslint.config.mjs"],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["**/*.ts"],
        languageOptions: {
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            "@typescript-eslint/no-unused-vars": ["error", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
            }],
        },
    },
);

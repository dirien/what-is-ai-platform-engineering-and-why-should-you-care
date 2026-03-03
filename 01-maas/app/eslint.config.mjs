import globals from "globals";
import eslint from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
    {
        ignores: ["frontend/dist/", "node_modules/", "**/node_modules/"],
    },
    eslint.configs.recommended,
    {
        files: ["frontend/src/**/*.{js,jsx}"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.browser,
            },
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
        },
        plugins: {
            react,
            "react-hooks": reactHooks,
            "react-refresh": reactRefresh,
        },
        rules: {
            "react/jsx-uses-react": "error",
            "react/jsx-uses-vars": "error",
            ...reactHooks.configs.recommended.rules,
            "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
            "no-unused-vars": ["error", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
            }],
        },
        settings: {
            react: {
                version: "detect",
            },
        },
    },
    {
        files: ["backend/**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                ...globals.node,
            },
        },
        rules: {
            "no-unused-vars": ["error", {
                argsIgnorePattern: "^_",
                varsIgnorePattern: "^_",
            }],
        },
    },
];

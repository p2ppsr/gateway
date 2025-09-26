// .eslintrc.js
module.exports = {
  ignorePatterns: ["migrations/**/*.ts"],
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    ecmaFeatures: {
      jsx: true,
    },
    project: "./tsconfig.eslint.json",
  },
  settings: {
    react: {
      version: "detect",
    },
  },
  plugins: ["@typescript-eslint", "react", "react-hooks", "prettier"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:prettier/recommended",
  ],
  rules: {
    // 🔧 General
    "prettier/prettier": "warn",

    // ✅ React best practices
    "react/prop-types": "off", // we use TS instead
    "react/react-in-jsx-scope": "off", // not needed in React 17+

    // ✅ TypeScript strictness
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/explicit-function-return-type": "off",

    // 🚫 Don’t let ESLint strip our safe type assertions
    "@typescript-eslint/no-unnecessary-type-assertion": "off",
    "@typescript-eslint/consistent-type-assertions": "off",

    // Optional: sometimes annoying for JSX
    "@typescript-eslint/no-non-null-assertion": "off",
  },
  overrides: [
    {
      files: ["**/*.ts", "**/*.tsx"],
      rules: {
        // Let us cast/query DOM nodes explicitly without being auto-“fixed” away
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unnecessary-type-assertion": "off",
        "@typescript-eslint/consistent-type-assertions": "off",
      },
    },
  ],
};

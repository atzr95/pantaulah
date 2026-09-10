import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".open-next/**",
      ".vercel/**",
      ".wrangler/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  {
    // React Compiler rules shipped as errors in eslint-config-next 16. The codebase
    // predates them; keep them visible as warnings until the patterns are cleaned up.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/immutability": "warn",
    },
  },
];

export default eslintConfig;

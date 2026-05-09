import nextVitals from "eslint-config-next/core-web-vitals";

export default [
  ...nextVitals,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "supabase/**",
      "next-env.d.ts",
      "*.config.*",
    ],
  },
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

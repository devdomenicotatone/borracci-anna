import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Generatori di card OG (ImageResponse/Satori): sono JSX ma NON girano nel
    // browser — in quel contesto next/image non esiste e <img> e' l'elemento
    // corretto (il warning suggerirebbe un'alternativa impossibile). La regola
    // resta attiva in tutto il resto dell'app.
    files: [
      "src/app/**/opengraph-image.tsx",
      "src/app/**/twitter-image.tsx",
      "src/app/**/social/route.tsx",
    ],
    rules: {
      "@next/next/no-img-element": "off",
    },
  },
]);

export default eslintConfig;

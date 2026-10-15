// @lovable.dev/vite-tanstack-config already includes tanstackStart, viteReact,
// tailwindcss, tsConfigPaths, nitro, etc. Do NOT re-add those plugins.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { transform } from "esbuild";
import browserslist from "browserslist";
import { browserslistToTargets } from "lightningcss";

const LEGACY_BROWSERS = ["chrome >= 69", "android >= 9", "safari >= 12"];
const LEGACY_TARGETS = browserslistToTargets(browserslist(LEGACY_BROWSERS));

function transpileNodeModulesToES2015() {
  return {
    name: "legacy-node-modules-transpile",
    enforce: "post" as const,
    apply: "build" as const,
    async transform(code: string, id: string) {
      if (!/\.(m?js|cjs|jsx|tsx?)($|\?)/.test(id)) return null;
      if (id.includes("\u0000")) return null;
      try {
        const cleanId = id.split("?")[0];
        const ext = cleanId.slice(cleanId.lastIndexOf(".") + 1);
        const loader = ext === "ts" ? "ts" : ext === "tsx" ? "tsx" : ext === "jsx" ? "jsx" : "js";
        const result = await transform(code, {
          target: ["es2015", "chrome69"],
          supported: {
            "nullish-coalescing": false,
            "optional-chaining": false,
            "logical-assignment": false,
            "class-field": false,
            "class-static-field": false,
            "class-private-field": false,
            "class-private-method": false,
            "class-private-static-field": false,
            "class-private-static-method": false,
            "class-private-brand-check": false,
            "async-await": false,
            "async-generator": false,
            "for-await": false,
            "object-rest-spread": false,
            "optional-catch-binding": false,
            "template-literal": false,
            "exponent-operator": false,
            "hashbang": false,
            "bigint": false,
            "top-level-await": false,
          },
          loader,
          sourcemap: false,
          legalComments: "none",
        });
        return { code: result.code, map: null };
      } catch {
        return null;
      }
    },
  };
}

export default defineConfig({
  tanstackStart: {
    ssr: false,
    client: { entry: "capacitor-client" },
    server: { entry: "server" },
  },
  nitro: {
    output: {
      dir: "dist",
      publicDir: "dist/client",
      serverDir: "dist/server",
    },
  },
  vite: {
    base: "./", // Изменено для корректной работы в Capacitor
    plugins: [transpileNodeModulesToES2015()],
    build: {
      target: ["es2015", "chrome69"],
      cssTarget: "chrome69",
      minify: "terser",
      terserOptions: {
        ecma: 2015,
        safari10: true,
        format: { comments: false },
      },
    },
    esbuild: {
      target: "es2015",
      supported: {
        "nullish-coalescing": false,
        "optional-chaining": false,
        "logical-assignment": false,
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        target: "es2015",
        supported: {
          "nullish-coalescing": false,
          "optional-chaining": false,
          "logical-assignment": false,
        },
      },
    },
    css: {
      transformer: "lightningcss",
      lightningcss: {
        targets: LEGACY_TARGETS,
        drafts: { customMedia: true },
      },
    },
  },
});

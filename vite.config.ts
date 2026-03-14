import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function copyItem(sourceRelativePath: string, outputRelativePath: string) {
  const sourcePath = resolve(__dirname, sourceRelativePath);
  const outputPath = resolve(__dirname, "dist", outputRelativePath);

  if (!existsSync(sourcePath)) {
    return;
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  cpSync(sourcePath, outputPath, { recursive: true });
}

function copyLegacyAssetsPlugin() {
  return {
    name: "copy-legacy-assets",
    closeBundle() {
      copyItem("sw.js", "sw.js");
      copyItem("cards/app.css", "cards/app.css");
      copyItem("cards/app.js", "cards/app.js");
      copyItem("cards/legacy-shell.html", "cards/legacy-shell.html");
      copyItem("cards/sw.js", "cards/sw.js");
      copyItem("cards/services", "cards/services");
      copyItem("ab-tests/app.css", "ab-tests/app.css");
      copyItem("ab-tests/app.js", "ab-tests/app.js");
      copyItem("ab-tests/react-app.js", "ab-tests/react-app.js");
      copyItem("ab-tests/legacy-shell.html", "ab-tests/legacy-shell.html");
      copyItem("ab-tests/services", "ab-tests/services");
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyLegacyAssetsPlugin()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  assetsInclude: ["**/*.svg", "**/*.csv"],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        cards: resolve(__dirname, "cards/index.html"),
        abTests: resolve(__dirname, "ab-tests/index.html"),
      },
    },
  },
  server: {
    host: true,
    port: 5173,
  },
});

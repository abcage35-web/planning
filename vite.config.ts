import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

function syncRuntimeFallbackAsset(sourceRelativePath: string, outputRelativePaths: string[]) {
  const sourcePath = resolve(__dirname, sourceRelativePath);

  if (!existsSync(sourcePath)) {
    return;
  }

  for (const outputRelativePath of outputRelativePaths) {
    const outputPath = resolve(__dirname, outputRelativePath);
    mkdirSync(dirname(outputPath), { recursive: true });
    cpSync(sourcePath, outputPath, { recursive: true });
  }
}

function syncRuntimeFallbackAssets() {
  const distAssetsPath = resolve(__dirname, "dist", "assets");

  if (!existsSync(distAssetsPath)) {
    return;
  }

  const assetNames = readdirSync(distAssetsPath);
  const runtimeJsAsset = assetNames.filter((assetName) => /^main-.*\.js$/.test(assetName)).sort().at(-1);
  const runtimeCssAsset = assetNames.filter((assetName) => /^main-.*\.css$/.test(assetName)).sort().at(-1);

  if (runtimeJsAsset) {
    syncRuntimeFallbackAsset(`dist/assets/${runtimeJsAsset}`, ["assets/app.js", "dist/assets/app.js"]);
  }

  if (runtimeCssAsset) {
    syncRuntimeFallbackAsset(`dist/assets/${runtimeCssAsset}`, ["assets/app.css", "dist/assets/app.css"]);
  }
}

function copyLegacyAssetsPlugin() {
  return {
    name: "copy-legacy-assets",
    closeBundle() {
      syncRuntimeFallbackAssets();
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

function buildHeadersFromNodeRequest(nodeHeaders: Record<string, string | string[] | undefined>) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(nodeHeaders)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
      continue;
    }
    headers.set(name, value);
  }
  return headers;
}

async function readNodeRequestBody(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

async function sendFetchResponse(nodeResponse: import("node:http").ServerResponse, response: Response) {
  nodeResponse.statusCode = response.status;
  nodeResponse.statusMessage = response.statusText;

  response.headers.forEach((value, name) => {
    nodeResponse.setHeader(name, value);
  });

  const body = response.body ? Buffer.from(await response.arrayBuffer()) : Buffer.alloc(0);
  nodeResponse.end(body);
}

function createLocalFunctionsPlugin() {
  const routeEntries = new Map<string, string>([
    ["/api/xway-ab-test", "functions/api/xway-ab-test.js"],
    ["/api/xway-ab-tests", "functions/api/xway-ab-tests.js"],
    ["/api/xway-product-snapshots", "functions/api/xway-product-snapshots.js"],
    ["/api/planner-state", "functions/api/planner-state.js"],
  ]);

  const attachMiddleware = (middlewares: { use: (handler: (req: any, res: any, next: () => void) => void | Promise<void>) => void }) => {
    middlewares.use(async (req, res, next) => {
      const requestUrl = String(req.url || "/");
      const baseUrl = `http://${req.headers.host || "localhost:5173"}`;
      const url = new URL(requestUrl, baseUrl);
      const entryRelativePath = routeEntries.get(url.pathname);

      if (!entryRelativePath) {
        next();
        return;
      }

      const method = String(req.method || "GET").toUpperCase();
      const handlerNameByMethod: Record<string, string> = {
        OPTIONS: "onRequestOptions",
        GET: "onRequestGet",
        POST: "onRequestPost",
        PUT: "onRequestPut",
        PATCH: "onRequestPatch",
        DELETE: "onRequestDelete",
      };
      const handlerName = handlerNameByMethod[method] || "";
      if (!handlerName) {
        next();
        return;
      }

      try {
        const entryAbsolutePath = resolve(__dirname, entryRelativePath);
        const cacheBust =
          existsSync(entryAbsolutePath) ? String(statSync(entryAbsolutePath).mtimeMs) : String(Date.now());
        const moduleUrl = `${pathToFileURL(entryAbsolutePath).href}?t=${cacheBust}`;
        const module = await import(moduleUrl);
        const handler = module[handlerName];

        if (typeof handler !== "function") {
          next();
          return;
        }

        const request = new Request(url.toString(), {
          method,
          headers: buildHeadersFromNodeRequest(req.headers),
          body: method === "GET" || method === "HEAD" || method === "OPTIONS" ? undefined : await readNodeRequestBody(req),
        });
        const response = await handler({
          request,
          env: process.env,
        });
        await sendFetchResponse(res, response);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Local function handler failed";
        const response = new Response(JSON.stringify({ ok: false, message }), {
          status: 500,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
        await sendFetchResponse(res, response);
      }
    });
  };

  return {
    name: "local-functions-bridge",
    configureServer(server: { middlewares: { use: (handler: (req: any, res: any, next: () => void) => void | Promise<void>) => void } }) {
      attachMiddleware(server.middlewares);
    },
    configurePreviewServer(server: { middlewares: { use: (handler: (req: any, res: any, next: () => void) => void | Promise<void>) => void | Promise<void> } }) {
      attachMiddleware(server.middlewares);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyLegacyAssetsPlugin(), createLocalFunctionsPlugin()],
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
        planner: resolve(__dirname, "planner/index.html"),
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

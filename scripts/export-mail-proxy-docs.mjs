#!/usr/bin/env node
/**
 * Exports mail-proxy OpenAPI spec and a standalone Swagger HTML page.
 *
 * Source: packages/mail-api/openapi/mail-proxy.openapi.json
 * Output: packages/mail-proxy/docs/openapi.json
 *         packages/mail-proxy/docs/swagger.html
 *
 * Run: npm run docs:mail-proxy
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, "packages/mail-api/openapi/mail-proxy.openapi.json");
const outDir = join(root, "packages/mail-proxy/docs");
const openapiOut = join(outDir, "openapi.json");
const swaggerOut = join(outDir, "swagger.html");

const defaultPort = process.env.MAIL_PROXY_PORT?.trim() || "8787";
const spec = JSON.parse(readFileSync(sourcePath, "utf8"));
spec.servers = [{ url: `http://localhost:${defaultPort}` }];

mkdirSync(outDir, { recursive: true });
writeFileSync(openapiOut, `${JSON.stringify(spec, null, 2)}\n`);

const specJson = JSON.stringify(spec);
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${spec.info?.title ?? "Mail Proxy API"}</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.21.0/swagger-ui.css" />
  <style>body { margin: 0; }</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.21.0/swagger-ui-bundle.js" crossorigin></script>
  <script>
    SwaggerUIBundle({
      spec: ${specJson},
      dom_id: "#swagger-ui",
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "StandaloneLayout",
    });
  </script>
</body>
</html>
`;

writeFileSync(swaggerOut, html);
console.log(`Wrote ${openapiOut}`);
console.log(`Wrote ${swaggerOut}`);

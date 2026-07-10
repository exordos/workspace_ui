/**
 * Swagger UI and OpenAPI spec routes for mail-proxy API exploration.
 *
 * Spec source: @mail/api/openapi.json (mail-proxy.openapi.json).
 * UI: http://localhost:8787/docs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Express, NextFunction, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";

type OpenApiDocument = Record<string, unknown>;

const openApiSpecPath = fileURLToPath(import.meta.resolve("@mail/api/openapi.json"));
const baseOpenApiSpec = JSON.parse(readFileSync(openApiSpecPath, "utf8")) as OpenApiDocument;

/** Injects request host into OpenAPI `servers` so Swagger "Try it out" hits this instance. */
export function buildOpenApiSpec(req: Pick<Request, "protocol" | "get">): OpenApiDocument {
  const host = req.get("host") ?? "localhost";
  const protocol = req.protocol.length > 0 ? req.protocol : "http";
  return {
    ...baseOpenApiSpec,
    servers: [{ url: `${protocol}://${host}` }],
  };
}

export function registerOpenApiDocs(app: Express): void {
  app.get("/openapi.json", (req, res) => {
    res.json(buildOpenApiSpec(req));
  });

  app.get("/swagger", (_req, res) => {
    res.redirect(301, "/docs");
  });

  app.use(
    "/docs",
    swaggerUi.serve,
    (req: Request, res: Response, next: NextFunction) => {
      swaggerUi.setup(buildOpenApiSpec(req))(req, res, next);
    },
  );
}

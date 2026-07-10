import type { NextFunction, Request, Response } from "express";
import { describe, expect, it } from "vitest";
import { buildOpenApiSpec } from "./openapi-docs.lib";

function mockRequest(protocol: string, host: string): Pick<Request, "protocol" | "get"> {
  const req = {
    protocol,
    get(name: string): string | undefined {
      return name.toLowerCase() === "host" ? host : undefined;
    },
  };
  return req as Pick<Request, "protocol" | "get">;
}

describe("buildOpenApiSpec", () => {
  it("sets servers URL from request host", () => {
    const spec = buildOpenApiSpec(mockRequest("http", "127.0.0.1:8787"));
    expect(spec.servers).toEqual([{ url: "http://127.0.0.1:8787" }]);
  });

  it("includes mail and calendar paths from the contract", () => {
    const spec = buildOpenApiSpec(mockRequest("http", "localhost:8787"));
    const paths = spec.paths as Record<string, unknown>;
    expect(paths["/v1/mail/session"]).toBeDefined();
    expect(paths["/v1/calendar/events"]).toBeDefined();
    expect(paths["/health"]).toBeDefined();
  });
});

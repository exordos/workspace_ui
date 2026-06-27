import { describe, expect, it } from "vitest";
import {
  buildMessengerBearerAuthHeader,
  getMessengerBearerAuthValue,
  getMessengerWebSocketBearerProtocol,
} from "./messenger-auth";

// Messenger auth tests make sure Workspace uses bearer tokens, not Zulip Basic auth.
describe("messenger-auth", () => {
  it("builds a REST Bearer authorization header", () => {
    expect(buildMessengerBearerAuthHeader("access-token")).toEqual({
      Authorization: "Bearer access-token",
    });
  });

  it("trims bearer tokens before building headers", () => {
    expect(getMessengerBearerAuthValue("  access-token  ")).toBe("Bearer access-token");
  });

  it("does not emit Basic auth for Workspace messenger requests", () => {
    expect(buildMessengerBearerAuthHeader("user@example.com:api-key")).toEqual({
      Authorization: "Bearer user@example.com:api-key",
    });
  });

  it("returns an empty header object for missing tokens", () => {
    expect(buildMessengerBearerAuthHeader(null)).toEqual({});
    expect(buildMessengerBearerAuthHeader(undefined)).toEqual({});
    expect(buildMessengerBearerAuthHeader("   ")).toEqual({});
  });

  it("builds the WebSocket bearer subprotocol token", () => {
    expect(getMessengerWebSocketBearerProtocol("access-token")).toBe("bearer.access-token");
  });

  it("returns null WebSocket protocol for missing tokens", () => {
    expect(getMessengerWebSocketBearerProtocol(null)).toBeNull();
    expect(getMessengerWebSocketBearerProtocol("")).toBeNull();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import {
  clearAllMailSessions,
  createMailSession,
  deleteMailSession,
  getMailSession,
  parseBearerToken,
} from "./session.lib";

describe("mail-session.lib", () => {
  afterEach(() => {
    clearAllMailSessions();
  });

  it("creates and retrieves session by token", () => {
    const session = createMailSession("user@example.com", "pass");
    const found = getMailSession(session.token);
    expect(found?.email).toBe("user@example.com");
  });

  it("deletes session", () => {
    const session = createMailSession("user@example.com", "pass");
    deleteMailSession(session.token);
    expect(getMailSession(session.token)).toBeNull();
  });

  it("parses bearer token", () => {
    expect(parseBearerToken("Bearer abc-123")).toBe("abc-123");
    expect(parseBearerToken("Basic x")).toBeNull();
  });
});

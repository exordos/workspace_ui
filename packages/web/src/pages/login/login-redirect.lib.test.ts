import { describe, expect, it } from "vitest";
import {
  resolveWorkspaceLoginRedirect,
  sanitizeInternalRedirectTarget,
} from "./login-redirect.lib";

describe("message login redirect", () => {
  it("preserves a message target even when login selected a different account", () => {
    const target = "/org/target/project/project/message/message";
    expect(
      resolveWorkspaceLoginRedirect({
        redirectTarget: target,
        organizationId: "other",
        projectId: "other",
      }),
    ).toBe(target);
  });
  it("rejects external and browser-normalized external redirects", () => {
    for (const value of [
      "https://external.test",
      "//external.test",
      "/\\external.test",
      "/\n/external.test",
    ]) {
      expect(sanitizeInternalRedirectTarget(value)).toBeNull();
    }
    expect(sanitizeInternalRedirectTarget("/org/org/project/project/message/message")).toBe(
      "/org/org/project/project/message/message",
    );
  });
});

import { describe, expect, it } from "vitest";
import { buildWorkspaceUserMentionMarkdown } from "./workspace-user-mention.lib";

describe("buildWorkspaceUserMentionMarkdown", () => {
  it("builds the canonical user URN markdown link", () => {
    expect(
      buildWorkspaceUserMentionMarkdown("Jane [Ops]", "11111111-1111-4111-8111-111111111111"),
    ).toBe("[Jane \\[Ops\\]](urn:user:11111111-1111-4111-8111-111111111111)");
  });

  it("rejects a legacy numeric user id", () => {
    expect(() => buildWorkspaceUserMentionMarkdown("Jane", "42")).toThrow();
  });
});

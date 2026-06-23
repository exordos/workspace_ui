import { describe, expect, it } from "vitest";
import { isTopicRenameUnchanged, resolveRenamedTopicName } from "./rename-stream-topic.lib";

describe("rename-stream-topic.lib", () => {
  it("returns null for empty input", () => {
    expect(resolveRenamedTopicName("incident", "   ")).toBeNull();
  });

  it("renames unresolved topic as plain text", () => {
    expect(resolveRenamedTopicName("incident", "postmortem")).toBe("postmortem");
  });

  it("does not encode done state into renamed topic names", () => {
    expect(resolveRenamedTopicName("incident", "postmortem")).toBe("postmortem");
  });

  it("detects unchanged rename", () => {
    expect(isTopicRenameUnchanged("incident", "incident")).toBe(true);
    expect(isTopicRenameUnchanged("incident", "postmortem")).toBe(false);
  });
});

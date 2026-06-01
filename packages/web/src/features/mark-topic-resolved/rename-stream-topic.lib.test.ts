import { describe, expect, it } from "vitest";
import { TOPIC_RESOLVED_MARKER } from "~/shared/lib/topic-resolve";
import { isTopicRenameUnchanged, resolveRenamedTopicName } from "./rename-stream-topic.lib";

describe("rename-stream-topic.lib", () => {
  it("returns null for empty input", () => {
    expect(resolveRenamedTopicName("incident", "   ")).toBeNull();
  });

  it("renames unresolved topic as plain text", () => {
    expect(resolveRenamedTopicName("incident", "postmortem")).toBe("postmortem");
  });

  it("keeps resolved marker when renaming resolved topic", () => {
    const resolved = `${TOPIC_RESOLVED_MARKER} incident`;
    expect(resolveRenamedTopicName(resolved, "postmortem")).toBe(
      `${TOPIC_RESOLVED_MARKER} postmortem`,
    );
  });

  it("detects unchanged rename", () => {
    expect(isTopicRenameUnchanged("incident", "incident")).toBe(true);
    expect(isTopicRenameUnchanged("incident", "postmortem")).toBe(false);
  });
});

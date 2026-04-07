import { describe, expect, it } from "vitest";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { isActivityMessagesSnapshotFresher } from "./activity-cache.lib";

function activityMessage(overrides: Partial<ZulipRawMessage> = {}): ZulipRawMessage {
  return {
    id: overrides.id ?? 1,
    sender_id: overrides.sender_id ?? 42,
    sender_full_name: overrides.sender_full_name ?? "Alice",
    content: overrides.content ?? "message",
    timestamp: overrides.timestamp ?? 100,
    display_recipient: overrides.display_recipient ?? "engineering",
    subject: overrides.subject ?? "general",
    type: overrides.type ?? "stream",
    stream_id: overrides.stream_id ?? 10,
    flags: overrides.flags ?? [],
    reactions: overrides.reactions ?? [],
  };
}

describe("isActivityMessagesSnapshotFresher", () => {
  it("returns true when candidate has newer timestamp", () => {
    const current = [activityMessage({ id: 10, timestamp: 100 })];
    const candidate = [activityMessage({ id: 11, timestamp: 200 })];

    expect(isActivityMessagesSnapshotFresher(candidate, current)).toBe(true);
  });

  it("returns true when timestamp is equal but candidate has higher max message id", () => {
    const current = [activityMessage({ id: 100, timestamp: 200 })];
    const candidate = [activityMessage({ id: 101, timestamp: 200 })];

    expect(isActivityMessagesSnapshotFresher(candidate, current)).toBe(true);
  });

  it("returns false when candidate is not fresher", () => {
    const current = [activityMessage({ id: 101, timestamp: 200 })];
    const candidate = [activityMessage({ id: 100, timestamp: 200 })];

    expect(isActivityMessagesSnapshotFresher(candidate, current)).toBe(false);
  });
});

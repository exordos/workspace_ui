import { describe, expect, it } from "vitest";
import { resolveActiveTopicTitle } from "./layout-unread-title.hook";

describe("resolveActiveTopicTitle", () => {
  it("resolves UUID route segment to server topic display name", () => {
    const topicUuid = "90dde7a2-0204-4c72-a759-5f3bf80033df";
    const streamEntry = {
      name: "Alice Smith",
      topics: new Map([[topicUuid, { subject: "General Chat", topicUuid }]]),
    };

    expect(resolveActiveTopicTitle(topicUuid, streamEntry)).toBe("General Chat");
  });

  it("falls back to decoded route topic when metadata is missing", () => {
    expect(resolveActiveTopicTitle("General%20Chat", undefined)).toBe("General Chat");
  });
});

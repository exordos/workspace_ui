import { describe, expect, it } from "vitest";
import { resolveZulipStreamReference } from "./message-zulip-stream-ref.lib";

describe("resolveZulipStreamReference", () => {
  it("falls back to Inbox for stream ref resolved only by Zulip numeric id", () => {
    const result = resolveZulipStreamReference("Engineering", (streamName) =>
      streamName === "Engineering" ? { streamId: 10, streamName } : null,
    );

    expect(result).toEqual({
      href: "/inbox",
      htmlClass: "stream",
      text: "#Engineering",
    });
  });

  it("falls back to Inbox for topic ref when stream is unknown", () => {
    const result = resolveZulipStreamReference("Unknown>Bugs", () => null);

    expect(result).toEqual({
      href: "/inbox",
      htmlClass: "stream-topic",
      text: "#Unknown>Bugs",
    });
  });

  it("falls back to Inbox for message ref when stream is unknown", () => {
    const result = resolveZulipStreamReference("Unknown>Bugs@12345", () => null);

    expect(result).toEqual({
      href: "/inbox",
      htmlClass: "message-link",
      text: "#Unknown>Bugs@12345",
    });
  });

  it("falls back to Inbox for resolved topic message ref without Workspace message UUID", () => {
    const result = resolveZulipStreamReference("Engineering>Bugs@12345", (streamName) =>
      streamName === "Engineering" ? { streamId: 10, streamName } : null,
    );

    expect(result).toEqual({
      href: "/inbox",
      htmlClass: "message-link",
      text: "#Engineering>Bugs@12345",
    });
  });
});

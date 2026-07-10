import { describe, expect, it } from "vitest";
import { resolveZulipStreamReference } from "./message-zulip-stream-ref.lib";

describe("resolveZulipStreamReference", () => {
  it("keeps a stream reference as non-clickable text", () => {
    const result = resolveZulipStreamReference("Engineering", (streamName) =>
      streamName === "Engineering" ? { streamId: 10, streamName } : null,
    );

    expect(result).toEqual({
      htmlClass: "stream",
      text: "#Engineering",
    });
  });

  it("keeps a topic reference as non-clickable text", () => {
    const result = resolveZulipStreamReference("Unknown>Bugs", () => null);

    expect(result).toEqual({
      htmlClass: "stream-topic",
      text: "#Unknown>Bugs",
    });
  });

  it("keeps an unresolved message reference as non-clickable text", () => {
    const result = resolveZulipStreamReference("Unknown>Bugs@12345", () => null);

    expect(result).toEqual({
      htmlClass: "message-link",
      text: "#Unknown>Bugs@12345",
    });
  });

  it("does not build a Zulip narrow message link for a resolved stream", () => {
    const result = resolveZulipStreamReference("Engineering>Bugs@12345", (streamName) =>
      streamName === "Engineering" ? { streamId: 10, streamName } : null,
    );

    expect(result).toEqual({
      htmlClass: "message-link",
      text: "#Engineering>Bugs@12345",
    });
  });
});

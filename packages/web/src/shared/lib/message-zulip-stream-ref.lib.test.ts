import { describe, expect, it } from "vitest";
import { resolveZulipStreamReference } from "./message-zulip-stream-ref.lib";

describe("resolveZulipStreamReference", () => {
  it("resolves stream ref to canonical internal stream route", () => {
    const result = resolveZulipStreamReference("Engineering", (streamName) =>
      streamName === "Engineering" ? { streamId: 10, streamName } : null,
    );

    expect(result).toEqual({
      href: "/stream/10-engineering",
      htmlClass: "stream",
      text: "#Engineering",
    });
  });

  it("resolves topic ref to name-route when stream is unknown", () => {
    const result = resolveZulipStreamReference("Unknown>Bugs", () => null);

    expect(result).toEqual({
      href: "/stream/Unknown/topic/Bugs",
      htmlClass: "stream-topic",
      text: "#Unknown>Bugs",
    });
  });

  it("falls back to internal message route when stream is unknown", () => {
    const result = resolveZulipStreamReference("Unknown>Bugs@12345", () => null);

    expect(result).toEqual({
      href: "/message/12345",
      htmlClass: "message-link",
      text: "#Unknown>Bugs@12345",
    });
  });

  it("builds zulip narrow href for resolved topic message ref", () => {
    const result = resolveZulipStreamReference("Engineering>Bugs@12345", (streamName) =>
      streamName === "Engineering" ? { streamId: 10, streamName } : null,
    );

    expect(result).toEqual({
      href: "#narrow/channel/10-Engineering/topic/Bugs/near/12345",
      htmlClass: "message-link",
      text: "#Engineering>Bugs@12345",
    });
  });
});

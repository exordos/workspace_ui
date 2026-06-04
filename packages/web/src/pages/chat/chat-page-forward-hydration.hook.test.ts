import { describe, expect, it } from "vitest";
import { readFallbackContextFromCurrentChat } from "~/entities/chat-list/chat-list-apply-read-decrement.lib";

/**
 * Characterization tests for chat-page-forward-hydration hook behavior
 * without importing the full zulip-messages dependency graph (OOM in Vitest).
 */
describe("chat-page-forward-hydration (characterization)", () => {
  it("documents forward hydration resolves stream context for open chat", () => {
    const context = readFallbackContextFromCurrentChat({
      type: "stream",
      streamId: 10,
      streamName: "general",
      topic: "bugs",
    });
    expect(context).toEqual({ type: "stream", streamId: 10, topic: "bugs" });
  });
});

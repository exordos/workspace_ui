import { describe, expect, it } from "vitest";
import { buildReadFallbackContext } from "./chat-page.lib";

/**
 * Characterization tests for chat-page-forward-hydration hook behavior
 * without importing the full messenger-messages dependency graph (OOM in Vitest).
 */
describe("chat-page-forward-hydration (characterization)", () => {
  it("documents forward hydration resolves stream context for open chat", () => {
    const context = buildReadFallbackContext({
      isDmView: false,
      activeDmUserIds: null,
      currentUserId: 7,
      activeStreamId: "11111111-1111-4111-8111-111111111111",
      activeTopic: "bugs",
    });
    expect(context).toEqual({
      type: "stream",
      streamId: "11111111-1111-4111-8111-111111111111",
      topic: "bugs",
    });
  });
});

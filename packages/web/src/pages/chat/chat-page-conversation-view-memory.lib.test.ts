/**
 * The memory that lets a revisited conversation skip the first-visit wait.
 * It has to survive the chat page being rebuilt on every navigation, forget in
 * bounded fashion, and forget completely on an owner switch.
 */
import { beforeEach, describe, expect, it } from "vitest";
import type { MessengerConversationId } from "~/entities/messenger/messenger.types";
import {
  hasConversationBeenViewed,
  markConversationViewed,
  resetConversationViewMemory,
  setConversationViewMemoryOwner,
} from "./chat-page-conversation-view-memory.lib";

const OWNER = "owner-a";

function conversation(index: number): MessengerConversationId {
  return `topic:stream:${index}`;
}

describe("conversation view memory", () => {
  beforeEach(() => {
    resetConversationViewMemory();
    setConversationViewMemoryOwner(OWNER);
  });

  it("reports nothing for a conversation it has not seen", () => {
    expect(hasConversationBeenViewed(conversation(1))).toBe(false);
  });

  it("remembers a conversation that has been positioned", () => {
    markConversationViewed(conversation(1));
    expect(hasConversationBeenViewed(conversation(1))).toBe(true);
  });

  it("ignores a null conversation instead of remembering one", () => {
    markConversationViewed(null);
    expect(hasConversationBeenViewed(null)).toBe(false);
  });

  it("keeps what it knows when the same owner is set again", () => {
    markConversationViewed(conversation(1));
    setConversationViewMemoryOwner(OWNER);
    expect(hasConversationBeenViewed(conversation(1))).toBe(true);
  });

  it("drops the least recently used conversation past its bound", () => {
    for (let index = 0; index < 13; index += 1) {
      markConversationViewed(conversation(index));
    }

    expect(hasConversationBeenViewed(conversation(0))).toBe(false);
    expect(hasConversationBeenViewed(conversation(12))).toBe(true);
  });

  it("counts a repeat visit as use, so an actively revisited conversation is not evicted", () => {
    for (let index = 0; index < 12; index += 1) {
      markConversationViewed(conversation(index));
    }
    markConversationViewed(conversation(0));
    markConversationViewed(conversation(99));

    expect(hasConversationBeenViewed(conversation(0))).toBe(true);
    expect(hasConversationBeenViewed(conversation(1))).toBe(false);
  });

  it("forgets everything when the owner changes", () => {
    markConversationViewed(conversation(1));
    setConversationViewMemoryOwner("owner-b");
    expect(hasConversationBeenViewed(conversation(1))).toBe(false);
  });
});

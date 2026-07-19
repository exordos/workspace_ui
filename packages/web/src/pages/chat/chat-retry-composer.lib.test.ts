import { describe, expect, it } from "vitest";
import { testMessageId } from "~/test/factories";
import {
  buildChatComposerIdentity,
  shouldClearComposerAfterRetry,
} from "./chat-retry-composer.lib";

const file = new File(["retry"], "retry.txt", { type: "text/plain" });
const attempt = {
  composerIdentity: buildChatComposerIdentity({
    route: "/stream/engineering/topic/general",
    draftUuid: "00000000-0000-4000-8000-000000000007",
    editMessageId: null,
  }),
  draftUuid: "00000000-0000-4000-8000-000000000007",
  streamUuid: "00000000-0000-4000-8000-000000000010",
  topicUuid: "00000000-0000-4000-8000-000000000020",
  content: "same text",
  files: [file],
};

describe("retry composer identity", () => {
  it("accepts only the exact active draft identity and content", () => {
    expect(
      shouldClearComposerAfterRetry({
        attempt,
        currentComposerIdentity: attempt.composerIdentity,
        currentContent: "same text",
        isEditing: false,
      }),
    ).toBe(true);
  });

  it("rejects another same-text draft", () => {
    const otherIdentity = buildChatComposerIdentity({
      route: "/stream/engineering/topic/general",
      draftUuid: "00000000-0000-4000-8000-000000000008",
      editMessageId: null,
    });
    expect(
      shouldClearComposerAfterRetry({
        attempt,
        currentComposerIdentity: otherIdentity,
        currentContent: "same text",
        isEditing: false,
      }),
    ).toBe(false);
  });

  it("rejects an edit session even when text matches", () => {
    expect(
      shouldClearComposerAfterRetry({
        attempt,
        currentComposerIdentity: buildChatComposerIdentity({
          route: "/stream/engineering/topic/general",
          draftUuid: attempt.draftUuid,
          editMessageId: testMessageId(42),
        }),
        currentContent: "same text",
        isEditing: true,
      }),
    ).toBe(false);
  });
});

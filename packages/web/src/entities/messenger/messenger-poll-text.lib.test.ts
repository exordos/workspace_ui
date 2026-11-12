import { expect, it } from "vitest";
import { buildWorkspaceQuoteReference } from "~/shared/lib/workspace-message-quote.lib";
import { parseWorkspaceReferenceUrn } from "~/shared/lib/workspace-reference-urn.lib";
import { summarizeMessengerPoll } from "./messenger-poll-text.lib";
import type { MessengerPollPayload, MessengerPollState } from "./messenger.types";

it("keeps hidden counts private and preserves poll text as a plain quote snapshot", () => {
  const poll: MessengerPollPayload = {
    kind: "poll",
    questions: [
      {
        uuid: "q",
        text: "<Q> **bold**",
        options: [{ uuid: "o", text: "[choice](https://example.com)" }],
        correctOptionUuids: ["o"],
      },
    ],
    multipleAnswers: false,
    isAnonymous: true,
    allowRevote: false,
    resultsVisibility: "after_vote",
    allowAddingOptions: false,
    closesAt: null,
    closedAt: null,
  };
  const state: MessengerPollState = {
    revision: 1,
    isClosed: false,
    voterCount: 12,
    questions: [{ questionUuid: "q", voterCount: 12, optionCounts: { o: 12 } }],
    myVotes: [],
  };
  const text = summarizeMessengerPoll(poll, state);
  expect(text).toBe("<Q> **bold**\n• [choice](https://example.com)");
  const reference = buildWorkspaceQuoteReference({
    senderName: "Alice",
    messageUuid: "a93dca35-3061-4748-bda4-7f6f8c660ea5",
    selectedText: text,
  });
  const link = /^\[Alice\]\((.+)\)$/.exec(reference ?? "");
  expect(parseWorkspaceReferenceUrn(link?.[1])).toMatchObject({
    kind: "quote",
    messageUuid: "a93dca35-3061-4748-bda4-7f6f8c660ea5",
    text,
  });
  expect(
    summarizeMessengerPoll(poll, {
      ...state,
      myVotes: [{ questionUuid: "q", optionUuids: ["o"] }],
    }),
  ).toContain("(12)");
});

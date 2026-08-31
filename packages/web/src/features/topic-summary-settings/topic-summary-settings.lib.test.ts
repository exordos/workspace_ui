import { describe, expect, it } from "vitest";
import type { MessengerTopic } from "~/entities/messenger/messenger.types";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import {
  TOPIC_SUMMARY_CUSTOM_PROMPT_MAX_LENGTH,
  areTopicSummaryGatesEffective,
  diffTopicSummaryDraft,
  mapTopicSummaryOperationError,
  rebaseTopicSummaryDraft,
  rebaseTopicSummaryGatesDraft,
  topicSummaryDraftFromTopic,
  validateTopicSummaryDraft,
} from "./topic-summary-settings.lib";
import type {
  TopicSummaryGatesDraft,
  TopicSummaryTopicDraft,
} from "./topic-summary-settings.types";

function topic(overrides: Partial<MessengerTopic> = {}): MessengerTopic {
  return {
    uuid: "00000000-0000-4000-8000-000000000010",
    projectId: "00000000-0000-4000-8000-000000000001",
    streamUuid: "00000000-0000-4000-8000-000000000002",
    userUuid: "00000000-0000-4000-8000-000000000003",
    name: "Roadmap",
    unreadCount: 0,
    isDefault: false,
    isDone: false,
    notificationMode: "default",
    lastMessageUuid: null,
    summaryEnabled: true,
    summarySystemPrompt: null,
    summaryReasoningEffort: null,
    createdAt: "2026-08-21T10:00:00Z",
    updatedAt: "2026-08-21T10:00:00Z",
    ...overrides,
  };
}

describe("topic summary draft helpers", () => {
  it("uses backend defaults when optional topic fields are absent", () => {
    const source = topic();
    delete source.summaryEnabled;
    delete source.summarySystemPrompt;
    delete source.summaryReasoningEffort;

    expect(topicSummaryDraftFromTopic(source)).toEqual({
      summaryEnabled: true,
      summarySystemPrompt: null,
      summaryReasoningEffort: null,
    });
  });

  it("validates and trims a custom prompt before producing a minimal patch", () => {
    const base = topicSummaryDraftFromTopic(topic());
    const draft: TopicSummaryTopicDraft = {
      ...base,
      summarySystemPrompt: "  Focus on decisions.  ",
    };

    expect(validateTopicSummaryDraft(draft)).toBeNull();
    expect(diffTopicSummaryDraft(base, draft)).toEqual({
      summary_system_prompt: "Focus on decisions.",
    });
    expect(diffTopicSummaryDraft(base, { ...base, summaryReasoningEffort: "off" })).toEqual({
      summary_reasoning_effort: "off",
    });
    expect(validateTopicSummaryDraft({ ...draft, summarySystemPrompt: "   " })).toBe(
      "custom_prompt_empty",
    );
    expect(
      validateTopicSummaryDraft({
        ...draft,
        summarySystemPrompt: "x".repeat(TOPIC_SUMMARY_CUSTOM_PROMPT_MAX_LENGTH + 1),
      }),
    ).toBe("custom_prompt_too_long");
  });

  it("rebases untouched topic fields while preserving local edits", () => {
    const base: TopicSummaryTopicDraft = {
      summaryEnabled: true,
      summarySystemPrompt: null,
      summaryReasoningEffort: null,
    };
    const local = { ...base, summarySystemPrompt: "Local prompt" };
    const incoming: TopicSummaryTopicDraft = {
      summaryEnabled: false,
      summarySystemPrompt: "Remote prompt",
      summaryReasoningEffort: "high",
    };

    expect(rebaseTopicSummaryDraft(base, local, incoming)).toEqual({
      summaryEnabled: false,
      summarySystemPrompt: "Local prompt",
      summaryReasoningEffort: "high",
    });
  });
});

describe("topic summary gates helpers", () => {
  it("preserves dirty gates and adopts untouched fresh values", () => {
    const base: TopicSummaryGatesDraft = { globalEnabled: true, projectEnabled: true };
    const local: TopicSummaryGatesDraft = { globalEnabled: true, projectEnabled: false };
    const incoming: TopicSummaryGatesDraft = { globalEnabled: false, projectEnabled: true };

    expect(rebaseTopicSummaryGatesDraft(base, local, incoming)).toEqual({
      globalEnabled: false,
      projectEnabled: false,
    });
    expect(areTopicSummaryGatesEffective(incoming)).toBe(false);
  });

  it("maps validation, permission, transport and contract failures", () => {
    expect(mapTopicSummaryOperationError(new MessengerApiError("bad", 400, null))).toBe("invalid");
    expect(mapTopicSummaryOperationError(new MessengerApiError("no", 403, null))).toBe("forbidden");
    expect(mapTopicSummaryOperationError(new TypeError("network unavailable"))).toBe("network");
    expect(
      mapTopicSummaryOperationError(
        new TypeError("Expected valid topic summary settings response"),
      ),
    ).toBe("contract");
  });
});

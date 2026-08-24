import { describe, expect, it } from "vitest";
import type { WorkspaceTopicSummaryEndpointDto } from "~/shared/api/messenger-topic-summary-management.types";
import {
  emptyTopicSummaryEndpointDraft,
  normalizeTopicSummaryEndpointDraft,
  topicSummaryEndpointCreateBody,
  topicSummaryEndpointDraftFromDto,
  topicSummaryEndpointUpdateBody,
  validateTopicSummaryEndpointDraft,
} from "./topic-summary-endpoints.lib";
import type { TopicSummaryEndpointDraft } from "./topic-summary-endpoints.types";

const ENDPOINT_UUID = "e4ad6d80-6bc7-4a91-864c-8e97319a82bd";
const DATE = "2026-08-21T10:00:00Z";

function validDraft(overrides: Partial<TopicSummaryEndpointDraft> = {}): TopicSummaryEndpointDraft {
  return {
    ...emptyTopicSummaryEndpointDraft(ENDPOINT_UUID),
    name: "Primary",
    baseUrl: "https://llm.example.com/v1",
    model: "summary-model",
    apiKey: "secret",
    ...overrides,
  };
}

function endpointDto(
  overrides: Partial<WorkspaceTopicSummaryEndpointDto> = {},
): WorkspaceTopicSummaryEndpointDto {
  return {
    uuid: ENDPOINT_UUID,
    name: "Primary",
    base_url: "https://llm.example.com/v1",
    model: "summary-model",
    enabled: true,
    priority: 100,
    supports_vision: false,
    supports_reasoning: false,
    temperature: 0.2,
    max_output_tokens: 512,
    top_p: 1,
    presence_penalty: 0,
    frequency_penalty: 0,
    credential_present: true,
    claim_expires_at: null,
    last_success_at: null,
    last_failure_at: null,
    failure_count: 0,
    last_error_code: null,
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

describe("topic summary endpoint validation", () => {
  it("accepts backend boundary values", () => {
    expect(
      validateTopicSummaryEndpointDraft(
        validDraft({
          priority: 1_000_000,
          temperature: 2,
          maxOutputTokens: 32_768,
          topP: 0,
          presencePenalty: -2,
          frequencyPenalty: 2,
        }),
        "create",
      ),
    ).toEqual({});
  });

  it.each([
    ["name", "x".repeat(256), "too_long"],
    ["model", " ", "required"],
    ["baseUrl", "ftp://llm.example.com/v1", "invalid"],
    ["apiKey", "x".repeat(8193), "too_long"],
    ["priority", 1_000_001, "out_of_range"],
    ["priority", 1.5, "integer_required"],
    ["temperature", 2.01, "out_of_range"],
    ["maxOutputTokens", 0, "out_of_range"],
    ["topP", 1.01, "out_of_range"],
    ["presencePenalty", -2.01, "out_of_range"],
    ["frequencyPenalty", 2.01, "out_of_range"],
  ] as const)("rejects backend-invalid %s", (field, value, expected) => {
    expect(
      validateTopicSummaryEndpointDraft({ ...validDraft(), [field]: value }, "create")[field],
    ).toBe(expected);
  });

  it("requires credentials only on create", () => {
    expect(validateTopicSummaryEndpointDraft(validDraft({ apiKey: "" }), "create").apiKey).toBe(
      "required",
    );
    expect(validateTopicSummaryEndpointDraft(validDraft({ apiKey: "" }), "update").apiKey).toBe(
      undefined,
    );
  });

  it("normalizes backend-normalized strings in create bodies", () => {
    const draft = validDraft({
      name: "  Primary  ",
      baseUrl: " https://llm.example.com/v1/ ",
      model: " model-a ",
    });

    expect(normalizeTopicSummaryEndpointDraft(draft)).toMatchObject({
      name: "Primary",
      baseUrl: "https://llm.example.com/v1",
      model: "model-a",
    });
    expect(topicSummaryEndpointCreateBody(draft)).toMatchObject({
      name: "Primary",
      base_url: "https://llm.example.com/v1",
      model: "model-a",
      api_key: "secret",
    });
  });

  it("omits a blank write-only key from updates and includes an entered replacement", () => {
    const base = topicSummaryEndpointDraftFromDto(endpointDto());
    expect(topicSummaryEndpointUpdateBody(base, base)).toBeNull();
    expect(topicSummaryEndpointUpdateBody(base, { ...base, name: "Secondary" })).toEqual({
      name: "Secondary",
    });
    expect(topicSummaryEndpointUpdateBody(base, { ...base, apiKey: "replace" })).toEqual({
      api_key: "replace",
    });
  });
});

import { describe, expect, it, vi } from "vitest";
import {
  createTopicSummaryEndpoint,
  deleteTopicSummaryEndpoint,
  getTopicSummaryEndpoint,
  getTopicSummaryEndpoints,
  getTopicSummarySettings,
  updateTopicSummaryEndpoint,
  updateTopicSummarySettings,
} from "./messenger-topic-summary-management.api";
import {
  isWorkspaceTopicSummaryEndpointDto,
  isWorkspaceTopicSummarySettingsDto,
} from "./messenger-topic-summary-management.types";

const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const ENDPOINT_UUID = "e4ad6d80-6bc7-4a91-864c-8e97319a82bd";
const DATE = "2026-08-21T10:00:00Z";

const settingsDto = {
  project_id: PROJECT_UUID,
  global_enabled: false,
  project_enabled: true,
} as const;

const endpointDto = {
  uuid: ENDPOINT_UUID,
  name: "primary-summary-model",
  base_url: "https://llm.example.com/v1",
  model: "summary-model",
  enabled: true,
  priority: 10,
  supports_vision: true,
  supports_reasoning: true,
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
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? undefined : { "Content-Type": "application/json" },
  });
}

function createFetchMock(body: unknown, status = 200): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(body, status));
}

function options(fetchImpl: typeof fetch) {
  return { accessToken: "access-token", fetchImpl };
}

function firstFetchCall(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const call = fetchMock.mock.calls[0];
  if (call == null) throw new Error("Expected fetch to be called");
  return call;
}

describe("topic summary management API", () => {
  it("gets strict project settings from the project item path", async () => {
    const fetchMock = createFetchMock(settingsDto);

    await expect(getTopicSummarySettings(options(fetchMock), PROJECT_UUID)).resolves.toEqual(
      settingsDto,
    );

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(`/api/workspace/v1/messenger/topic_summary_settings/${PROJECT_UUID}`);
    expect(init?.method).toBe("GET");
  });

  it("puts both settings gates in one exact body", async () => {
    const updatedSettings = { ...settingsDto, global_enabled: true };
    const fetchMock = createFetchMock(updatedSettings);
    const body = { global_enabled: true, project_enabled: true };

    await expect(
      updateTopicSummarySettings(options(fetchMock), PROJECT_UUID, body),
    ).resolves.toEqual(updatedSettings);

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(`/api/workspace/v1/messenger/topic_summary_settings/${PROJECT_UUID}`);
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(JSON.stringify(body));
  });

  it("rejects malformed or expanded settings responses", () => {
    expect(isWorkspaceTopicSummarySettingsDto(settingsDto)).toBe(true);
    expect(isWorkspaceTopicSummarySettingsDto({ ...settingsDto, global_enabled: "true" })).toBe(
      false,
    );
    expect(isWorkspaceTopicSummarySettingsDto({ ...settingsDto, unexpected: true })).toBe(false);
  });

  it("lists endpoints with strict item parsing", async () => {
    const endpointWithoutNullableHealth = { ...endpointDto } as Record<string, unknown>;
    Reflect.deleteProperty(endpointWithoutNullableHealth, "claim_expires_at");
    Reflect.deleteProperty(endpointWithoutNullableHealth, "last_success_at");
    Reflect.deleteProperty(endpointWithoutNullableHealth, "last_failure_at");
    Reflect.deleteProperty(endpointWithoutNullableHealth, "last_error_code");
    const fetchMock = createFetchMock([endpointWithoutNullableHealth]);

    await expect(getTopicSummaryEndpoints(options(fetchMock))).resolves.toEqual([endpointDto]);
    expect(firstFetchCall(fetchMock)[0]).toBe(
      "/api/workspace/v1/messenger/topic_summary_endpoints/",
    );

    const invalidListMock = createFetchMock([
      endpointDto,
      { ...endpointDto, max_output_tokens: 32_769 },
    ]);
    await expect(getTopicSummaryEndpoints(options(invalidListMock))).rejects.toThrow(
      "Expected valid topic summary endpoints response item at index 1",
    );
  });

  it("gets one endpoint and rejects returned secrets or internal claim tokens", async () => {
    const fetchMock = createFetchMock(endpointDto);

    await expect(getTopicSummaryEndpoint(options(fetchMock), ENDPOINT_UUID)).resolves.toEqual(
      endpointDto,
    );
    expect(firstFetchCall(fetchMock)[0]).toBe(
      `/api/workspace/v1/messenger/topic_summary_endpoints/${ENDPOINT_UUID}`,
    );

    expect(isWorkspaceTopicSummaryEndpointDto({ ...endpointDto, api_key: "secret" })).toBe(false);
    expect(isWorkspaceTopicSummaryEndpointDto({ ...endpointDto, claim_token: ENDPOINT_UUID })).toBe(
      false,
    );
  });

  it("creates an endpoint with a write-only credential and all generation settings", async () => {
    const fetchMock = createFetchMock(endpointDto, 201);
    const body = {
      uuid: ENDPOINT_UUID,
      name: endpointDto.name,
      base_url: endpointDto.base_url,
      model: endpointDto.model,
      api_key: "secret",
      enabled: true,
      priority: 10,
      supports_vision: true,
      supports_reasoning: true,
      temperature: 0.2,
      max_output_tokens: 512,
      top_p: 1,
      presence_penalty: 0,
      frequency_penalty: 0,
    };

    await expect(createTopicSummaryEndpoint(options(fetchMock), body)).resolves.toEqual(
      endpointDto,
    );

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe("/api/workspace/v1/messenger/topic_summary_endpoints/");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify(body));
  });

  it("updates endpoint fields and preserves explicit numeric zeroes and credential replacement", async () => {
    const updatedEndpoint = {
      ...endpointDto,
      temperature: 0,
      top_p: 0,
      presence_penalty: -2,
      frequency_penalty: 2,
    };
    const responseWithoutLastError = { ...updatedEndpoint } as Record<string, unknown>;
    Reflect.deleteProperty(responseWithoutLastError, "last_error_code");
    const fetchMock = createFetchMock(responseWithoutLastError);
    const body = {
      api_key: "replace",
      temperature: 0,
      top_p: 0,
      presence_penalty: -2,
      frequency_penalty: 2,
    };

    await expect(
      updateTopicSummaryEndpoint(options(fetchMock), ENDPOINT_UUID, body),
    ).resolves.toEqual(updatedEndpoint);

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(`/api/workspace/v1/messenger/topic_summary_endpoints/${ENDPOINT_UUID}`);
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(JSON.stringify(body));
  });

  it("keeps malformed nullable health values invalid after response normalization", async () => {
    const fetchMock = createFetchMock([{ ...endpointDto, last_error_code: 5 }]);

    await expect(getTopicSummaryEndpoints(options(fetchMock))).rejects.toThrow(
      "Expected valid topic summary endpoints response item at index 0",
    );
  });

  it.each([
    ["priority", -1],
    ["priority", 1_000_001],
    ["temperature", 2.01],
    ["max_output_tokens", 0],
    ["max_output_tokens", 32_769],
    ["top_p", 1.01],
    ["presence_penalty", -2.01],
    ["frequency_penalty", 2.01],
    ["failure_count", -1],
  ])("rejects endpoint response %s outside its backend range", (field, value) => {
    expect(isWorkspaceTopicSummaryEndpointDto({ ...endpointDto, [field]: value })).toBe(false);
  });

  it.each([
    ["ftp://llm.example.com/v1"],
    ["https://user:secret@llm.example.com/v1"],
    ["https://llm.example.com/v1?tenant=one"],
    ["https://llm.example.com/v1#fragment"],
    ["https://llm.example.com/v1/"],
  ])("rejects a non-normalized or unsupported endpoint base URL %s", (baseUrl) => {
    expect(isWorkspaceTopicSummaryEndpointDto({ ...endpointDto, base_url: baseUrl })).toBe(false);
  });

  it("requires nullable health fields to be present and valid", () => {
    expect(isWorkspaceTopicSummaryEndpointDto(endpointDto)).toBe(true);
    expect(
      isWorkspaceTopicSummaryEndpointDto({
        ...endpointDto,
        claim_expires_at: DATE,
        last_success_at: DATE,
        last_failure_at: DATE,
        last_error_code: "http_503",
      }),
    ).toBe(true);
    const withoutHealthField: Record<string, unknown> = { ...endpointDto };
    Reflect.deleteProperty(withoutHealthField, "last_success_at");
    expect(isWorkspaceTopicSummaryEndpointDto(withoutHealthField)).toBe(false);
    expect(isWorkspaceTopicSummaryEndpointDto({ ...endpointDto, last_failure_at: 5 })).toBe(false);
  });

  it("accepts 204 endpoint deletion without parsing a body", async () => {
    const fetchMock = createFetchMock(null, 204);

    await expect(deleteTopicSummaryEndpoint(options(fetchMock), ENDPOINT_UUID)).resolves.toBe(
      undefined,
    );

    const [url, init] = firstFetchCall(fetchMock);
    expect(url).toBe(`/api/workspace/v1/messenger/topic_summary_endpoints/${ENDPOINT_UUID}`);
    expect(init?.method).toBe("DELETE");
  });
});

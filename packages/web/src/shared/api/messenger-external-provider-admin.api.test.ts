import { describe, expect, it, vi } from "vitest";
import {
  getExternalProviderHealth,
  getExternalProviderPolicy,
  resumeExternalProvider,
  suspendExternalProvider,
  updateExternalProviderPolicy,
} from "./messenger-external-provider-admin.api";
import { MessengerApiError } from "./messenger-transport.internal";

const policyDto = {
  uuid: "33333333-3333-4333-8333-333333333333",
  created_at: "2026-07-24T08:00:00Z",
  updated_at: "2026-07-24T09:00:00Z",
  revision: 3,
  provider: "zulip",
  enabled: true,
  emergency_suspended: false,
  limits: {
    max_accounts: 50,
    max_selected_chats_per_account: 500,
    max_file_bytes: 104_857_600,
  },
  custom_ca_bundle: null,
} as const;

const healthDto = {
  provider: "zulip",
  status: "healthy",
  account_counts: { live: 3 },
  chat_counts: { available: 19, live: 41 },
  bridge_counts: { active: 1 },
  operation_counts: { pending: 2 },
  metrics: {
    queue_depth: 2,
    selected_chats: 41,
    synchronized_messages: 9_586,
    synchronized_users: 25,
  },
  updated_at: "2026-07-24T09:00:00Z",
} as const;

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function options(fetchImpl: typeof fetch, signal?: AbortSignal) {
  return {
    accessToken: "access-token",
    baseUrl: "/api/workspace/v1/messenger",
    fetchImpl,
    signal,
  };
}

function firstCall(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const call = fetchMock.mock.calls[0];
  if (call == null) throw new Error("Expected fetch call");
  return call;
}

describe("messenger external provider admin API", () => {
  it("loads a policy snapshot only with the server ETag", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(policyDto, 200, { ETag: '"policy-3"' }));

    await expect(getExternalProviderPolicy(options(fetchMock))).resolves.toEqual({
      policy: policyDto,
      etag: '"policy-3"',
    });
    expect(firstCall(fetchMock)[0]).toBe(
      "/api/workspace/v1/messenger/external_provider_policies/zulip",
    );
    expect(firstCall(fetchMock)[1]?.method).toBe("GET");
  });

  it("rejects a policy response without a genuine ETag", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(policyDto));

    await expect(getExternalProviderPolicy(options(fetchMock))).rejects.toThrow("include ETag");
  });

  it("sends the complete settings body and If-Match on update", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse(policyDto, 200, { ETag: '"policy-4"' }));
    const body = {
      settings: {
        kind: "zulip",
        enabled: false,
        limits: policyDto.limits,
        custom_ca_bundle: null,
      },
    } as const;

    await expect(
      updateExternalProviderPolicy(options(fetchMock), body, '"policy-3"'),
    ).resolves.toEqual({
      policy: policyDto,
      etag: '"policy-4"',
    });

    const [, init] = firstCall(fetchMock);
    expect(init?.method).toBe("PUT");
    expect(init?.body).toBe(JSON.stringify(body));
    expect(new Headers(init?.headers).get("If-Match")).toBe('"policy-3"');
  });

  it.each([
    ["suspend", suspendExternalProvider],
    ["resume", resumeExternalProvider],
  ] as const)("invokes %s without If-Match", async (action, invoke) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(policyDto));

    await expect(invoke(options(fetchMock))).resolves.toEqual(policyDto);

    const [url, init] = firstCall(fetchMock);
    expect(url).toBe(
      `/api/workspace/v1/messenger/external_provider_policies/zulip/actions/${action}/invoke`,
    );
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).has("If-Match")).toBe(false);
  });

  it("loads health through the exact endpoint and propagates AbortSignal", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(healthDto));

    await expect(getExternalProviderHealth(options(fetchMock, controller.signal))).resolves.toEqual(
      healthDto,
    );

    const [url, init] = firstCall(fetchMock);
    expect(url).toBe("/api/workspace/v1/messenger/external_provider_health/zulip");
    expect(init?.signal).toBe(controller.signal);
  });

  it("keeps a valid health response when the backend adds an unknown field", async () => {
    const response = { ...healthDto, future_metric_group: { ready: 1 } };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(response));

    await expect(getExternalProviderHealth(options(fetchMock))).resolves.toEqual(response);
  });

  it.each([
    [403, "ExternalResourceForbiddenError"],
    [412, "ExternalPreconditionFailedError"],
  ] as const)("preserves typed backend error %s", async (status, type) => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ type, code: status, message: "Denied" }, status));

    const request =
      status === 403
        ? getExternalProviderPolicy(options(fetchMock))
        : updateExternalProviderPolicy(
            options(fetchMock),
            {
              settings: {
                kind: "zulip",
                enabled: false,
                limits: policyDto.limits,
                custom_ca_bundle: null,
              },
            },
            '"stale"',
          );

    const error = await request.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(MessengerApiError);
    expect(error).toMatchObject({
      status,
      data: { type, code: status, message: "Denied" },
    });
  });

  it("rejects malformed policy and health DTOs", async () => {
    const invalidPolicyMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        jsonResponse({ ...policyDto, provider: "slack" }, 200, { ETag: '"policy-3"' }),
      );
    await expect(getExternalProviderPolicy(options(invalidPolicyMock))).rejects.toBeInstanceOf(
      TypeError,
    );

    const invalidHealthMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ ...healthDto, metrics: { queue_depth: "2" } }));
    await expect(getExternalProviderHealth(options(invalidHealthMock))).rejects.toBeInstanceOf(
      TypeError,
    );
  });
});

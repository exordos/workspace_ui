import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type {
  WorkspaceTopicSummaryEndpointCreateRequestBody,
  WorkspaceTopicSummaryEndpointDto,
  WorkspaceTopicSummaryEndpointUpdateRequestBody,
} from "~/shared/api/messenger-topic-summary-management.types";
import type { MessengerClientOptions } from "~/shared/api/messenger-transport.internal";
import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import {
  useTopicSummaryEndpoints,
  type TopicSummaryEndpointsClient,
} from "./topic-summary-endpoints.hook";

const ENDPOINT_A = "e4ad6d80-6bc7-4a91-864c-8e97319a82bd";
const ENDPOINT_B = "7c74a1a2-61be-48d2-a69a-6f4d66244bc3";
const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const PROJECT_B = "33333333-3333-4333-8333-333333333333";
const DATE = "2026-08-21T10:00:00Z";

function runtime(projectId = PROJECT_A, runtimeGeneration = 1): WorkspaceRuntimeContext {
  return {
    accountId: `account-${projectId}`,
    instanceId: "instance-a",
    organizationId: "organization-a",
    organizationOrigin: "https://org-a.example.com",
    projectId,
    userUuid: "11111111-1111-4111-8111-111111111111",
    accessToken: `token-${projectId}-${runtimeGeneration}`,
    runtimeGeneration,
  };
}

function endpoint(
  overrides: Partial<WorkspaceTopicSummaryEndpointDto> = {},
): WorkspaceTopicSummaryEndpointDto {
  return {
    uuid: ENDPOINT_A,
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

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

async function renderReadyHook(client: TopicSummaryEndpointsClient) {
  const currentRuntime = runtime();
  const hook = renderHook(() =>
    useTopicSummaryEndpoints({
      open: true,
      runtimeContext: currentRuntime,
      permission: "allowed",
      getRuntimeContext: () => currentRuntime,
      createEndpointUuid: () => ENDPOINT_B,
      client,
    }),
  );
  await waitFor(() => expect(hook.result.current.loadStatus).toBe("ready"));
  return hook;
}

function fillCreateDraft(
  result: ReturnType<typeof useTopicSummaryEndpoints>,
  apiKey = "secret",
): void {
  result.startCreate();
  result.setCreateField("name", "Secondary");
  result.setCreateField("baseUrl", "https://secondary.example.com/v1");
  result.setCreateField("model", "model-b");
  result.setCreateField("apiKey", apiKey);
}

describe("useTopicSummaryEndpoints", () => {
  it("probes unknown permission on open and marks a successful list as allowed", async () => {
    const currentRuntime = runtime();
    const getEndpoints = vi.fn(() =>
      Promise.resolve([endpoint({ uuid: ENDPOINT_B, priority: 200 }), endpoint()]),
    );
    const { result } = renderHook(() =>
      useTopicSummaryEndpoints({
        open: true,
        runtimeContext: currentRuntime,
        permission: "unknown",
        getRuntimeContext: () => currentRuntime,
        client: { getEndpoints },
      }),
    );

    await waitFor(() => expect(result.current.loadStatus).toBe("ready"));
    expect(result.current.permission).toBe("allowed");
    expect(result.current.endpoints.map((item) => item.uuid)).toEqual([ENDPOINT_A, ENDPOINT_B]);
  });

  it("maps an endpoint-list 403 to denied access", async () => {
    const currentRuntime = runtime();
    const { result } = renderHook(() =>
      useTopicSummaryEndpoints({
        open: true,
        runtimeContext: currentRuntime,
        permission: "unknown",
        getRuntimeContext: () => currentRuntime,
        client: {
          getEndpoints: vi.fn(() => Promise.reject(new MessengerApiError("forbidden", 403, {}))),
        },
      }),
    );

    await waitFor(() => expect(result.current.permission).toBe("denied"));
    expect(result.current.loadStatus).toBe("error");
    expect(result.current.loadError).toBe("forbidden");
  });

  it("creates an endpoint, clears the write-only key immediately, and upserts the response", async () => {
    const request = deferred<WorkspaceTopicSummaryEndpointDto>();
    let sentBody: WorkspaceTopicSummaryEndpointCreateRequestBody | null = null;
    const client: TopicSummaryEndpointsClient = {
      getEndpoints: vi.fn().mockResolvedValue([endpoint()]),
      createEndpoint: vi.fn(
        (
          _options: MessengerClientOptions,
          body: WorkspaceTopicSummaryEndpointCreateRequestBody,
        ) => {
          sentBody = body;
          return request.promise;
        },
      ),
    };
    const { result } = await renderReadyHook(client);

    act(() => fillCreateDraft(result.current));
    act(() => result.current.createEndpoint());

    expect(sentBody).toMatchObject({
      uuid: ENDPOINT_B,
      name: "Secondary",
      api_key: "secret",
    });
    expect(result.current.create.status).toBe("pending");
    expect(result.current.create.draft?.apiKey).toBe("");

    request.resolve(endpoint({ uuid: ENDPOINT_B, name: "Secondary", priority: 200 }));
    await waitFor(() => expect(result.current.create.status).toBe("success"));
    expect(result.current.create.draft).toBeNull();
    expect(result.current.endpoints.map((item) => item.uuid)).toEqual([ENDPOINT_A, ENDPOINT_B]);
  });

  it("keeps a non-secret create draft retryable after a non-403 failure", async () => {
    const client: TopicSummaryEndpointsClient = {
      getEndpoints: vi.fn().mockResolvedValue([]),
      createEndpoint: vi.fn(() => Promise.reject(new MessengerApiError("unavailable", 503, {}))),
    };
    const { result } = await renderReadyHook(client);

    act(() => fillCreateDraft(result.current));
    act(() => result.current.createEndpoint());

    await waitFor(() => expect(result.current.create.status).toBe("error"));
    expect(result.current.permission).toBe("allowed");
    expect(result.current.create.error).toBe("server");
    expect(result.current.create.draft).toMatchObject({
      name: "Secondary",
      model: "model-b",
      apiKey: "",
    });
  });

  it("updates an endpoint without retaining a replacement key", async () => {
    const request = deferred<WorkspaceTopicSummaryEndpointDto>();
    let sentBody: WorkspaceTopicSummaryEndpointUpdateRequestBody | null = null;
    const client: TopicSummaryEndpointsClient = {
      getEndpoints: vi.fn().mockResolvedValue([endpoint()]),
      updateEndpoint: vi.fn(
        (
          _options: MessengerClientOptions,
          _endpointUuid: string,
          body: WorkspaceTopicSummaryEndpointUpdateRequestBody,
        ) => {
          sentBody = body;
          return request.promise;
        },
      ),
    };
    const { result } = await renderReadyHook(client);

    act(() => {
      result.current.startEdit(ENDPOINT_A);
      result.current.setEditField("name", "Renamed");
      result.current.setEditField("apiKey", "replace");
    });
    act(() => result.current.updateEndpoint());

    expect(sentBody).toEqual({ name: "Renamed", api_key: "replace" });
    expect(result.current.edit.draft?.apiKey).toBe("");
    request.resolve(endpoint({ name: "Renamed" }));
    await waitFor(() => expect(result.current.edit.status).toBe("success"));
    expect(result.current.edit.draft?.apiKey).toBe("");
    expect(result.current.endpoints[0]?.name).toBe("Renamed");
  });

  it("deletes an endpoint and tracks delete status separately", async () => {
    const client: TopicSummaryEndpointsClient = {
      getEndpoints: vi.fn().mockResolvedValue([endpoint()]),
      deleteEndpoint: vi.fn().mockResolvedValue(undefined),
    };
    const { result } = await renderReadyHook(client);

    act(() => result.current.deleteEndpoint(ENDPOINT_A));
    await waitFor(() => expect(result.current.remove.status).toBe("success"));
    expect(result.current.remove.endpointUuid).toBe(ENDPOINT_A);
    expect(result.current.endpoints).toEqual([]);
  });

  it("aborts list loading when the modal closes and ignores its late response", async () => {
    const currentRuntime = runtime();
    const request = deferred<WorkspaceTopicSummaryEndpointDto[]>();
    let signal: AbortSignal | undefined;
    const { result, rerender } = renderHook(
      ({ open }) =>
        useTopicSummaryEndpoints({
          open,
          runtimeContext: currentRuntime,
          permission: "unknown",
          getRuntimeContext: () => currentRuntime,
          client: {
            getEndpoints: vi.fn((options) => {
              signal = options.signal;
              return request.promise;
            }),
          },
        }),
      { initialProps: { open: true } },
    );
    await waitFor(() => expect(result.current.loadStatus).toBe("loading"));

    rerender({ open: false });
    expect(signal?.aborted).toBe(true);
    request.resolve([endpoint()]);
    await act(async () => request.promise);

    expect(result.current.loadStatus).toBe("idle");
    expect(result.current.endpoints).toEqual([]);
  });

  it("does not apply an old project response after a runtime switch", async () => {
    const oldRequest = deferred<WorkspaceTopicSummaryEndpointDto[]>();
    let currentRuntime = runtime(PROJECT_A, 1);
    const getEndpoints = vi.fn((options: MessengerClientOptions) =>
      options.projectId === PROJECT_A
        ? oldRequest.promise
        : Promise.resolve([endpoint({ uuid: ENDPOINT_B, name: "Project B" })]),
    );
    const { result, rerender } = renderHook(
      ({ context }) =>
        useTopicSummaryEndpoints({
          open: true,
          runtimeContext: context,
          permission: "unknown",
          getRuntimeContext: () => currentRuntime,
          client: { getEndpoints },
        }),
      { initialProps: { context: currentRuntime } },
    );

    currentRuntime = runtime(PROJECT_B, 2);
    rerender({ context: currentRuntime });
    await waitFor(() => expect(result.current.endpoints[0]?.name).toBe("Project B"));

    oldRequest.resolve([endpoint({ name: "Late project A" })]);
    await act(async () => oldRequest.promise);
    expect(result.current.endpoints[0]?.name).toBe("Project B");
  });
});

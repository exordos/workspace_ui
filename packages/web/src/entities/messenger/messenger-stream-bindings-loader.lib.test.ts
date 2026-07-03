import { beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import type {
  MessengerClientOptions,
  MessengerCollectionPage,
} from "~/shared/api/messenger-client";
import type { WorkspaceMessengerStreamBindingDto } from "~/shared/api/messenger.types";
import {
  clearMessengerStreamBindingsLoadRegistry,
  loadMessengerStreamBindings,
  streamUuidFromWorkspaceMessengerRoute,
} from "./messenger-stream-bindings-loader.lib";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStreamBinding } from "./messenger.types";

const ACCOUNT_A = "account-a";
const ACCOUNT_B = "account-b";
const INSTANCE_A = "instance-a";
const INSTANCE_B = "instance-b";
const ORGANIZATION_A = "organization-a";
const ORGANIZATION_B = "organization-b";
const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const PROJECT_B = "33333333-3333-4333-8333-333333333333";
const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "44444444-4444-4444-8444-444444444444";
const STREAM_A = "75309057-419c-4b12-a7c1-3932429ec4a6";
const STREAM_B = "37a28696-153d-431e-a5fb-36f0c0209765";
const BINDING_A = "dff7201e-5120-422d-ac5a-3cbe596dd71b";
const BINDING_B = "3ba0d6e2-b7cd-4e70-90f8-89b202f8d1e7";
const BINDING_C = "7c1ce67c-2ec3-4e1b-9380-458bd8c607f2";
const DATE = "2026-06-22T10:10:00Z";

function createRuntimeContext(
  overrides: Partial<WorkspaceRuntimeContext> = {},
): WorkspaceRuntimeContext {
  return {
    accountId: ACCOUNT_A,
    instanceId: INSTANCE_A,
    organizationId: ORGANIZATION_A,
    organizationOrigin: "https://org-a.example.com",
    projectId: PROJECT_A,
    userUuid: USER_A,
    accessToken: "access-token-a",
    runtimeGeneration: 1,
    ...overrides,
  };
}

function createStreamBindingDto(
  overrides: Partial<WorkspaceMessengerStreamBindingDto> = {},
): WorkspaceMessengerStreamBindingDto {
  return {
    uuid: BINDING_A,
    project_id: PROJECT_A,
    stream_uuid: STREAM_A,
    user_uuid: USER_A,
    who_uuid: USER_A,
    role: "member",
    notification_mode: "all_messages",
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createStreamBinding(
  overrides: Partial<MessengerStreamBinding> = {},
): MessengerStreamBinding {
  return {
    uuid: BINDING_A,
    projectId: PROJECT_A,
    streamUuid: STREAM_A,
    userUuid: USER_A,
    whoUuid: USER_A,
    role: "member",
    notificationMode: "all_messages",
    createdAt: DATE,
    updatedAt: DATE,
    ...overrides,
  };
}

function createStreamBindingsPage(
  items: WorkspaceMessengerStreamBindingDto[],
  nextPageMarker: string | null = null,
): MessengerCollectionPage<WorkspaceMessengerStreamBindingDto> {
  return {
    items,
    nextPageMarker,
    pageLimit: 100,
  };
}

type MessengerStreamBindingsPageMock = (
  options: MessengerClientOptions,
  query: {
    streamUuid: string;
    pageLimit?: number;
    pageMarker?: string | number;
  },
) => Promise<MessengerCollectionPage<WorkspaceMessengerStreamBindingDto>>;

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  let reject: (reason?: unknown) => void = () => undefined;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

function prepareStoreOwner(runtimeContext: WorkspaceRuntimeContext): string {
  const ownerKey = workspaceRuntimeOwnerKey(runtimeContext);
  const store = useMessengerStore.getState();
  store.startBootstrap(ownerKey);
  useMessengerStore.getState().replaceBootstrapState(ownerKey, {
    streams: [],
    streamBindings: [],
    topics: [],
    conversations: [],
    folders: [],
  });
  return ownerKey;
}

describe("messenger stream bindings loader", () => {
  beforeEach(() => {
    clearMessengerStreamBindingsLoadRegistry();
    useMessengerStore.getState().clear();
  });

  it("loads stream bindings through Workspace API and writes adapted bindings to the messenger store", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const getStreamBindingsPage = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve(
        createStreamBindingsPage([
          createStreamBindingDto(),
          createStreamBindingDto({
            uuid: BINDING_B,
            user_uuid: USER_B,
            who_uuid: USER_B,
            role: "administrator",
          }),
        ]),
      ),
    );
    const upsertStreamBindings = vi.fn();

    await expect(
      loadMessengerStreamBindings({
        runtimeContext,
        streamUuid: STREAM_A,
        getRuntimeContext: () => runtimeContext,
        client: { getStreamBindingsPage },
        cache: { upsertStreamBindings },
      }),
    ).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 2,
    });

    expect(getStreamBindingsPage).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: "access-token-a",
        devTargetOrigin: "https://org-a.example.com",
        projectId: PROJECT_A,
      }),
      { streamUuid: STREAM_A, pageLimit: 100, pageMarker: undefined },
    );
    expect(useMessengerStore.getState().streamBindingIdsByStreamId[STREAM_A]).toEqual([
      BINDING_A,
      BINDING_B,
    ]);
    expect(useMessengerStore.getState().streamBindingsLoadedByStreamId[STREAM_A]).toBe(true);
    expect(useMessengerStore.getState().streamBindingsById[BINDING_B]).toMatchObject({
      uuid: BINDING_B,
      streamUuid: STREAM_A,
      userUuid: USER_B,
      role: "administrator",
    });
    expect(upsertStreamBindings).toHaveBeenCalledWith(
      ownerKey,
      expect.arrayContaining([expect.objectContaining({ uuid: BINDING_A })]),
    );
  });

  it("loads every page of stream bindings before writing the stream as loaded", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    useMessengerStore.getState().upsertStreamBindings(ownerKey, [
      createStreamBinding({
        uuid: BINDING_C,
        userUuid: USER_B,
        whoUuid: USER_B,
      }),
    ]);
    const getStreamBindingsPage = vi
      .fn<MessengerStreamBindingsPageMock>()
      .mockResolvedValueOnce(createStreamBindingsPage([createStreamBindingDto()], "after-a"))
      .mockResolvedValueOnce(
        createStreamBindingsPage([
          createStreamBindingDto({
            uuid: BINDING_B,
            user_uuid: USER_B,
            who_uuid: USER_B,
            role: "administrator",
          }),
        ]),
      );
    const upsertStreamBindings = vi.fn();

    await expect(
      loadMessengerStreamBindings({
        runtimeContext,
        streamUuid: STREAM_A,
        getRuntimeContext: () => runtimeContext,
        client: { getStreamBindingsPage },
        cache: { upsertStreamBindings },
      }),
    ).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 2,
    });

    expect(getStreamBindingsPage).toHaveBeenNthCalledWith(1, expect.any(Object), {
      streamUuid: STREAM_A,
      pageLimit: 100,
      pageMarker: undefined,
    });
    expect(getStreamBindingsPage).toHaveBeenNthCalledWith(2, expect.any(Object), {
      streamUuid: STREAM_A,
      pageLimit: 100,
      pageMarker: "after-a",
    });
    expect(useMessengerStore.getState().streamBindingIdsByStreamId[STREAM_A]).toEqual([
      BINDING_A,
      BINDING_B,
    ]);
    expect(useMessengerStore.getState().streamBindingsById[BINDING_C]).toBeUndefined();
    expect(useMessengerStore.getState().streamBindingsLoadedByStreamId[STREAM_A]).toBe(true);
  });

  it("skips the request when bindings for this stream are already loaded", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    useMessengerStore.getState().upsertStreamBindings(ownerKey, [
      {
        uuid: BINDING_A,
        projectId: PROJECT_A,
        streamUuid: STREAM_A,
        userUuid: USER_A,
        whoUuid: USER_A,
        role: "member",
        notificationMode: "all_messages",
        createdAt: DATE,
        updatedAt: DATE,
      },
    ]);
    useMessengerStore.getState().markStreamBindingsLoaded(ownerKey, STREAM_A);
    const getStreamBindingsPage = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve(createStreamBindingsPage([createStreamBindingDto()])),
    );

    await expect(
      loadMessengerStreamBindings({
        runtimeContext,
        streamUuid: STREAM_A,
        getRuntimeContext: () => runtimeContext,
        client: { getStreamBindingsPage },
        cache: { upsertStreamBindings: vi.fn() },
      }),
    ).resolves.toEqual({
      status: "skipped",
      ownerKey,
      streamUuid: STREAM_A,
      reason: "already-loaded",
    });

    expect(getStreamBindingsPage).not.toHaveBeenCalled();
  });

  it("does not refetch after an empty backend response because the stream is marked as loaded", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    useMessengerStore.getState().upsertStreamBindings(ownerKey, [
      createStreamBinding(),
      createStreamBinding({
        uuid: BINDING_B,
        userUuid: USER_B,
        whoUuid: USER_B,
      }),
      createStreamBinding({
        uuid: BINDING_C,
        streamUuid: STREAM_B,
        userUuid: USER_B,
        whoUuid: USER_B,
      }),
    ]);
    const getStreamBindingsPage = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve(createStreamBindingsPage([])),
    );

    await expect(
      loadMessengerStreamBindings({
        runtimeContext,
        streamUuid: STREAM_A,
        getRuntimeContext: () => runtimeContext,
        client: { getStreamBindingsPage },
        cache: { upsertStreamBindings: vi.fn() },
      }),
    ).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 0,
    });
    await expect(
      loadMessengerStreamBindings({
        runtimeContext,
        streamUuid: STREAM_A,
        getRuntimeContext: () => runtimeContext,
        client: { getStreamBindingsPage },
        cache: { upsertStreamBindings: vi.fn() },
      }),
    ).resolves.toEqual({
      status: "skipped",
      ownerKey,
      streamUuid: STREAM_A,
      reason: "already-loaded",
    });

    const state = useMessengerStore.getState();
    expect(state.streamBindingsById[BINDING_A]).toBeUndefined();
    expect(state.streamBindingsById[BINDING_B]).toBeUndefined();
    expect(state.streamBindingsById[BINDING_C]).toMatchObject({ uuid: BINDING_C });
    expect(state.streamBindingIdsByStreamId[STREAM_A]).toEqual([]);
    expect(state.streamBindingIdsByStreamId[STREAM_B]).toEqual([BINDING_C]);
    expect(state.streamBindingsLoadedByStreamId[STREAM_A]).toBe(true);
    expect(getStreamBindingsPage).toHaveBeenCalledTimes(1);
  });

  it("refetches after the store is wiped instead of trusting the old loaded registry", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const getStreamBindingsPage = vi.fn((_options: MessengerClientOptions, _query: unknown) =>
      Promise.resolve(createStreamBindingsPage([createStreamBindingDto()])),
    );

    await expect(
      loadMessengerStreamBindings({
        runtimeContext,
        streamUuid: STREAM_A,
        getRuntimeContext: () => runtimeContext,
        client: { getStreamBindingsPage },
        cache: { upsertStreamBindings: vi.fn() },
      }),
    ).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 1,
    });

    useMessengerStore.getState().clear();
    prepareStoreOwner(runtimeContext);

    await expect(
      loadMessengerStreamBindings({
        runtimeContext,
        streamUuid: STREAM_A,
        getRuntimeContext: () => runtimeContext,
        client: { getStreamBindingsPage },
        cache: { upsertStreamBindings: vi.fn() },
      }),
    ).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 1,
    });

    expect(getStreamBindingsPage).toHaveBeenCalledTimes(2);
  });

  it("does not apply an old response after runtime owner changes", async () => {
    let currentContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(currentContext);
    useMessengerStore.getState().upsertStreamBindings(ownerKey, [
      createStreamBinding({
        uuid: BINDING_B,
        userUuid: USER_B,
        whoUuid: USER_B,
      }),
    ]);
    const bindingsRequest =
      createDeferred<MessengerCollectionPage<WorkspaceMessengerStreamBindingDto>>();
    const loading = loadMessengerStreamBindings({
      runtimeContext: currentContext,
      streamUuid: STREAM_A,
      getRuntimeContext: () => currentContext,
      client: { getStreamBindingsPage: () => bindingsRequest.promise },
      cache: { upsertStreamBindings: vi.fn() },
    });

    currentContext = createRuntimeContext({
      accountId: ACCOUNT_B,
      instanceId: INSTANCE_B,
      organizationId: ORGANIZATION_B,
      projectId: PROJECT_B,
      userUuid: USER_B,
      accessToken: "access-token-b",
      runtimeGeneration: 2,
    });
    bindingsRequest.resolve(createStreamBindingsPage([createStreamBindingDto()]));

    await expect(loading).resolves.toEqual({
      status: "skipped",
      ownerKey,
      streamUuid: STREAM_A,
      reason: "stale-owner",
    });
    expect(useMessengerStore.getState().streamBindingIdsByStreamId[STREAM_A]).toEqual([BINDING_B]);
    expect(useMessengerStore.getState().streamBindingsById[BINDING_B]).toMatchObject({
      uuid: BINDING_B,
    });
    expect(useMessengerStore.getState().streamBindingsLoadedByStreamId[STREAM_A]).toBeUndefined();
  });

  it("keeps a shared stream bindings request alive when an external caller signal is aborted", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const externalController = new AbortController();
    const bindingsRequest =
      createDeferred<MessengerCollectionPage<WorkspaceMessengerStreamBindingDto>>();
    const requestSignals: (AbortSignal | undefined)[] = [];
    const getStreamBindingsPage = vi.fn((options: MessengerClientOptions, _query: unknown) => {
      requestSignals.push(options.signal);
      return bindingsRequest.promise;
    });

    const firstLoad = loadMessengerStreamBindings({
      runtimeContext,
      streamUuid: STREAM_A,
      getRuntimeContext: () => runtimeContext,
      client: { getStreamBindingsPage },
      cache: { upsertStreamBindings: vi.fn() },
      signal: externalController.signal,
    });

    expect(getStreamBindingsPage).toHaveBeenCalledTimes(1);
    expect(requestSignals[0]).not.toBe(externalController.signal);

    externalController.abort();

    expect(requestSignals[0]?.aborted).toBe(false);

    const secondLoad = loadMessengerStreamBindings({
      runtimeContext,
      streamUuid: STREAM_A,
      getRuntimeContext: () => runtimeContext,
      client: { getStreamBindingsPage },
      cache: { upsertStreamBindings: vi.fn() },
    });

    bindingsRequest.resolve(createStreamBindingsPage([createStreamBindingDto()]));

    await expect(secondLoad).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 1,
    });
    await expect(firstLoad).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 1,
    });
    expect(getStreamBindingsPage).toHaveBeenCalledTimes(1);
    expect(useMessengerStore.getState().streamBindingIdsByStreamId[STREAM_A]).toEqual([BINDING_A]);
    expect(useMessengerStore.getState().streamBindingsLoadedByStreamId[STREAM_A]).toBe(true);
  });

  it("deduplicates parallel loads for the same runtime stream", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const bindingsRequest =
      createDeferred<MessengerCollectionPage<WorkspaceMessengerStreamBindingDto>>();
    const getStreamBindingsPage = vi.fn(
      (_options: MessengerClientOptions, _query: unknown) => bindingsRequest.promise,
    );

    const firstLoad = loadMessengerStreamBindings({
      runtimeContext,
      streamUuid: STREAM_A,
      getRuntimeContext: () => runtimeContext,
      client: { getStreamBindingsPage },
      cache: { upsertStreamBindings: vi.fn() },
    });
    const secondLoad = loadMessengerStreamBindings({
      runtimeContext,
      streamUuid: STREAM_A,
      getRuntimeContext: () => runtimeContext,
      client: { getStreamBindingsPage },
      cache: { upsertStreamBindings: vi.fn() },
    });

    bindingsRequest.resolve(createStreamBindingsPage([createStreamBindingDto()]));

    await expect(firstLoad).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 1,
    });
    await expect(secondLoad).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 1,
    });
    expect(getStreamBindingsPage).toHaveBeenCalledTimes(1);
  });

  it("aborts loader-owned in-flight requests when the stream bindings load registry is cleared", async () => {
    const runtimeContext = createRuntimeContext();
    const ownerKey = prepareStoreOwner(runtimeContext);
    const firstRequest =
      createDeferred<MessengerCollectionPage<WorkspaceMessengerStreamBindingDto>>();
    const secondRequest =
      createDeferred<MessengerCollectionPage<WorkspaceMessengerStreamBindingDto>>();
    const requestSignals: (AbortSignal | undefined)[] = [];
    const getStreamBindingsPage = vi.fn((options: MessengerClientOptions, _query: unknown) => {
      const request = requestSignals.length === 0 ? firstRequest : secondRequest;
      requestSignals.push(options.signal);
      options.signal?.addEventListener("abort", () => request.reject(new Error("aborted")), {
        once: true,
      });
      return request.promise;
    });

    const firstLoad = loadMessengerStreamBindings({
      runtimeContext,
      streamUuid: STREAM_A,
      getRuntimeContext: () => runtimeContext,
      client: { getStreamBindingsPage },
      cache: { upsertStreamBindings: vi.fn() },
    });

    expect(getStreamBindingsPage).toHaveBeenCalledTimes(1);
    expect(requestSignals[0]?.aborted).toBe(false);

    clearMessengerStreamBindingsLoadRegistry();

    expect(requestSignals[0]?.aborted).toBe(true);

    const secondLoad = loadMessengerStreamBindings({
      runtimeContext,
      streamUuid: STREAM_A,
      getRuntimeContext: () => runtimeContext,
      client: { getStreamBindingsPage },
      cache: { upsertStreamBindings: vi.fn() },
    });

    expect(getStreamBindingsPage).toHaveBeenCalledTimes(2);
    expect(requestSignals[1]?.aborted).toBe(false);

    await expect(firstLoad).resolves.toEqual({
      status: "skipped",
      ownerKey,
      streamUuid: STREAM_A,
      reason: "stale-owner",
    });

    const thirdLoad = loadMessengerStreamBindings({
      runtimeContext,
      streamUuid: STREAM_A,
      getRuntimeContext: () => runtimeContext,
      client: { getStreamBindingsPage },
      cache: { upsertStreamBindings: vi.fn() },
    });

    expect(getStreamBindingsPage).toHaveBeenCalledTimes(2);

    secondRequest.resolve(createStreamBindingsPage([createStreamBindingDto()]));

    await expect(secondLoad).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 1,
    });
    await expect(thirdLoad).resolves.toEqual({
      status: "loaded",
      ownerKey,
      streamUuid: STREAM_A,
      bindings: 1,
    });
    expect(useMessengerStore.getState().streamBindingIdsByStreamId[STREAM_A]).toEqual([BINDING_A]);
    expect(useMessengerStore.getState().streamBindingsLoadedByStreamId[STREAM_A]).toBe(true);
  });

  it("extracts stream uuid only from stream and topic routes", () => {
    expect(
      streamUuidFromWorkspaceMessengerRoute({
        kind: "stream",
        orgId: "org-a",
        projectId: PROJECT_A,
        streamUuid: STREAM_A,
      }),
    ).toBe(STREAM_A);
    expect(
      streamUuidFromWorkspaceMessengerRoute({
        kind: "topic",
        orgId: "org-a",
        projectId: PROJECT_A,
        streamUuid: STREAM_B,
        topicUuid: "topic-a",
      }),
    ).toBe(STREAM_B);
    expect(
      streamUuidFromWorkspaceMessengerRoute({
        kind: "message",
        orgId: "org-a",
        projectId: PROJECT_A,
        messageUuid: "message-a",
      }),
    ).toBeNull();
  });
});

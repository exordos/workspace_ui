import { afterEach, describe, expect, it, vi } from "vitest";

const messengerApi = vi.hoisted(() => ({
  getWithBase: vi.fn(),
  postJsonWithBase: vi.fn(),
  putJsonWithBase: vi.fn(),
  deleteWithBase: vi.fn(),
}));

vi.mock("~/shared/api/client", () => ({
  messengerApi,
  getMessengerWorkspaceApiBaseForCurrentInstance: vi.fn(() => "/api/workspace/v1/messenger"),
}));

function okResponse(data: unknown, etag?: string) {
  const headers = new Headers();
  if (etag != null) headers.set("ETag", etag);
  return {
    ok: true as const,
    status: 200,
    data,
    headers,
    raw: new Response(),
    durationMs: 10,
  };
}

function accountResponse(overrides: Record<string, unknown> = {}) {
  return {
    uuid: "account-1",
    settings: {
      kind: "zulip",
      server_url: "https://zulip.example.com",
      email: "alice@example.com",
      selection_mode: "explicit",
      history_depth: "30_days",
      default_project_id: "project-1",
    },
    credential_present: true,
    status: "live",
    live_ready: true,
    safe_error: null,
    capabilities: {
      "messenger.chat_catalog": { available: true, revision: 1, limits: {} },
    },
    desired_generation: 3,
    applied_generation: 3,
    last_progress_at: "2026-07-17T12:00:00Z",
    created_at: "2026-07-17T11:00:00Z",
    updated_at: "2026-07-17T12:00:00Z",
    ...overrides,
  };
}

describe("external accounts API", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads the Zulip account from provider-neutral collection and detail routes", async () => {
    messengerApi.getWithBase
      .mockResolvedValueOnce(okResponse([accountResponse()]))
      .mockResolvedValueOnce(okResponse(accountResponse(), '"7"'));

    const { fetchZulipExternalAccount } = await import("./external-accounts.api");
    const account = await fetchZulipExternalAccount();

    expect(account).toMatchObject({
      uuid: "account-1",
      credentialPresent: true,
      status: "live",
      liveReady: true,
      etag: '"7"',
      settings: {
        kind: "zulip",
        email: "alice@example.com",
        selectionMode: "explicit",
        historyDepth: "30_days",
      },
    });
    expect(account?.settings).not.toHaveProperty("apiKey");
    expect(messengerApi.getWithBase).toHaveBeenNthCalledWith(
      1,
      "/api/workspace/v1/messenger",
      "/external_accounts/",
      undefined,
      undefined,
    );
    expect(messengerApi.getWithBase).toHaveBeenNthCalledWith(
      2,
      "/api/workspace/v1/messenger",
      "/external_accounts/account-1",
      undefined,
      undefined,
    );
  });

  it("creates a Zulip account with write-only credentials", async () => {
    messengerApi.postJsonWithBase.mockResolvedValue(okResponse(accountResponse(), '"1"'));
    const { createZulipExternalAccount } = await import("./external-accounts.api");

    const result = await createZulipExternalAccount({
      uuid: "account-1",
      serverUrl: "https://zulip.example.com",
      email: "alice@example.com",
      apiKey: "testkey",
      selectionMode: "all",
      historyDepth: "7_days",
      defaultProjectId: "project-1",
    });

    expect(result.ok).toBe(true);
    expect(messengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      "/external_accounts/",
      {
        uuid: "account-1",
        settings: {
          kind: "zulip",
          server_url: "https://zulip.example.com",
          email: "alice@example.com",
          api_key: "testkey",
          selection_mode: "all",
          history_depth: "7_days",
          default_project_id: "project-1",
        },
      },
    );
    expect(result).not.toHaveProperty("value.settings.apiKey");
  });

  it("updates only mutable sync settings with If-Match", async () => {
    messengerApi.putJsonWithBase.mockResolvedValue(okResponse(accountResponse(), '"8"'));
    const { updateZulipExternalAccount } = await import("./external-accounts.api");

    await updateZulipExternalAccount({
      uuid: "account-1",
      etag: '"7"',
      selectionMode: "all",
      historyDepth: "90_days",
      defaultProjectId: "project-2",
    });

    expect(messengerApi.putJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      "/external_accounts/account-1",
      {
        settings: {
          kind: "zulip",
          selection_mode: "all",
          history_depth: "90_days",
          default_project_id: "project-2",
        },
      },
      { "If-Match": '"7"' },
    );
  });

  it("uses distinct reconnect, disconnect, and delete actions", async () => {
    messengerApi.postJsonWithBase.mockResolvedValue(okResponse(accountResponse()));
    messengerApi.deleteWithBase.mockResolvedValue(okResponse(null));
    const {
      deleteZulipExternalAccount,
      disconnectZulipExternalAccount,
      reconnectZulipExternalAccount,
    } = await import("./external-accounts.api");

    await reconnectZulipExternalAccount({
      uuid: "account-1",
      etag: '"7"',
      serverUrl: "https://zulip.example.com",
      email: "alice@example.com",
      apiKey: "newkey",
    });
    await disconnectZulipExternalAccount("account-1");
    await deleteZulipExternalAccount("account-1");

    expect(messengerApi.postJsonWithBase).toHaveBeenNthCalledWith(
      1,
      "/api/workspace/v1/messenger",
      "/external_accounts/account-1/actions/reconnect/invoke",
      {
        settings: {
          kind: "zulip",
          server_url: "https://zulip.example.com",
          email: "alice@example.com",
          api_key: "newkey",
        },
      },
      { "If-Match": '"7"' },
    );
    expect(messengerApi.postJsonWithBase).toHaveBeenNthCalledWith(
      2,
      "/api/workspace/v1/messenger",
      "/external_accounts/account-1/actions/disconnect/invoke",
      {},
    );
    expect(messengerApi.deleteWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      "/external_accounts/account-1",
    );
  });

  it("lists and selects or deselects external chats", async () => {
    const chat = {
      uuid: "chat-1",
      external_account_uuid: "account-1",
      source: {
        kind: "zulip",
        chat_type: "channel",
        original_url: "https://zulip.example.com/#narrow/channel/42",
      },
      display_name: "Engineering",
      selected: false,
      project_id: null,
      history_depth: "30_days",
      projection_stream_uuid: null,
      status: "available",
      safe_error: null,
      capabilities: {},
      revision: 1,
    };
    messengerApi.getWithBase.mockResolvedValue(okResponse([chat]));
    messengerApi.postJsonWithBase
      .mockResolvedValueOnce(okResponse({ ...chat, selected: true, project_id: "project-1" }))
      .mockResolvedValueOnce(okResponse(chat));
    const { deselectExternalChat, fetchExternalChats, selectExternalChat } =
      await import("./external-accounts.api");

    await expect(fetchExternalChats("account-1")).resolves.toMatchObject([
      { uuid: "chat-1", displayName: "Engineering", selected: false },
    ]);
    await selectExternalChat("chat-1", "project-1");
    await deselectExternalChat("chat-1");

    expect(messengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      "/external_chats/",
      { external_account_uuid: "account-1" },
      undefined,
    );
    expect(messengerApi.postJsonWithBase).toHaveBeenNthCalledWith(
      1,
      "/api/workspace/v1/messenger",
      "/external_chats/chat-1/actions/select/invoke",
      { project_id: "project-1" },
      undefined,
    );
    expect(messengerApi.postJsonWithBase).toHaveBeenNthCalledWith(
      2,
      "/api/workspace/v1/messenger",
      "/external_chats/chat-1/actions/deselect/invoke",
      {},
      undefined,
    );
  });

  it.each(["direct", "group_direct"] as const)(
    "preserves the backend %s chat type for projected Zulip DMs",
    async (chatType) => {
      const chat = {
        uuid: `chat-${chatType}`,
        external_account_uuid: "account-1",
        source: {
          kind: "zulip",
          chat_type: chatType,
          original_url: "https://zulip.example.com/#narrow/dm/1",
        },
        display_name: chatType === "direct" ? "Alice" : "Alice, Bob",
        selected: true,
        project_id: "project-1",
        history_depth: "30_days",
        projection_stream_uuid: `stream-${chatType}`,
        status: "projected",
        safe_error: null,
        capabilities: {},
        revision: 3,
      };
      messengerApi.getWithBase.mockResolvedValue(okResponse([chat]));
      const { fetchExternalChats } = await import("./external-accounts.api");

      await expect(fetchExternalChats("account-1")).resolves.toMatchObject([
        {
          uuid: `chat-${chatType}`,
          source: { chatType },
          projectionStreamUuid: `stream-${chatType}`,
        },
      ]);
    },
  );

  it.each(["personal", "group"])("rejects the legacy %s chat type", async (chatType) => {
    messengerApi.getWithBase.mockResolvedValue(
      okResponse([
        {
          uuid: "legacy-chat",
          external_account_uuid: "account-1",
          source: { kind: "zulip", chat_type: chatType },
          display_name: "Legacy DM",
          selected: true,
          project_id: "project-1",
          history_depth: "30_days",
          projection_stream_uuid: "stream-legacy",
          status: "projected",
          capabilities: {},
          revision: 1,
        },
      ]),
    );
    const { fetchExternalChats } = await import("./external-accounts.api");

    await expect(fetchExternalChats("account-1")).resolves.toEqual([]);
  });

  it("follows every standard page marker when listing external chats", async () => {
    const firstHeaders = new Headers({ "X-Pagination-Marker": "chat-1" });
    const baseChat = {
      external_account_uuid: "account-1",
      source: { kind: "zulip", chat_type: "channel", original_url: null },
      display_name: "Engineering",
      selected: false,
      project_id: null,
      history_depth: "30_days",
      projection_stream_uuid: null,
      status: "available",
      safe_error: null,
      capabilities: {},
      revision: 1,
    };
    messengerApi.getWithBase
      .mockResolvedValueOnce({
        ...okResponse([{ ...baseChat, uuid: "chat-1" }]),
        headers: firstHeaders,
      })
      .mockResolvedValueOnce(okResponse([{ ...baseChat, uuid: "chat-2" }]));
    const { fetchExternalChats } = await import("./external-accounts.api");

    await expect(fetchExternalChats("account-1")).resolves.toMatchObject([
      { uuid: "chat-1" },
      { uuid: "chat-2" },
    ]);
    expect(messengerApi.getWithBase).toHaveBeenNthCalledWith(
      2,
      "/api/workspace/v1/messenger",
      "/external_chats/",
      { external_account_uuid: "account-1", page_marker: "chat-1" },
      undefined,
    );
  });

  it("parses full-snapshot realtime updates without a REST request", async () => {
    const { parseExternalRealtimeUpdate } = await import("./external-accounts.api");

    expect(
      parseExternalRealtimeUpdate({
        kind: "external_account.updated",
        uuid: "account-1",
        snapshot: accountResponse({
          revision: 9,
          settings: {
            ...accountResponse().settings,
            selection_mode: "all",
          },
        }),
      }),
    ).toMatchObject({
      resource: "account",
      action: "upsert",
      value: { settings: { selectionMode: "all" }, etag: '"9"' },
    });
    expect(messengerApi.getWithBase).not.toHaveBeenCalled();
  });

  it("gets a fresh chat ETag before an atomic project move", async () => {
    const chat = {
      uuid: "chat-1",
      external_account_uuid: "account-1",
      source: { kind: "zulip", chat_type: "channel", original_url: null },
      display_name: "Engineering",
      selected: true,
      project_id: "project-1",
      history_depth: "30_days",
      projection_stream_uuid: "stream-1",
      status: "live",
      safe_error: null,
      capabilities: {},
      revision: 1,
    };
    messengerApi.getWithBase.mockResolvedValue(okResponse(chat, '"1"'));
    messengerApi.postJsonWithBase.mockResolvedValue(
      okResponse({ ...chat, project_id: "project-2", revision: 2 }, '"2"'),
    );
    const { moveExternalChat } = await import("./external-accounts.api");

    await expect(moveExternalChat("chat-1", "project-2")).resolves.toMatchObject({
      ok: true,
      value: { projectId: "project-2", etag: '"2"' },
    });
    expect(messengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      "/external_chats/chat-1/actions/move/invoke",
      { project_id: "project-2" },
      { "If-Match": '"1"' },
    );
  });

  it("uses the canonical nested target preflight request and structured loss response", async () => {
    messengerApi.postJsonWithBase.mockResolvedValue(
      okResponse({
        allowed: true,
        action: "messenger.message.edit",
        target: { type: "message", uuid: "message-1" },
        losses: [{ code: "formatting", message: "Formatting will be simplified." }],
        requires_confirmation: true,
      }),
    );
    const { preflightExternalOperation } = await import("./external-accounts.api");

    await expect(
      preflightExternalOperation({
        externalAccountUuid: "account-1",
        action: "messenger.message.edit",
        target: { type: "message", uuid: "message-1" },
      }),
    ).resolves.toEqual({
      ok: true,
      value: {
        allowed: true,
        action: "messenger.message.edit",
        target: { type: "message", uuid: "message-1" },
        losses: [{ code: "formatting", message: "Formatting will be simplified." }],
        requiresConfirmation: true,
      },
    });
    expect(messengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      "/external_operations/actions/preflight/invoke",
      {
        external_account_uuid: "account-1",
        action: "messenger.message.edit",
        target: { type: "message", uuid: "message-1" },
      },
    );
  });

  it("lists, retries, and discards external operations", async () => {
    const operation = {
      uuid: "operation-1",
      external_account_uuid: "account-1",
      action: "message.create",
      target_type: "message",
      target_uuid: "message-1",
      status: "failed",
      safe_error: "Provider unavailable",
      can_retry: true,
      can_discard: true,
      duplicate_risk: true,
      retry_requires_confirmation: true,
      original_url: "https://zulip.example.com/#narrow/channel/42",
      reconciliation_state: "manual_required",
      reconciliation_reason: "provider_history_unavailable",
      reconciliation_evidence: { checked_at: "2026-07-17T12:00:00Z" },
      attempt: 1,
      attempt_history: [],
      details: { kind: "zulip" },
      revision: 2,
    };
    messengerApi.getWithBase.mockResolvedValue(okResponse([operation]));
    messengerApi.postJsonWithBase.mockResolvedValue(
      okResponse({
        ...operation,
        status: "queued",
        reconciliation_state: "not_required",
        reconciliation_reason: null,
        can_retry: false,
      }),
    );
    messengerApi.deleteWithBase.mockResolvedValue(okResponse(null));
    const { discardExternalOperation, fetchExternalOperations, retryExternalOperation } =
      await import("./external-accounts.api");

    await expect(fetchExternalOperations("account-1")).resolves.toMatchObject([
      { uuid: "operation-1", status: "failed", canRetry: true, canDiscard: true },
    ]);
    await retryExternalOperation("operation-1", { confirmDuplicateRisk: true });
    await discardExternalOperation("operation-1");

    expect(messengerApi.getWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      "/external_operations/",
      { external_account_uuid: "account-1" },
      undefined,
    );
    expect(messengerApi.postJsonWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      "/external_operations/operation-1/actions/retry/invoke",
      { confirm_duplicate_risk: true },
    );
    expect(messengerApi.deleteWithBase).toHaveBeenCalledWith(
      "/api/workspace/v1/messenger",
      "/external_operations/operation-1",
    );
  });

  it("maps precondition failures without retrying a stale update", async () => {
    messengerApi.putJsonWithBase.mockResolvedValue({
      ...okResponse(null),
      ok: false,
      status: 428,
    });
    const { updateZulipExternalAccount } = await import("./external-accounts.api");

    await expect(
      updateZulipExternalAccount({
        uuid: "account-1",
        etag: '"7"',
        selectionMode: "explicit",
        historyDepth: "30_days",
        defaultProjectId: "project-1",
      }),
    ).resolves.toEqual({ ok: false, kind: "precondition" });
  });

  it("maps realm policy, aggregate health, and bridge instances from admin resources", async () => {
    messengerApi.getWithBase
      .mockResolvedValueOnce(
        okResponse(
          {
            provider: "zulip",
            enabled: true,
            emergency_suspended: false,
            limits: {
              max_accounts: 10,
              max_selected_chats_per_account: 100,
              max_file_bytes: 52428800,
            },
            custom_ca_bundle: null,
            revision: 2,
          },
          '"2"',
        ),
      )
      .mockResolvedValueOnce(
        okResponse({
          provider: "zulip",
          status: "healthy",
          account_counts: { live: 3 },
          bridge_counts: { active: 1 },
          operation_counts: { queued: 2 },
          metrics: { queue_depth: 2 },
          updated_at: "2026-07-17T12:00:00Z",
        }),
      )
      .mockResolvedValueOnce(
        okResponse([
          {
            uuid: "bridge-1",
            provider: "zulip",
            identity_generation: 4,
            status: "active",
            capabilities: {},
            last_heartbeat_at: "2026-07-17T12:00:00Z",
            certificate_not_after: "2026-08-16T12:00:00Z",
            safe_error: null,
            revision: 4,
          },
        ]),
      );
    const {
      fetchZulipExternalBridgeInstances,
      fetchZulipExternalProviderHealth,
      fetchZulipExternalProviderPolicy,
    } = await import("./external-accounts.api");

    await expect(fetchZulipExternalProviderPolicy()).resolves.toMatchObject({
      enabled: true,
      limits: { maxAccounts: 10, maxSelectedChatsPerAccount: 100 },
      etag: '"2"',
    });
    await expect(fetchZulipExternalProviderHealth()).resolves.toMatchObject({
      status: "healthy",
      accountCounts: { live: 3 },
    });
    await expect(fetchZulipExternalBridgeInstances()).resolves.toMatchObject([
      { uuid: "bridge-1", identityGeneration: 4, status: "active" },
    ]);
  });
});

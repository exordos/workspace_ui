import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "~/i18n/i18n";
import { renderWithProviders } from "~/test/render";
import { publishExternalAccountUpdated } from "./external-account-realtime.lib";
import { ZulipExternalAccountCard } from "./zulip-external-account.ui";
import type {
  ExternalChat,
  ExternalOperation,
  ZulipExternalAccount,
} from "./external-accounts.types";

const api = vi.hoisted(() => ({
  create: vi.fn(),
  remove: vi.fn(),
  deselectChat: vi.fn(),
  discardOperation: vi.fn(),
  disconnect: vi.fn(),
  fetchAccount: vi.fn(),
  fetchChats: vi.fn(),
  fetchOperations: vi.fn(),
  logRefreshFailure: vi.fn(),
  moveChat: vi.fn(),
  parseRealtime: vi.fn(),
  reconnect: vi.fn(),
  retryOperation: vi.fn(),
  selectChat: vi.fn(),
  update: vi.fn(),
}));

const cache = vi.hoisted(() => ({
  load: vi.fn(),
  persist: vi.fn(),
}));

vi.mock("./external-accounts.api", () => ({
  createZulipExternalAccount: api.create,
  deleteZulipExternalAccount: api.remove,
  deselectExternalChat: api.deselectChat,
  discardExternalOperation: api.discardOperation,
  disconnectZulipExternalAccount: api.disconnect,
  fetchExternalChats: api.fetchChats,
  fetchExternalOperations: api.fetchOperations,
  fetchZulipExternalAccount: api.fetchAccount,
  logExternalAccountRefreshFailure: api.logRefreshFailure,
  moveExternalChat: api.moveChat,
  parseExternalRealtimeUpdate: api.parseRealtime,
  reconnectZulipExternalAccount: api.reconnect,
  retryExternalOperation: api.retryOperation,
  selectExternalChat: api.selectChat,
  updateZulipExternalAccount: api.update,
}));

vi.mock("./external-accounts-cache.db", () => ({
  loadCurrentExternalAccountsSnapshot: cache.load,
  persistCurrentExternalAccountsSnapshot: cache.persist,
}));

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function account(overrides: Partial<ZulipExternalAccount> = {}): ZulipExternalAccount {
  return {
    uuid: "account-1",
    settings: {
      kind: "zulip",
      serverUrl: "https://zulip.example.com",
      email: "owner@example.com",
      selectionMode: "explicit",
      historyDepth: "30_days",
      defaultProjectId: "project-1",
    },
    credentialPresent: true,
    status: "live",
    liveReady: true,
    safeError: null,
    capabilities: {
      "messenger.chat_catalog": {
        available: true,
        revision: 1,
        limits: {},
      },
    },
    desiredGeneration: 1,
    appliedGeneration: 1,
    lastProgressAt: "2026-07-17T12:00:00Z",
    createdAt: "2026-07-17T11:00:00Z",
    updatedAt: "2026-07-17T12:00:00Z",
    etag: '"account-1-r1"',
    ...overrides,
  };
}

function chat(overrides: Partial<ExternalChat> = {}): ExternalChat {
  return {
    uuid: "chat-1",
    externalAccountUuid: "account-1",
    source: {
      kind: "zulip",
      chatType: "channel",
      originalUrl: "https://zulip.example.com/#narrow/channel/42",
    },
    displayName: "Engineering",
    selected: false,
    projectId: null,
    historyDepth: "30_days",
    projectionStreamUuid: null,
    status: "available",
    safeError: null,
    capabilities: {},
    revision: 1,
    etag: '"chat-1-r1"',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function operation(uuid: string, overrides: Partial<ExternalOperation> = {}): ExternalOperation {
  return {
    uuid,
    externalAccountUuid: "account-1",
    action: "messenger.message.send",
    targetType: "message",
    targetUuid: "message-1",
    status: "failed",
    safeError: "Provider is temporarily unavailable",
    canRetry: true,
    canDiscard: true,
    duplicateRisk: true,
    retryRequiresConfirmation: true,
    originalUrl: "https://zulip.example.com/#narrow/channel/42",
    reconciliationState: "manual_required",
    reconciliationReason: "provider_history_unavailable",
    reconciliationEvidence: {},
    attempt: 1,
    attemptHistory: [],
    details: { kind: "zulip" },
    revision: 1,
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe("ZulipExternalAccountCard", () => {
  beforeEach(() => {
    setLocale("en");
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchAccount.mockResolvedValue(null);
    api.fetchChats.mockResolvedValue([]);
    api.fetchOperations.mockResolvedValue([]);
    api.parseRealtime.mockReturnValue(null);
    cache.load.mockReset();
    cache.load.mockResolvedValue(null);
    cache.persist.mockReset();
    cache.persist.mockResolvedValue(undefined);
  });

  it("connects a write-only credential with selection and history settings (ZB-UI-001)", async () => {
    api.create.mockResolvedValue({ ok: true, value: account() });
    renderWithProviders(<ZulipExternalAccountCard />);

    await waitFor(() => expect(api.fetchAccount).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId("zulip-connect-open"));
    fireEvent.change(screen.getByTestId("zulip-server-url"), {
      target: { value: "https://zulip.example.com" },
    });
    fireEvent.change(screen.getByTestId("zulip-email"), {
      target: { value: "owner@example.com" },
    });
    fireEvent.change(screen.getByTestId("zulip-api-key"), {
      target: { value: "testkey" },
    });
    fireEvent.change(screen.getByTestId("zulip-selection-mode"), {
      target: { value: "all" },
    });
    fireEvent.change(screen.getByTestId("zulip-history-depth"), {
      target: { value: "7_days" },
    });
    fireEvent.click(screen.getByTestId("zulip-connect-submit"));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({
          serverUrl: "https://zulip.example.com",
          email: "owner@example.com",
          apiKey: "testkey",
          selectionMode: "all",
          historyDepth: "7_days",
        }),
      ),
    );
    expect(screen.queryByTestId("zulip-api-key")).not.toBeInTheDocument();
  });

  it("renders provider status popover without hydrating the credential and reconnects", async () => {
    api.fetchAccount.mockResolvedValue(account());
    api.reconnect.mockResolvedValue({ ok: true, value: account() });
    renderWithProviders(<ZulipExternalAccountCard />);

    await screen.findByTestId("zulip-provider-badge");
    fireEvent.click(screen.getByTestId("zulip-provider-badge"));
    expect(screen.getByTestId("zulip-provider-popover")).toHaveTextContent(
      "https://zulip.example.com",
    );
    fireEvent.click(screen.getByTestId("zulip-reconnect-open"));
    expect(screen.getByTestId("zulip-api-key")).toHaveValue("");
    fireEvent.change(screen.getByTestId("zulip-api-key"), {
      target: { value: "newkey" },
    });
    fireEvent.click(screen.getByTestId("zulip-reconnect-submit"));

    await waitFor(() =>
      expect(api.reconnect).toHaveBeenCalledWith({
        uuid: "account-1",
        etag: '"account-1-r1"',
        serverUrl: "https://zulip.example.com",
        email: "owner@example.com",
        apiKey: "newkey",
      }),
    );
  });

  it("replaces cached settings with the initial REST snapshot before editing", async () => {
    const cached = account({
      settings: {
        ...account().settings,
        serverUrl: "https://cached.example.com",
        email: "cached@example.com",
        historyDepth: "90_days",
      },
    });
    const fresh = account({
      settings: {
        ...account().settings,
        serverUrl: "https://fresh.example.com",
        email: "fresh@example.com",
        historyDepth: "7_days",
      },
      etag: '"account-1-r2"',
    });
    cache.load.mockResolvedValue({ account: cached, chats: [], operations: [] });
    api.fetchAccount.mockResolvedValue(fresh);

    renderWithProviders(<ZulipExternalAccountCard />);

    await waitFor(() =>
      expect(screen.getByTestId("zulip-provider-popover")).toHaveTextContent(
        "https://fresh.example.com",
      ),
    );
    fireEvent.click(screen.getByTestId("zulip-settings-open"));
    expect(screen.getByTestId("zulip-history-depth")).toHaveValue("7_days");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByTestId("zulip-reconnect-open"));
    expect(screen.getByTestId("zulip-server-url")).toHaveValue("https://fresh.example.com");
    expect(screen.getByTestId("zulip-email")).toHaveValue("fresh@example.com");
  });

  it("does not overwrite active edits when the initial REST snapshot arrives", async () => {
    const cached = account({ etag: '"account-1-r1"' });
    const fresh = account({
      settings: {
        ...account().settings,
        selectionMode: "explicit",
        historyDepth: "90_days",
        defaultProjectId: "fresh-project",
      },
      etag: '"account-1-r2"',
    });
    const initialRefresh = deferred<ZulipExternalAccount | null>();
    cache.load.mockResolvedValue({ account: cached, chats: [], operations: [] });
    api.fetchAccount.mockReturnValue(initialRefresh.promise);
    api.update.mockResolvedValue({ ok: true, value: fresh });

    renderWithProviders(<ZulipExternalAccountCard />);

    fireEvent.click(await screen.findByTestId("zulip-settings-open"));
    fireEvent.change(screen.getByTestId("zulip-selection-mode"), { target: { value: "all" } });
    fireEvent.change(screen.getByTestId("zulip-history-depth"), {
      target: { value: "7_days" },
    });
    fireEvent.change(screen.getByTestId("zulip-default-project"), {
      target: { value: "edited-project" },
    });

    initialRefresh.resolve(fresh);
    await waitFor(() =>
      expect(api.fetchChats).toHaveBeenCalledWith("account-1", expect.anything()),
    );
    expect(screen.getByTestId("zulip-selection-mode")).toHaveValue("all");
    expect(screen.getByTestId("zulip-history-depth")).toHaveValue("7_days");
    expect(screen.getByTestId("zulip-default-project")).toHaveValue("edited-project");

    fireEvent.click(screen.getByTestId("zulip-settings-save"));
    await waitFor(() =>
      expect(api.update).toHaveBeenCalledWith({
        uuid: "account-1",
        etag: '"account-1-r2"',
        selectionMode: "all",
        historyDepth: "7_days",
        defaultProjectId: "edited-project",
      }),
    );
  });

  it("does not let a late cache or failed REST refresh overwrite realtime state", async () => {
    const staleCached = account({
      settings: {
        ...account().settings,
        serverUrl: "https://cached.example.com",
        email: "cached@example.com",
      },
      etag: '"account-1-r1"',
    });
    const realtime = account({
      settings: {
        ...account().settings,
        serverUrl: "https://realtime.example.com",
        email: "realtime@example.com",
      },
      etag: '"account-1-r3"',
    });
    const cachedSnapshot = deferred<{
      account: ZulipExternalAccount | null;
      chats: ExternalChat[];
      operations: ExternalOperation[];
    } | null>();
    const restRefresh = deferred<ZulipExternalAccount | null>();
    cache.load.mockReturnValue(cachedSnapshot.promise);
    api.fetchAccount.mockReturnValue(restRefresh.promise);
    api.parseRealtime.mockReturnValue({
      resource: "account",
      action: "upsert",
      value: realtime,
    });

    renderWithProviders(<ZulipExternalAccountCard />);

    act(() => {
      publishExternalAccountUpdated({ kind: "external_account.updated" });
    });
    await waitFor(() =>
      expect(screen.getByTestId("zulip-provider-popover")).toHaveTextContent(
        "https://realtime.example.com",
      ),
    );

    await act(async () => {
      cachedSnapshot.resolve({ account: staleCached, chats: [], operations: [] });
      await cachedSnapshot.promise;
    });
    await waitFor(() => expect(api.fetchAccount).toHaveBeenCalledOnce());
    expect(screen.getByTestId("zulip-provider-popover")).not.toHaveTextContent(
      "https://cached.example.com",
    );

    await act(async () => {
      restRefresh.reject(new Error("refresh failed"));
      try {
        await restRefresh.promise;
      } catch {
        // The component observes and reports the refresh failure.
      }
    });
    await waitFor(() => expect(api.logRefreshFailure).toHaveBeenCalledOnce());
    expect(screen.getByTestId("zulip-provider-popover")).toHaveTextContent(
      "https://realtime.example.com",
    );
    expect(cache.persist).toHaveBeenCalledWith(expect.objectContaining({ account: realtime }));
  });

  it("gates notifications until initial synchronization is live-ready (ZB-UI-002)", async () => {
    api.fetchAccount.mockResolvedValue(
      account({ status: "backfill", liveReady: false, appliedGeneration: 0 }),
    );
    renderWithProviders(<ZulipExternalAccountCard />);

    expect(await screen.findByTestId("zulip-notification-gate")).toHaveTextContent(
      "Notifications are paused",
    );
  });

  it("selects an explicit chat into the configured project", async () => {
    const availableChat = chat();
    api.fetchAccount.mockResolvedValue(account());
    api.fetchChats.mockResolvedValue([availableChat]);
    api.selectChat.mockResolvedValue({ ok: true, value: chat({ selected: true }) });
    renderWithProviders(<ZulipExternalAccountCard />);

    fireEvent.click(await screen.findByTestId("external-chat-toggle-chat-1"));

    await waitFor(() => expect(api.selectChat).toHaveBeenCalledWith("chat-1", "project-1"));
    expect(screen.getByTestId("external-chat-toggle-chat-1")).toHaveTextContent("Deselect");
  });

  it("renders and projects direct and group-direct chats from the canonical catalog", async () => {
    const directChat = chat({
      uuid: "direct-chat",
      displayName: "Alice",
      source: {
        kind: "zulip",
        chatType: "direct",
        originalUrl: "https://zulip.example.com/#narrow/dm/1",
      },
    });
    const groupDirectChat = chat({
      uuid: "group-direct-chat",
      displayName: "Alice, Bob",
      source: {
        kind: "zulip",
        chatType: "group_direct",
        originalUrl: "https://zulip.example.com/#narrow/dm/2",
      },
    });
    api.fetchAccount.mockResolvedValue(account());
    api.fetchChats.mockResolvedValue([directChat, groupDirectChat]);
    api.selectChat.mockImplementation((uuid: string) =>
      Promise.resolve({
        ok: true,
        value: chat({
          ...(uuid === directChat.uuid ? directChat : groupDirectChat),
          selected: true,
          projectId: "project-1",
        }),
      }),
    );
    renderWithProviders(<ZulipExternalAccountCard />);

    expect(await screen.findByTestId("external-chat-direct-chat")).toHaveTextContent("Alice");
    expect(screen.getByTestId("external-chat-group-direct-chat")).toHaveTextContent("Alice, Bob");
    fireEvent.click(screen.getByTestId("external-chat-toggle-direct-chat"));
    fireEvent.click(screen.getByTestId("external-chat-toggle-group-direct-chat"));

    await waitFor(() => {
      expect(api.selectChat).toHaveBeenCalledWith("direct-chat", "project-1");
      expect(api.selectChat).toHaveBeenCalledWith("group-direct-chat", "project-1");
    });
  });

  it("moves a selected chat to another project with its current ETag", async () => {
    const selectedChat = chat({ selected: true, projectId: "project-1", etag: '"chat-r1"' });
    api.fetchAccount.mockResolvedValue(account());
    api.fetchChats.mockResolvedValue([selectedChat]);
    api.moveChat.mockResolvedValue({
      ok: true,
      value: chat({ selected: true, projectId: "project-2", etag: '"chat-r2"' }),
    });
    renderWithProviders(<ZulipExternalAccountCard />);

    fireEvent.click(await screen.findByTestId("external-chat-move-open-chat-1"));
    fireEvent.change(screen.getByTestId("external-chat-move-project-chat-1"), {
      target: { value: "project-2" },
    });
    fireEvent.click(screen.getByTestId("external-chat-move-submit-chat-1"));

    await waitFor(() =>
      expect(api.moveChat).toHaveBeenCalledWith("chat-1", "project-2", '"chat-r1"'),
    );
  });

  it("retries and discards eligible external operations", async () => {
    const retryable = operation("operation-retry", {
      status: "manual_reconciliation_required",
      canDiscard: false,
    });
    const discardable = operation("operation-discard", { canRetry: false });
    api.fetchAccount.mockResolvedValue(account());
    api.fetchOperations.mockResolvedValue([retryable, discardable]);
    api.retryOperation.mockResolvedValue({
      ok: true,
      value: operation("operation-retry", {
        status: "queued",
        reconciliationState: "not_required",
        reconciliationReason: null,
        canRetry: false,
      }),
    });
    api.discardOperation.mockResolvedValue({ ok: true, value: undefined });
    renderWithProviders(<ZulipExternalAccountCard />);

    expect(
      await screen.findByTestId("external-operation-manual-operation-retry"),
    ).toHaveTextContent("Manual reconciliation required");
    expect(screen.getByTestId("external-operation-original-operation-retry")).toHaveAttribute(
      "href",
      "https://zulip.example.com/#narrow/channel/42",
    );
    fireEvent.click(await screen.findByTestId("external-operation-retry-operation-retry"));
    expect(
      screen.getByTestId("external-operation-retry-confirmation-operation-retry"),
    ).toHaveTextContent("can create a duplicate");
    fireEvent.click(screen.getByTestId("external-operation-retry-confirm-operation-retry"));
    fireEvent.click(screen.getByTestId("external-operation-discard-operation-discard"));

    await waitFor(() =>
      expect(api.retryOperation).toHaveBeenCalledWith("operation-retry", {
        confirmDuplicateRisk: true,
      }),
    );
    await waitFor(() => expect(api.discardOperation).toHaveBeenCalledWith("operation-discard"));
    expect(screen.queryByTestId("external-operation-operation-discard")).not.toBeInTheDocument();
  });

  it("disconnects and deletes only after explicit destructive confirmation", async () => {
    api.fetchAccount.mockResolvedValue(account());
    api.disconnect.mockResolvedValue({
      ok: true,
      value: account({ status: "disconnected", liveReady: false }),
    });
    api.remove.mockResolvedValue({ ok: true, value: undefined });
    renderWithProviders(<ZulipExternalAccountCard />);

    fireEvent.click(await screen.findByTestId("zulip-disconnect"));
    await waitFor(() => expect(api.disconnect).toHaveBeenCalledWith("account-1"));
    fireEvent.click(screen.getByTestId("zulip-delete-open"));
    expect(screen.getByTestId("zulip-delete-confirmation")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("zulip-delete-confirm"));

    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("account-1"));
    expect(screen.queryByTestId("zulip-delete-open")).not.toBeInTheDocument();
  });

  it("applies a full-snapshot event and hydrates cross-device settings without refetching", async () => {
    api.fetchAccount.mockResolvedValue(account());
    const updated = account({
      settings: {
        ...account().settings,
        selectionMode: "all",
        historyDepth: "7_days",
      },
    });
    api.parseRealtime.mockReturnValue({ resource: "account", action: "upsert", value: updated });
    renderWithProviders(<ZulipExternalAccountCard />);
    await screen.findByTestId("zulip-provider-badge");
    const initialFetchCount = api.fetchAccount.mock.calls.length;

    window.dispatchEvent(
      new CustomEvent("workspace:external-account-updated", {
        detail: { kind: "external_account.updated", uuid: "account-1", snapshot: {} },
      }),
    );
    fireEvent.click(screen.getByTestId("zulip-settings-open"));

    await waitFor(() => expect(screen.getByTestId("zulip-selection-mode")).toHaveValue("all"));
    expect(screen.getByTestId("zulip-history-depth")).toHaveValue("7_days");
    expect(api.fetchAccount).toHaveBeenCalledTimes(initialFetchCount);
  });

  it("hides unsafe original provider links", async () => {
    api.fetchAccount.mockResolvedValue(account());
    api.fetchChats.mockResolvedValue([
      chat({ source: { ...chat().source, originalUrl: "data:text/html,x" } }),
    ]);
    api.fetchOperations.mockResolvedValue([
      operation("operation-unsafe", { originalUrl: ["java", "script:alert(1)"].join("") }),
    ]);
    renderWithProviders(<ZulipExternalAccountCard />);

    await screen.findByTestId("external-chat-chat-1");
    expect(screen.queryByTestId("external-chat-original-chat-1")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("external-operation-original-operation-unsafe"),
    ).not.toBeInTheDocument();
  });
});

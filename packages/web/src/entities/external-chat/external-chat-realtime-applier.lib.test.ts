import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceExternalChatDto } from "~/shared/api/messenger-external-chats.types";
import type { WorkspaceRealtimeEventContext } from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import { adaptWorkspaceExternalChatDto } from "./external-chat-adapters.lib";
import { createExternalChatRealtimeApplier } from "./external-chat-realtime-applier.lib";
import { useExternalChatsStore } from "./external-chat.model";

const OWNER_KEY = "owner-a";
const ACCOUNT_UUID = "20000000-0000-4000-8000-000000000002";
const OTHER_ACCOUNT_UUID = "30000000-0000-4000-8000-000000000003";
const CHAT_UUID = "10000000-0000-4000-8000-000000000001";
const PROJECT_UUID = "40000000-0000-4000-8000-000000000004";
const STREAM_UUID = "60000000-0000-4000-8000-000000000006";
const SCOPE_KEY = `${OWNER_KEY}:external-account:${ACCOUNT_UUID}`;

function snapshot(
  revision: number,
  externalAccountUuid = ACCOUNT_UUID,
  projectionStreamUuid: string | null = null,
): WorkspaceExternalChatDto {
  return {
    uuid: CHAT_UUID,
    external_account_uuid: externalAccountUuid,
    source: { kind: "zulip", chat_type: "channel" },
    display_name: `Support r${revision}`,
    selected: true,
    project_id: PROJECT_UUID,
    history_depth: "30_days",
    projection_stream_uuid: projectionStreamUuid,
    status: "syncing",
    capabilities: {},
    safe_error: null,
    transition_pending: false,
    revision,
    created_at: "2026-07-24T10:00:00Z",
    updated_at: "2026-07-24T10:01:00Z",
  };
}

function context(surface: "active" | "background"): WorkspaceRealtimeEventContext {
  return {
    owner: {
      accountId: "account-a",
      instanceId: "instance-a",
      organizationId: "organization-a",
      projectId: PROJECT_UUID,
      userUuid: "50000000-0000-4000-8000-000000000005",
      runtimeGeneration: 1,
    },
    ownerKey: OWNER_KEY,
    surface,
    source: "websocket",
  };
}

function event(
  kind: "external_chat.created" | "external_chat.updated" | "external_chat.deleted",
  revision: number,
  externalAccountUuid = ACCOUNT_UUID,
) {
  return {
    epoch_version: revision,
    type: "external_chat" as const,
    kind,
    external_chat: snapshot(revision, externalAccountUuid),
  };
}

describe("external chat realtime applier", () => {
  beforeEach(() => {
    useExternalChatsStore.getState().clear();
  });

  it("applies a full newer snapshot to the active account scope", () => {
    const store = useExternalChatsStore.getState();
    const loadGeneration = store.start(SCOPE_KEY, ACCOUNT_UUID);
    store.replace(SCOPE_KEY, ACCOUNT_UUID, loadGeneration, [
      adaptWorkspaceExternalChatDto(snapshot(1)),
    ]);
    const applier = createExternalChatRealtimeApplier({
      surface: "active",
      isOwnerCurrent: () => true,
    });

    applier.applyEvent(event("external_chat.updated", 2), context("active"));

    expect(useExternalChatsStore.getState().chats).toEqual([
      adaptWorkspaceExternalChatDto(snapshot(2)),
    ]);
  });

  it("does not let an older snapshot roll the active state back", () => {
    const store = useExternalChatsStore.getState();
    const loadGeneration = store.start(SCOPE_KEY, ACCOUNT_UUID);
    store.replace(SCOPE_KEY, ACCOUNT_UUID, loadGeneration, [
      adaptWorkspaceExternalChatDto(snapshot(3)),
    ]);
    const applier = createExternalChatRealtimeApplier({
      surface: "active",
      isOwnerCurrent: () => true,
    });

    applier.applyEvent(event("external_chat.updated", 2), context("active"));

    expect(useExternalChatsStore.getState().chats[0]?.revision).toBe(3);
  });

  it("removes a chat only when the delete snapshot is not stale", () => {
    const store = useExternalChatsStore.getState();
    const loadGeneration = store.start(SCOPE_KEY, ACCOUNT_UUID);
    store.replace(SCOPE_KEY, ACCOUNT_UUID, loadGeneration, [
      adaptWorkspaceExternalChatDto(snapshot(3)),
    ]);
    const applier = createExternalChatRealtimeApplier({
      surface: "active",
      isOwnerCurrent: () => true,
    });

    applier.applyEvent(event("external_chat.deleted", 2), context("active"));
    expect(useExternalChatsStore.getState().chats).toHaveLength(1);

    applier.applyEvent(event("external_chat.deleted", 4), context("active"));
    expect(useExternalChatsStore.getState().chats).toEqual([]);
  });

  it.each(["active", "background"] as const)(
    "purges the %s stream projection from an external chat delete event",
    async (surface) => {
      const removeProjection = vi.fn(() => Promise.resolve());
      const applier = createExternalChatRealtimeApplier({
        surface,
        isOwnerCurrent: () => true,
        removeProjection,
      });
      const deletedEvent = {
        ...event("external_chat.deleted", 4),
        external_chat: snapshot(4, ACCOUNT_UUID, STREAM_UUID),
      };

      applier.applyEvent(deletedEvent, context(surface));
      await vi.waitFor(() => expect(removeProjection).toHaveBeenCalledOnce());

      expect(removeProjection).toHaveBeenCalledWith({
        ownerKey: OWNER_KEY,
        streamUuid: STREAM_UUID,
        removeActiveProjection: surface === "active",
        isOwnerCurrent: expect.any(Function),
      });
    },
  );

  it("keeps a different external account out of the active scope", () => {
    const store = useExternalChatsStore.getState();
    const loadGeneration = store.start(SCOPE_KEY, ACCOUNT_UUID);
    store.replace(SCOPE_KEY, ACCOUNT_UUID, loadGeneration, [
      adaptWorkspaceExternalChatDto(snapshot(1)),
    ]);
    const applier = createExternalChatRealtimeApplier({
      surface: "active",
      isOwnerCurrent: () => true,
    });

    applier.applyEvent(event("external_chat.updated", 2, OTHER_ACCOUNT_UUID), context("active"));

    expect(useExternalChatsStore.getState().chats).toEqual([
      adaptWorkspaceExternalChatDto(snapshot(1)),
    ]);
  });

  it("ignores background and stale runtime events", () => {
    const store = useExternalChatsStore.getState();
    const loadGeneration = store.start(SCOPE_KEY, ACCOUNT_UUID);
    store.replace(SCOPE_KEY, ACCOUNT_UUID, loadGeneration, [
      adaptWorkspaceExternalChatDto(snapshot(1)),
    ]);
    const backgroundApplier = createExternalChatRealtimeApplier({
      surface: "background",
      isOwnerCurrent: () => true,
    });
    const staleApplier = createExternalChatRealtimeApplier({
      surface: "active",
      isOwnerCurrent: () => false,
    });

    backgroundApplier.applyEvent(event("external_chat.updated", 2), context("background"));
    staleApplier.applyEvent(event("external_chat.updated", 3), context("active"));

    expect(useExternalChatsStore.getState().chats[0]?.revision).toBe(1);
  });
});

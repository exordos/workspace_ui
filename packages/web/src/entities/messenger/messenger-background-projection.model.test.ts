import { beforeEach, describe, expect, it } from "vitest";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type {
  WorkspaceMessengerFolderDto,
  WorkspaceMessengerMessageDto,
  WorkspaceRealtimeEvent,
} from "~/shared/api/messenger.types";
import type {
  WorkspaceRealtimeEventContext,
  WorkspaceRealtimeRuntimeOwner,
} from "~/shared/lib/workspace-realtime/workspace-realtime-runtime.lib";
import { useMessengerBackgroundProjectionStore } from "./messenger-background-projection.model";
import { createMessengerRealtimeBackgroundApplier } from "./messenger-realtime-applier.lib";
import { useMessengerStore } from "./messenger.model";

const ACCOUNT_A = "account-a";
const INSTANCE_A = "instance-a";
const ORGANIZATION_A = "organization-a";
const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const USER_A = "11111111-1111-4111-8111-111111111111";
const STREAM_A = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_A = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const FOLDER_A = "50ecadd0-9823-4d97-b54c-806cc672c210";
const FOLDER_ITEM_A = "9f41b1a7-77f9-4c12-bdc6-d3cebc5dbf50";
const FOLDER_ITEM_B = "5f5b9a9d-0e57-4775-849b-c8308f95a809";
const MESSAGE_A = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const DATE = "2026-06-22T10:10:00Z";

function createOwner(overrides: Partial<WorkspaceRealtimeRuntimeOwner> = {}) {
  return {
    accountId: ACCOUNT_A,
    instanceId: INSTANCE_A,
    organizationId: ORGANIZATION_A,
    projectId: PROJECT_A,
    userUuid: USER_A,
    runtimeGeneration: 1,
    ...overrides,
  };
}

function createContext(
  owner = createOwner(),
  overrides: Partial<WorkspaceRealtimeEventContext> = {},
): WorkspaceRealtimeEventContext {
  return {
    owner,
    ownerKey: workspaceRuntimeOwnerKey(owner),
    surface: "background",
    source: "websocket",
    ...overrides,
  };
}

function createMessageDto(
  overrides: Partial<WorkspaceMessengerMessageDto> = {},
): WorkspaceMessengerMessageDto {
  return {
    uuid: MESSAGE_A,
    project_id: PROJECT_A,
    stream_uuid: STREAM_A,
    topic_uuid: TOPIC_A,
    author_uuid: USER_A,
    payload: {
      kind: "markdown",
      content: "Do not copy this text into background projection",
    },
    user_uuid: USER_A,
    read: false,
    pinned: false,
    starred: false,
    is_own: false,
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

function createFolderDto(
  overrides: Partial<WorkspaceMessengerFolderDto> = {},
): WorkspaceMessengerFolderDto {
  return {
    uuid: FOLDER_A,
    project_id: PROJECT_A,
    user_uuid: USER_A,
    title: "Inbox",
    background_color_value: null,
    unread_count: 7,
    system_type: "created",
    folder_items: [
      {
        uuid: FOLDER_ITEM_A,
        project_id: PROJECT_A,
        folder_uuid: FOLDER_A,
        user_uuid: USER_A,
        stream_uuid: STREAM_A,
        chat_type: "stream",
        order_index: 10,
        pinned_at: null,
        unread_count: 3,
        created_at: DATE,
        updated_at: DATE,
      },
      {
        uuid: FOLDER_ITEM_B,
        project_id: PROJECT_A,
        folder_uuid: FOLDER_A,
        user_uuid: USER_A,
        stream_uuid: STREAM_A,
        chat_type: "stream",
        order_index: 20,
        pinned_at: null,
        unread_count: 4,
        created_at: DATE,
        updated_at: DATE,
      },
    ],
    created_at: DATE,
    updated_at: DATE,
    ...overrides,
  };
}

describe("messenger background projection", () => {
  beforeEach(() => {
    useMessengerBackgroundProjectionStore.getState().clear();
    useMessengerStore.getState().clear();
  });

  it("records message.created notification candidate without touching messengerStore", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();
    useMessengerStore.getState().startBootstrap(context.ownerKey);

    applier.applyEvent(
      {
        epoch_version: 11,
        type: "message",
        message: createMessageDto(),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.notificationCandidates).toEqual([
      {
        ownerKey: context.ownerKey,
        epochVersion: 11,
        messageUuid: MESSAGE_A,
        streamUuid: STREAM_A,
        topicUuid: TOPIC_A,
        authorUuid: USER_A,
        isOwn: false,
        createdAt: DATE,
      },
    ]);
    expect(JSON.stringify(projection)).not.toContain("Do not copy this text");
    expect(useMessengerStore.getState().messagesById[MESSAGE_A]).toBeUndefined();
    expect(useMessengerStore.getState().lastEpochVersion).toBeNull();
  });

  it("records folder unread counters from folder snapshot", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 21,
        type: "folder",
        kind: "folder.updated",
        folder: createFolderDto(),
      },
      context,
    );

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.lastEpochVersion).toBe(21);
    expect(projection?.unreadByFolderId).toEqual({ [FOLDER_A]: 7 });
    expect(projection?.unreadByFolderItemId).toEqual({
      [FOLDER_ITEM_A]: 3,
      [FOLDER_ITEM_B]: 4,
    });
  });

  it("records unsupported and skipped diagnostics as a bounded list", () => {
    const context = createContext();
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      { epoch_version: 1, type: "unknown" } as unknown as WorkspaceRealtimeEvent,
      context,
    );
    for (let epochVersion = 2; epochVersion <= 56; epochVersion++) {
      applier.skipEvent({ epoch_version: epochVersion }, "unsupported_event", context);
    }

    const projection =
      useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey[context.ownerKey];
    expect(projection?.skippedEvents).toHaveLength(50);
    expect(projection?.skippedEvents[0]).toEqual(
      expect.objectContaining({ epochVersion: 56, reason: "unsupported_event" }),
    );
    expect(projection?.skippedEvents.at(-1)).toEqual(
      expect.objectContaining({ epochVersion: 7, reason: "unsupported_event" }),
    );
  });

  it("ignores active-surface events so active apply path stays separate", () => {
    const context = createContext(createOwner(), { surface: "active" });
    const applier = createMessengerRealtimeBackgroundApplier();

    applier.applyEvent(
      {
        epoch_version: 31,
        type: "message",
        message: createMessageDto(),
      },
      context,
    );

    expect(useMessengerBackgroundProjectionStore.getState().projectionsByOwnerKey).toEqual({});
  });
});

import { describe, expect, it, vi } from "vitest";
import { normalizeWorkspaceRestEvent } from "~/shared/api/messenger-realtime.api";
import type {
  WorkspaceMessengerEventDto,
  WorkspaceMessengerMessageDto,
  WorkspaceMessengerRawEventDto,
  WorkspaceMessengerRealtimeEventDto,
  WorkspaceRealtimeEvent,
} from "~/shared/api/messenger.types";
import type { WorkspaceCollectionPage } from "~/shared/api/workspace-client";
import { catchUpWorkspaceRealtime } from "./workspace-realtime-catch-up.lib";
import { createWorkspaceRealtimeCursorStorage } from "./workspace-realtime-cursor.lib";
import type {
  WorkspaceRealtimeCatchUpApplier,
  WorkspaceRealtimeCatchUpOptions,
  WorkspaceRealtimeCatchUpOwner,
  WorkspaceRealtimeCatchUpSkipReason,
} from "./workspace-realtime-catch-up.lib";
import type {
  WorkspaceRealtimeCursorOwner,
  WorkspaceRealtimeCursorStorageLike,
} from "./workspace-realtime-cursor.lib";

const PROJECT_UUID = "22222222-2222-4222-8222-222222222222";
const USER_UUID = "11111111-1111-4111-8111-111111111111";
const USER_B_UUID = "33333333-3333-4333-8333-333333333333";
const STREAM_UUID = "75309057-419c-4b12-a7c1-3932429ec4a6";
const TOPIC_UUID = "4ec0b996-b778-45f8-8ef4-ef863be0c047";
const MESSAGE_UUID = "a93dca35-3061-4748-bda4-7f6f8c660ea5";
const EVENT_UUID = "0cb14b5a-6bf0-4de2-bdb5-4e98df4044e0";
const DATE = "2026-06-30T10:10:00Z";
const EPOCH_GENERATION = "generation-a";

function cursor(epochVersion: number) {
  return { epochGeneration: EPOCH_GENERATION, epochVersion };
}

class MemoryStorage implements WorkspaceRealtimeCursorStorageLike {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const owner: WorkspaceRealtimeCatchUpOwner = {
  accountId: "account-a",
  instanceId: "instance-a",
  organizationId: "org-a",
  projectId: PROJECT_UUID,
  userUuid: USER_UUID,
  runtimeGeneration: 1,
};

const cursorOwner: WorkspaceRealtimeCursorOwner = owner;

const messageDto: WorkspaceMessengerMessageDto = {
  uuid: MESSAGE_UUID,
  project_id: PROJECT_UUID,
  stream_uuid: STREAM_UUID,
  topic_uuid: TOPIC_UUID,
  author_uuid: USER_B_UUID,
  payload: {
    kind: "markdown",
    content: "Hello, workspace",
  },
  user_uuid: USER_UUID,
  read: false,
  pinned: false,
  starred: false,
  is_own: false,
  reactions: {},
  reaction_users: {},
  created_at: DATE,
  updated_at: DATE,
};

function createEventDto(epochVersion: number): WorkspaceMessengerEventDto {
  return {
    schema_version: 1,
    epoch_version: epochVersion,
    uuid: EVENT_UUID,
    project_id: PROJECT_UUID,
    user_uuid: USER_UUID,
    object_type: "message",
    action: "created",
    payload: {
      kind: "message.created",
      ...messageDto,
      uuid: `${MESSAGE_UUID.slice(0, -1)}${epochVersion % 10}`,
    },
    created_at: DATE,
    updated_at: DATE,
  };
}

function createRawEventDto(epochVersion: number): WorkspaceMessengerRawEventDto {
  return {
    schema_version: 2,
    epoch_version: epochVersion,
    uuid: EVENT_UUID,
    project_id: PROJECT_UUID,
    user_uuid: USER_UUID,
    object_type: "workspace_widget",
    action: "refreshed",
    payload: {
      kind: "workspace_widget.refreshed",
      uuid: "bb2ac71e-85ed-45d6-87da-89f9f0bcc523",
    },
    created_at: DATE,
    updated_at: DATE,
  };
}

function createRealtimeEvent(epochVersion: number): WorkspaceRealtimeEvent {
  return {
    epoch_version: epochVersion,
    type: "message",
    message: {
      ...messageDto,
      uuid: `${MESSAGE_UUID.slice(0, -1)}${epochVersion % 10}`,
    },
  };
}

function createPage(
  items: WorkspaceMessengerRealtimeEventDto[],
  nextPageMarker: string | null = null,
): WorkspaceCollectionPage<WorkspaceMessengerRealtimeEventDto> {
  return {
    items,
    nextPageMarker,
    pageLimit: 100,
  };
}

function createApplier() {
  const appliedEpochs: number[] = [];
  const skippedEvents: { epochVersion: number; reason: WorkspaceRealtimeCatchUpSkipReason }[] = [];
  const applier: WorkspaceRealtimeCatchUpApplier = {
    applyEvent: vi.fn((event: WorkspaceRealtimeEvent) => {
      appliedEpochs.push(event.epoch_version);
    }),
    skipEvent: vi.fn((event, reason) => {
      skippedEvents.push({ epochVersion: event.epoch_version, reason });
    }),
  };

  return { applier, appliedEpochs, skippedEvents };
}

function createOptions(
  overrides: Partial<WorkspaceRealtimeCatchUpOptions> = {},
): WorkspaceRealtimeCatchUpOptions {
  const storage = createWorkspaceRealtimeCursorStorage(new MemoryStorage());
  const { applier } = createApplier();

  return {
    owner,
    ownerKey: "owner-key-a",
    surface: "active",
    clientOptions: {
      accessToken: "access-token",
      projectId: PROJECT_UUID,
    },
    cursorStorage: storage,
    applier,
    normalizeRestEvent: (event) => createRealtimeEvent(event.epoch_version),
    ...overrides,
  };
}

describe("workspace-realtime catch-up", () => {
  it("uses /epoch/ as the starting cursor when storage is empty", async () => {
    const rawStorage = new MemoryStorage();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(rawStorage);
    const getEpoch = vi.fn<NonNullable<WorkspaceRealtimeCatchUpOptions["getEpoch"]>>();
    const getEventsPage = vi.fn<NonNullable<WorkspaceRealtimeCatchUpOptions["getEventsPage"]>>();
    getEpoch.mockResolvedValue({
      epoch_version: 42,
      epoch_generation: EPOCH_GENERATION,
      current_epoch_version: 42,
      minimum_epoch_version: 1,
    });
    getEventsPage.mockResolvedValue(createPage([]));

    const result = await catchUpWorkspaceRealtime(
      createOptions({
        cursorStorage,
        getEpoch,
        getEventsPage,
      }),
    );

    expect(getEpoch).toHaveBeenCalledOnce();
    expect(getEventsPage).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_UUID }),
      {
        afterEpochVersion: 42,
        epochGeneration: EPOCH_GENERATION,
        pageLimit: 100,
        pageMarker: undefined,
      },
    );
    expect(cursorStorage.read(cursorOwner)).toEqual(cursor(42));
    expect(result).toMatchObject({
      startedFrom: cursor(42),
      lastCursor: cursor(42),
      appliedCount: 0,
      skippedCount: 0,
      isStale: false,
    });
  });

  it("sorts a batch and skips duplicate or old epochs", async () => {
    const rawStorage = new MemoryStorage();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(rawStorage);
    cursorStorage.write(cursorOwner, cursor(5));
    const { applier, appliedEpochs, skippedEvents } = createApplier();

    const result = await catchUpWorkspaceRealtime(
      createOptions({
        cursorStorage,
        applier,
        getEventsPage: () =>
          Promise.resolve(createPage([createEventDto(6), createEventDto(4), createEventDto(6)])),
      }),
    );

    expect(appliedEpochs).toEqual([6]);
    expect(skippedEvents).toEqual([
      { epochVersion: 4, reason: "duplicate_epoch" },
      { epochVersion: 6, reason: "duplicate_epoch" },
    ]);
    expect(cursorStorage.read(cursorOwner)).toEqual(cursor(6));
    expect(result).toMatchObject({ appliedCount: 1, skippedCount: 2, lastCursor: cursor(6) });
  });

  it("skips unknown events and advances cursor after the skip", async () => {
    const rawStorage = new MemoryStorage();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(rawStorage);
    cursorStorage.write(cursorOwner, cursor(5));
    const { applier, appliedEpochs, skippedEvents } = createApplier();

    await catchUpWorkspaceRealtime(
      createOptions({
        cursorStorage,
        applier,
        getEventsPage: () => Promise.resolve(createPage([createEventDto(7)])),
        normalizeRestEvent: () => null,
      }),
    );

    expect(appliedEpochs).toEqual([]);
    expect(skippedEvents).toEqual([{ epochVersion: 7, reason: "unsupported_event" }]);
    expect(cursorStorage.read(cursorOwner)).toEqual(cursor(7));
  });

  it("skips unknown flat event envelopes and advances cursor", async () => {
    const rawStorage = new MemoryStorage();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(rawStorage);
    cursorStorage.write(cursorOwner, cursor(5));
    const { applier, appliedEpochs, skippedEvents } = createApplier();

    await catchUpWorkspaceRealtime(
      createOptions({
        cursorStorage,
        applier,
        getEventsPage: () => Promise.resolve(createPage([createRawEventDto(8)])),
        normalizeRestEvent: normalizeWorkspaceRestEvent,
      }),
    );

    expect(appliedEpochs).toEqual([]);
    expect(skippedEvents).toEqual([{ epochVersion: 8, reason: "unsupported_event" }]);
    expect(cursorStorage.read(cursorOwner)).toEqual(cursor(8));
  });

  it("does not apply, skip, or advance cursor for a stale owner", async () => {
    const rawStorage = new MemoryStorage();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(rawStorage);
    cursorStorage.write(cursorOwner, cursor(5));
    const { applier } = createApplier();
    const isOwnerCurrent = vi.fn<NonNullable<WorkspaceRealtimeCatchUpOptions["isOwnerCurrent"]>>();
    isOwnerCurrent.mockReturnValueOnce(true).mockReturnValueOnce(false);

    const result = await catchUpWorkspaceRealtime(
      createOptions({
        cursorStorage,
        applier,
        isOwnerCurrent,
        getEventsPage: () => Promise.resolve(createPage([createEventDto(6)])),
      }),
    );

    expect(applier.applyEvent).not.toHaveBeenCalled();
    expect(applier.skipEvent).not.toHaveBeenCalled();
    expect(cursorStorage.read(cursorOwner)).toEqual(cursor(5));
    expect(result).toMatchObject({ isStale: true, lastCursor: cursor(5) });
  });

  it("advances cursor monotonically in sorted epoch order", async () => {
    const rawStorage = new MemoryStorage();
    const cursorStorage = createWorkspaceRealtimeCursorStorage(rawStorage);
    cursorStorage.write(cursorOwner, cursor(10));
    const { applier, appliedEpochs } = createApplier();

    const result = await catchUpWorkspaceRealtime(
      createOptions({
        cursorStorage,
        applier,
        getEventsPage: () =>
          Promise.resolve(createPage([createEventDto(12), createEventDto(11), createEventDto(13)])),
      }),
    );

    expect(appliedEpochs).toEqual([11, 12, 13]);
    expect(cursorStorage.read(cursorOwner)).toEqual(cursor(13));
    expect(result).toMatchObject({ lastCursor: cursor(13), appliedCount: 3 });
  });
});

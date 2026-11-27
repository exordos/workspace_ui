import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { workspaceRuntimeOwnerKey } from "~/platform/sessions/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/platform/sessions/workspace-runtime.types";
import { invokePollAction } from "~/shared/api/messenger-messages.api";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import {
  openWorkspaceMessengerCacheDb,
  resetWorkspaceMessengerCacheDbSingletonForTests,
} from "~/shared/lib/workspace-messenger-cache-db";
import { createMessengerRealtimeApplier } from "../../../runtime/sync/messenger-realtime-applier.lib";
import { useMessengerStore } from "../../chats/messenger.model";
import {
  messengerMessageActionCache,
  patchMessengerCachedMessage,
  readMessengerMessageBodyCache,
  writeMessengerMessageBodyCache,
} from "../../messenger-cache.lib";
import { useWorkspaceMessageStore } from "../message.model";
import { createMessages } from "../messages";
import { adaptMessengerMessage } from "../messenger-message-adapter.lib";
import {
  mutateMessengerPoll,
  supportsMessengerPolls,
  supportsMessengerPollManagement,
} from "./messenger-poll-actions.lib";

vi.mock("~/shared/api/messenger-messages.api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/shared/api/messenger-messages.api")>()),
  invokePollAction: vi.fn(),
  getPollVoters: vi.fn(),
}));
const runtime: WorkspaceRuntimeContext = {
  accountId: "a",
  instanceId: "i",
  organizationId: "o",
  organizationOrigin: "https://example.com",
  projectId: "p",
  userUuid: "u",
  accessToken: "token",
  runtimeGeneration: 1,
};
const dto = {
  uuid: "m",
  project_id: "p",
  stream_uuid: "75309057-419c-4b12-a7c1-3932429ec4a6",
  topic_uuid: "4ec0b996-b778-45f8-8ef4-ef863be0c047",
  author_uuid: "a",
  user_uuid: "u",
  payload: {
    kind: "poll",
    questions: [],
    multiple_answers: false,
    is_anonymous: true,
    allow_revote: false,
    results_visibility: "always",
  },
  poll_state: { revision: 1, is_closed: false, voter_count: 0, questions: [], my_votes: [] },
  read: false,
  pinned: false,
  starred: false,
  is_own: false,
  reactions: {},
  reaction_users: {},
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
} satisfies WorkspaceMessengerMessageDto;
afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
  useWorkspaceMessageStore.getState().clear();
  useMessengerStore.getState().clear();
});

function compatiblePoll() {
  return {
    kind: "poll" as const,
    multipleAnswers: true,
    isAnonymous: false,
    allowRevote: true,
    resultsVisibility: "always" as const,
    allowAddingOptions: true,
    closesAt: null,
    closedAt: null,
    questions: [
      {
        uuid: "question",
        text: "When?",
        correctOptionUuids: Array<string>(),
        options: [
          { uuid: "first", text: "Today" },
          { uuid: "second", text: "Tomorrow" },
        ],
      },
    ],
  };
}

it("keeps Zulip widgets fixed while allowing native poll management", () => {
  const payload = compatiblePoll();
  expect(
    supportsMessengerPollManagement(
      { sourceName: "native", encryption: false, isArchived: false },
      payload,
    ),
  ).toBe(true);
  expect(
    supportsMessengerPollManagement(
      { sourceName: "zulip", encryption: false, isArchived: false },
      payload,
    ),
  ).toBe(false);
  for (const sourceName of ["native", "zulip"] as const) {
    expect(
      supportsMessengerPollManagement({ sourceName, encryption: true, isArchived: false }, payload),
    ).toBe(false);
    expect(
      supportsMessengerPollManagement({ sourceName, encryption: false, isArchived: true }, payload),
    ).toBe(false);
  }
});

it.each([
  { multipleAnswers: false },
  { isAnonymous: true },
  { allowRevote: false },
  { resultsVisibility: "after_vote" as const },
  { allowAddingOptions: false },
  { closesAt: "2099-01-01T00:00:00Z" },
])("allows management of extended Workspace policies in Zulip: %j", (settings) => {
  expect(
    supportsMessengerPollManagement(
      { sourceName: "zulip", encryption: false, isArchived: false },
      { ...compatiblePoll(), ...settings },
    ),
  ).toBe(true);
});

it("allows management of multi-question and correct-answer previews", () => {
  const payload = compatiblePoll();
  const stream = { sourceName: "zulip" as const, encryption: false, isArchived: false };
  payload.questions.push({ ...payload.questions[0]!, uuid: "other" });
  expect(supportsMessengerPollManagement(stream, payload)).toBe(true);
  payload.questions.pop();
  payload.questions[0]!.correctOptionUuids = ["first"];
  expect(supportsMessengerPollManagement(stream, payload)).toBe(true);
});

it.each([" Today", "Today\u0085", "Today\u001f", "Today\n", "@*group*"])(
  "recognizes a text preview using the same literal-line rules as the bridge: %j",
  (text) => {
    const payload = compatiblePoll();
    payload.questions[0]!.options[0]!.text = text;
    expect(
      supportsMessengerPollManagement(
        { sourceName: "zulip", encryption: false, isArchived: false },
        payload,
      ),
    ).toBe(true);
  },
);

it("does not treat the literal BOM as Python strip whitespace", () => {
  const payload = compatiblePoll();
  payload.questions[0]!.text = "\ufeffWhen?";
  expect(
    supportsMessengerPollManagement(
      { sourceName: "zulip", encryption: false, isArchived: false },
      payload,
    ),
  ).toBe(false);
});

it.each(["contact@example.test", "literal * asterisk"])(
  "keeps individual mention or emphasis characters compatible: %j",
  (text) => {
    const payload = compatiblePoll();
    payload.questions[0]!.text = text;
    expect(
      supportsMessengerPollManagement(
        { sourceName: "zulip", encryption: false, isArchived: false },
        payload,
      ),
    ).toBe(false);
  },
);

it("discards a poll response after switching runtime owners", async () => {
  const store = useWorkspaceMessageStore.getState();
  store.setOwner(workspaceRuntimeOwnerKey(runtime), false);
  store.applyLiveCreatedMessage(adaptMessengerMessage(dto));
  const cacheWrite = vi.spyOn(messengerMessageActionCache, "patchCachedMessage");
  let resolve!: (value: WorkspaceMessengerMessageDto) => void;
  vi.mocked(invokePollAction).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  let current = runtime;
  const pending = mutateMessengerPoll({
    runtimeContext: runtime,
    getRuntimeContext: () => current,
    messageUuid: "m",
    action: { kind: "close" },
  });
  current = { ...runtime, runtimeGeneration: 2 };
  resolve({ ...dto, poll_state: { ...dto.poll_state, revision: 2, is_closed: true } });
  expect(await pending).toEqual({ status: "skipped" });
  expect(cacheWrite).not.toHaveBeenCalled();
  expect(useWorkspaceMessageStore.getState().messagesById.m?.pollState?.revision).toBe(1);
});

it("invalidates a pending cache write after the message is deleted", async () => {
  const store = useWorkspaceMessageStore.getState();
  store.setOwner(workspaceRuntimeOwnerKey(runtime), false);
  store.applyLiveCreatedMessage(adaptMessengerMessage(dto));
  vi.mocked(invokePollAction).mockResolvedValue({
    ...dto,
    poll_state: { ...dto.poll_state, revision: 2 },
  });
  let check!: () => boolean;
  let finish!: () => void;
  vi.spyOn(messengerMessageActionCache, "patchCachedMessage").mockImplementation(
    (_owner, _message, guard) => {
      check = guard!;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
  );
  const pending = mutateMessengerPoll({
    runtimeContext: runtime,
    getRuntimeContext: () => runtime,
    messageUuid: "m",
    action: { kind: "close" },
  });
  await vi.waitFor(() => expect(check).toBeDefined());
  expect(check()).toBe(true);
  store.removeMessage("m");
  expect(check()).toBe(false);
  finish();
  await pending;
});

describe("confirmed poll snapshots", () => {
  const ownerKey = workspaceRuntimeOwnerKey(runtime);
  const context = { owner: runtime, ownerKey, surface: "active", source: "websocket" } as const;
  const messages = createMessages({ runtimeContext: runtime, getRuntimeContext: () => runtime });
  const original = adaptMessengerMessage(dto);
  const realtimeSnapshot = {
    ...dto,
    updated_at: "2026-01-01T00:00:00.000100Z",
    poll_state: { ...dto.poll_state, revision: 2, voter_count: 2 },
    read: true,
    pinned: true,
    starred: true,
    reactions: { eyes: 2 },
    reaction_users: { eyes: ["another-user"] },
  };
  const httpSnapshot = {
    ...dto,
    updated_at: "2026-01-01T00:00:00.000200Z",
    payload: { ...dto.payload, allow_adding_options: true },
    poll_state: { ...dto.poll_state, revision: 3, voter_count: 3 },
    reactions: { old: 1 },
  };

  beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    vi.stubGlobal("IDBKeyRange", IDBKeyRange);
    resetWorkspaceMessengerCacheDbSingletonForTests();
    useMessengerStore.getState().startBootstrap(ownerKey);
    const store = useWorkspaceMessageStore.getState();
    store.setOwner(ownerKey, false);
    store.applyLiveCreatedMessage(original);
  });

  afterEach(async () => {
    (await openWorkspaceMessengerCacheDb()).close();
    resetWorkspaceMessengerCacheDbSingletonForTests();
    vi.unstubAllGlobals();
  });

  function applyUpdate(
    applier: ReturnType<typeof createMessengerRealtimeApplier>,
    message: WorkspaceMessengerMessageDto,
    epoch = 1,
  ) {
    return applier.applyEvent(
      { type: "message", kind: "message.updated", epoch_version: epoch, message },
      context,
    );
  }

  it.each(["HTTP first", "realtime first", "realtime cache still writing"] as const)(
    "keeps the newest poll pair and independent realtime fields with %s",
    async (order) => {
      await writeMessengerMessageBodyCache(ownerKey, [original]);
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const applier = createMessengerRealtimeApplier(
        order === "realtime cache still writing"
          ? {
              requireOwnerCatalog: false,
              cache: {
                async patchCachedMessage(owner, message, guard) {
                  if (message.pollState?.revision === 2) await gate;
                  await patchMessengerCachedMessage(owner, message, guard);
                },
              },
            }
          : { requireOwnerCatalog: false },
      );
      let resolveHttp!: (value: WorkspaceMessengerMessageDto) => void;
      vi.mocked(invokePollAction).mockReturnValue(
        new Promise((resolve) => {
          resolveHttp = resolve;
        }),
      );
      const http = messages.polls.mutate({
        messageUuid: dto.uuid,
        action: { kind: "settings", allowAddingOptions: true, closesAt: null },
      });
      const realtime = order !== "HTTP first" ? applyUpdate(applier, realtimeSnapshot) : undefined;
      if (order === "realtime first") await realtime;
      resolveHttp(httpSnapshot);
      await expect(http).resolves.toMatchObject({ status: "applied" });
      if (order === "HTTP first") await applyUpdate(applier, realtimeSnapshot);
      release();
      await realtime;

      const expected = {
        pollState: { revision: 3, voterCount: 3 },
        payload: { allowAddingOptions: true },
        updatedAt: httpSnapshot.updated_at,
        read: true,
        pinned: true,
        starred: true,
        reactions: { eyes: 2 },
        reactionUserUuidsByEmojiName: { eyes: ["another-user"] },
      };
      expect(useWorkspaceMessageStore.getState().messagesById.m).toMatchObject(expected);
      await expect(readMessengerMessageBodyCache(ownerKey, [dto.uuid])).resolves.toEqual([
        expect.objectContaining({
          ...expected,
          pollState: expect.objectContaining(expected.pollState),
          payload: expect.objectContaining(expected.payload),
        }),
      ]);
    },
  );

  it("preserves equal-revision close and the inserted poll pair after a lower HTTP receipt", async () => {
    await writeMessengerMessageBodyCache(ownerKey, [original]);
    const applier = createMessengerRealtimeApplier({ requireOwnerCatalog: false });
    const closed = {
      ...httpSnapshot,
      poll_state: { ...httpSnapshot.poll_state, is_closed: true },
    };
    await applyUpdate(applier, closed);
    vi.mocked(invokePollAction).mockResolvedValueOnce(httpSnapshot).mockResolvedValueOnce(dto);
    const vote = () =>
      messages.polls.mutate({
        messageUuid: dto.uuid,
        action: { kind: "vote", questionUuid: "q", optionUuid: "o", selected: true },
      });
    await vote();
    await vote();
    expect(useWorkspaceMessageStore.getState().messagesById.m).toMatchObject({
      pollState: { revision: 3, isClosed: true, voterCount: 3 },
      updatedAt: closed.updated_at,
    });
    const cached = await readMessengerMessageBodyCache(ownerKey, [dto.uuid]);
    expect(cached[0]).toMatchObject({
      payload: { allowAddingOptions: true },
      pollState: { revision: 3, isClosed: true, voterCount: 3 },
      updatedAt: closed.updated_at,
    });
  });

  it.each(["cached row", "missing row"] as const)(
    "preserves local reaction state without persisting an optimistic count with a %s",
    async (cacheState) => {
      if (cacheState === "cached row") await writeMessengerMessageBodyCache(ownerKey, [original]);
      const store = useWorkspaceMessageStore.getState();
      store.setOwnMessageReaction(dto.uuid, "thumbs_up", "confirmed-reaction");
      store.beginOptimisticOwnMessageReaction(dto.uuid, "eyes", "add", "pending", runtime.userUuid);
      vi.mocked(invokePollAction).mockResolvedValue(httpSnapshot);
      await messages.polls.mutate({
        messageUuid: dto.uuid,
        action: { kind: "vote", questionUuid: "q", optionUuid: "o", selected: true },
      });
      expect(useWorkspaceMessageStore.getState().messagesById.m).toMatchObject({
        pollState: { revision: 3 },
        reactions: { eyes: 1 },
        ownReactionUuidsByEmojiName: { thumbs_up: "confirmed-reaction" },
        optimisticReactionUserUuidsByEmojiName: { eyes: [runtime.userUuid] },
      });
      const [cached] = await readMessengerMessageBodyCache(ownerKey, [dto.uuid]);
      expect(cached?.pollState?.revision).toBe(3);
      expect(cached?.reactions).toEqual({});
      expect(cached?.pendingOwnReactionsByEmojiName).toBeUndefined();
      expect(cached?.optimisticReactionUserUuidsByEmojiName).toBeUndefined();
    },
  );

  it.each(["during publication", "at cache commit"] as const)(
    "keeps an exact read %s when there is no previous cached poll body",
    async (timing) => {
      const applier = createMessengerRealtimeApplier({ requireOwnerCatalog: false });
      let read: ReturnType<typeof applier.applyEvent>;
      const markRead = () => {
        read = applier.applyEvent(
          { type: "messages", kind: "messages.read", epoch_version: 1, messageUuids: [dto.uuid] },
          context,
        );
      };
      const unsubscribe =
        timing === "during publication"
          ? useWorkspaceMessageStore.subscribe((state, previous) => {
              if (state.messagesById.m?.pollState !== previous.messagesById.m?.pollState)
                markRead();
            })
          : undefined;
      if (timing === "at cache commit") {
        let checks = 0;
        vi.spyOn(messengerMessageActionCache, "patchCachedMessage").mockImplementation(
          (owner, message, guard, currentPoll) =>
            patchMessengerCachedMessage(
              owner,
              message,
              () => {
                if (++checks === 2) markRead();
                return guard?.() ?? false;
              },
              currentPoll,
            ),
        );
      }

      vi.mocked(invokePollAction).mockResolvedValue(httpSnapshot);
      try {
        await messages.polls.mutate({
          messageUuid: dto.uuid,
          action: { kind: "settings", allowAddingOptions: true, closesAt: null },
        });
        await Promise.resolve(read);
      } finally {
        unsubscribe?.();
      }
      expect(useWorkspaceMessageStore.getState().messagesById.m?.read).toBe(true);
      const [cached] = await readMessengerMessageBodyCache(ownerKey, [dto.uuid]);
      expect(cached).toMatchObject({ read: true, pollState: { revision: 3 } });
    },
  );

  it("does not revive a pending response after the poll moves away and back", async () => {
    await writeMessengerMessageBodyCache(ownerKey, [original]);
    let resolveHttp!: (value: WorkspaceMessengerMessageDto) => void;
    vi.mocked(invokePollAction).mockReturnValue(
      new Promise((resolve) => {
        resolveHttp = resolve;
      }),
    );
    const http = messages.polls.mutate({ messageUuid: dto.uuid, action: { kind: "close" } });
    const applier = createMessengerRealtimeApplier({ requireOwnerCatalog: false });
    await applyUpdate(applier, { ...dto, topic_uuid: "a1b71764-7147-4e8f-ba83-f95648cd6630" });
    await applyUpdate(applier, dto, 2);
    resolveHttp(httpSnapshot);
    await expect(http).resolves.toEqual({ status: "skipped" });
    expect(useWorkspaceMessageStore.getState().messagesById.m?.pollState?.revision).toBe(1);
    const [cached] = await readMessengerMessageBodyCache(ownerKey, [dto.uuid]);
    expect(cached?.pollState?.revision).toBe(1);
  });
});

it("allows native and Zulip poll participation while rejecting encrypted or archived streams", () => {
  for (const sourceName of ["native", "zulip"] as const) {
    expect(supportsMessengerPolls({ sourceName, encryption: false, isArchived: false })).toBe(true);
    expect(supportsMessengerPolls({ sourceName, encryption: true, isArchived: false })).toBe(false);
    expect(supportsMessengerPolls({ sourceName, encryption: false, isArchived: true })).toBe(false);
  }
  expect(supportsMessengerPolls(undefined)).toBe(false);
});

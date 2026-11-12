import { afterEach, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { invokePollAction } from "~/shared/api/messenger-messages.api";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import { messengerMessageActionCache } from "./messenger-cache.lib";
import {
  mutateMessengerPoll,
  supportsMessengerPolls,
  supportsMessengerPollManagement,
} from "./messenger-poll-actions.lib";
import type { MessengerPollPayload } from "./messenger.types";

vi.mock("~/shared/api/messenger-messages.api", () => ({
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
const dto: WorkspaceMessengerMessageDto = {
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
};
afterEach(() => {
  vi.resetAllMocks();
  useWorkspaceMessageStore.getState().clear();
});

function compatiblePoll(): MessengerPollPayload {
  return {
    kind: "poll",
    multipleAnswers: true,
    isAnonymous: false,
    allowRevote: true,
    resultsVisibility: "always",
    allowAddingOptions: true,
    closesAt: null,
    closedAt: null,
    questions: [
      {
        uuid: "question",
        text: "When?",
        correctOptionUuids: [],
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
  resolve({ ...dto, poll_state: { ...dto.poll_state!, revision: 2, is_closed: true } });
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
    poll_state: { ...dto.poll_state!, revision: 2 },
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

it("allows native and Zulip poll participation while rejecting encrypted or archived streams", () => {
  for (const sourceName of ["native", "zulip"] as const) {
    expect(supportsMessengerPolls({ sourceName, encryption: false, isArchived: false })).toBe(true);
    expect(supportsMessengerPolls({ sourceName, encryption: true, isArchived: false })).toBe(false);
    expect(supportsMessengerPolls({ sourceName, encryption: false, isArchived: true })).toBe(false);
  }
  expect(supportsMessengerPolls(undefined)).toBe(false);
});

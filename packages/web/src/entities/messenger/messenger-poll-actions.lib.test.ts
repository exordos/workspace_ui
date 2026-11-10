import { afterEach, expect, it, vi } from "vitest";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { invokePollAction } from "~/shared/api/messenger-messages.api";
import type { WorkspaceMessengerMessageDto } from "~/shared/api/messenger.types";
import { adaptMessengerMessage } from "./messenger-adapters.lib";
import { messengerMessageActionCache } from "./messenger-cache.lib";
import { mutateMessengerPoll } from "./messenger-poll-actions.lib";

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

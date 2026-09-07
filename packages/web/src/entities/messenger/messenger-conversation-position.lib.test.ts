import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  forgetMessengerConversationPositions,
  openMessengerConversationPosition,
} from "./messenger-conversation-position.lib";

let runtime: WorkspaceRuntimeContext | null;
let generation = 0;
const anchor = { kind: "anchor", messageKey: "message-a", offsetTop: -20 } as const;
const topicA = "topic:11111111-1111-4111-8111-111111111111:33333333-3333-4333-8333-333333333333";
const topicB = "topic:11111111-1111-4111-8111-111111111111:44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  runtime = {
    accountId: "account",
    instanceId: "instance",
    organizationId: "org",
    organizationOrigin: "https://workspace.example.test",
    projectId: "project",
    userUuid: "user",
    accessToken: "test",
    refreshToken: "test",
    runtimeGeneration: ++generation,
  };
  vi.spyOn(useWorkspaceAuthStore.getState(), "getCurrentRuntimeContext").mockImplementation(
    () => runtime,
  );
});
afterEach(() => vi.restoreAllMocks());

describe("conversation positions", () => {
  it("restores the position only for the same conversation", () => {
    openMessengerConversationPosition(topicA).save(anchor);
    expect(openMessengerConversationPosition(topicB).read()).toBeNull();
    expect(openMessengerConversationPosition(topicA).read()).toEqual(anchor);
  });

  it("read-all invalidates the topic and stream view, including delayed saves", () => {
    const lease = openMessengerConversationPosition(topicA);
    lease.save(anchor);
    openMessengerConversationPosition("stream:11111111-1111-4111-8111-111111111111").save(anchor);
    openMessengerConversationPosition(topicB).save(anchor);
    forgetMessengerConversationPositions({
      streamUuid: "11111111-1111-4111-8111-111111111111",
      topicUuid: "33333333-3333-4333-8333-333333333333",
    });
    lease.save(anchor);
    expect(openMessengerConversationPosition(topicA).read()).toBeNull();
    expect(
      openMessengerConversationPosition("stream:11111111-1111-4111-8111-111111111111").read(),
    ).toBeNull();
    expect(openMessengerConversationPosition(topicB).read()).toEqual(anchor);
  });

  it("lets a new user scroll establish a position after read-all", () => {
    const lease = openMessengerConversationPosition(topicA);
    lease.save(anchor);
    forgetMessengerConversationPositions({ streamUuid: "11111111-1111-4111-8111-111111111111" });
    lease.save({ ...anchor, messageKey: "message-b" }, true);
    expect(openMessengerConversationPosition(topicA).read()?.messageKey).toBe("message-b");
  });

  it("stream read-all clears every topic of the stream but preserves other streams", () => {
    for (const id of [
      topicA,
      topicB,
      "topic:22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333",
    ] as const)
      openMessengerConversationPosition(id).save(anchor);
    forgetMessengerConversationPositions({ streamUuid: "11111111-1111-4111-8111-111111111111" });
    expect(openMessengerConversationPosition(topicA).read()).toBeNull();
    expect(openMessengerConversationPosition(topicB).read()).toBeNull();
    expect(
      openMessengerConversationPosition(
        "topic:22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333",
      ).read(),
    ).toEqual(anchor);
  });

  it("rejects old view writes after a runtime switch, including a return to the same owner", () => {
    const lease = openMessengerConversationPosition(topicA);
    lease.save(anchor);
    runtime = { ...runtime!, runtimeGeneration: ++generation };
    lease.save(anchor, true);
    expect(openMessengerConversationPosition(topicA).read()).toBeNull();
  });

  it("clears positions on logout", () => {
    openMessengerConversationPosition(topicA).save(anchor);
    runtime = null;
    expect(openMessengerConversationPosition(topicA).read()).toBeNull();
  });

  it("bounds session memory to the most recently opened conversations", () => {
    openMessengerConversationPosition(topicA).save(anchor);
    for (let i = 0; i < 12; i++)
      openMessengerConversationPosition(
        `topic:11111111-1111-4111-8111-111111111111:topic-${i}`,
      ).save(anchor);
    expect(openMessengerConversationPosition(topicA).read()).toBeNull();
  });
});

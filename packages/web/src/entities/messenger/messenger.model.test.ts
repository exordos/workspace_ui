import { beforeEach, describe, expect, it } from "vitest";
import { useMessengerStore } from "./messenger.model";
import type { MessengerStreamBinding } from "./messenger.types";

const OWNER_KEY = "account-a:instance-a:organization-a:project-a";
const OTHER_OWNER_KEY = "account-b:instance-b:organization-b:project-b";
const PROJECT_A = "22222222-2222-4222-8222-222222222222";
const STREAM_A = "75309057-419c-4b12-a7c1-3932429ec4a6";
const STREAM_B = "37a28696-153d-431e-a5fb-36f0c0209765";
const USER_A = "11111111-1111-4111-8111-111111111111";
const BINDING_A = "dff7201e-5120-422d-ac5a-3cbe596dd71b";
const BINDING_B = "3ba0d6e2-b7cd-4e70-90f8-89b202f8d1e7";
const BINDING_C = "7c1ce67c-2ec3-4e1b-9380-458bd8c607f2";
const DATE = "2026-06-22T10:10:00Z";

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

describe("messenger store", () => {
  beforeEach(() => {
    useMessengerStore.getState().clear();
    useMessengerStore.getState().startBootstrap(OWNER_KEY);
  });

  it("removes a stream binding from id and stream indexes for the current owner only", () => {
    useMessengerStore
      .getState()
      .upsertStreamBindings(OWNER_KEY, [
        createStreamBinding(),
        createStreamBinding({ uuid: BINDING_B, streamUuid: STREAM_B }),
      ]);

    useMessengerStore
      .getState()
      .removeStreamBinding(OTHER_OWNER_KEY, { uuid: BINDING_A, streamUuid: STREAM_A });

    expect(useMessengerStore.getState().streamBindingIds).toEqual([BINDING_A, BINDING_B]);

    useMessengerStore
      .getState()
      .removeStreamBinding(OWNER_KEY, { uuid: BINDING_A, streamUuid: STREAM_A });

    const state = useMessengerStore.getState();
    expect(state.streamBindingsById[BINDING_A]).toBeUndefined();
    expect(state.streamBindingsById[BINDING_B]).toMatchObject({ uuid: BINDING_B });
    expect(state.streamBindingIds).toEqual([BINDING_B]);
    expect(state.streamBindingIdsByStreamId[STREAM_A]).toEqual([]);
    expect(state.streamBindingIdsByStreamId[STREAM_B]).toEqual([BINDING_B]);
  });

  it("replaces stream bindings for one stream and removes stale bindings from that stream", () => {
    useMessengerStore
      .getState()
      .upsertStreamBindings(OWNER_KEY, [
        createStreamBinding(),
        createStreamBinding({ uuid: BINDING_B }),
      ]);

    useMessengerStore
      .getState()
      .replaceStreamBindingsForStream(OWNER_KEY, STREAM_A, [
        createStreamBinding({ uuid: BINDING_C }),
      ]);

    const state = useMessengerStore.getState();
    expect(state.streamBindingsById[BINDING_A]).toBeUndefined();
    expect(state.streamBindingsById[BINDING_B]).toBeUndefined();
    expect(state.streamBindingsById[BINDING_C]).toMatchObject({ uuid: BINDING_C });
    expect(state.streamBindingIds).toEqual([BINDING_C]);
    expect(state.streamBindingIdsByStreamId[STREAM_A]).toEqual([BINDING_C]);
    expect(state.streamBindingsLoadedByStreamId[STREAM_A]).toBe(true);
  });

  it("replaces stream bindings without removing bindings from another stream", () => {
    useMessengerStore
      .getState()
      .upsertStreamBindings(OWNER_KEY, [
        createStreamBinding(),
        createStreamBinding({ uuid: BINDING_B, streamUuid: STREAM_B }),
      ]);

    useMessengerStore.getState().replaceStreamBindingsForStream(OWNER_KEY, STREAM_A, []);

    const state = useMessengerStore.getState();
    expect(state.streamBindingsById[BINDING_A]).toBeUndefined();
    expect(state.streamBindingsById[BINDING_B]).toMatchObject({ uuid: BINDING_B });
    expect(state.streamBindingIds).toEqual([BINDING_B]);
    expect(state.streamBindingIdsByStreamId[STREAM_A]).toEqual([]);
    expect(state.streamBindingIdsByStreamId[STREAM_B]).toEqual([BINDING_B]);
  });

  it("clears old stream bindings on an empty replacement and marks the stream as loaded", () => {
    useMessengerStore.getState().upsertStreamBindings(OWNER_KEY, [createStreamBinding()]);

    useMessengerStore.getState().replaceStreamBindingsForStream(OWNER_KEY, STREAM_A, []);

    const state = useMessengerStore.getState();
    expect(state.streamBindingsById[BINDING_A]).toBeUndefined();
    expect(state.streamBindingIds).toEqual([]);
    expect(state.streamBindingIdsByStreamId[STREAM_A]).toEqual([]);
    expect(state.streamBindingsLoadedByStreamId[STREAM_A]).toBe(true);
  });
});

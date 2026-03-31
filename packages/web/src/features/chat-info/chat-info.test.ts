/**
 * Tests for the chat-info feature — unified DM/channel info panel store.
 *
 * The store manages loading state and data for both DM partner info
 * and channel/stream info panels, distinguished by the `type` field.
 */
import { afterEach, describe, expect, it } from "vitest";
import { useChatInfoStore } from "./chat-info.model";
import type { ChatInfoData, ChatInfoMember } from "./chat-info.types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEMBER_ALICE: ChatInfoMember = {
  userId: 1,
  fullName: "Alice",
  email: "alice@example.com",
  avatarUrl: null,
  isOnline: true,
};

const MEMBER_BOB: ChatInfoMember = {
  userId: 2,
  fullName: "Bob",
  email: "bob@example.com",
  avatarUrl: "/avatars/bob.png",
  isOnline: false,
};

const DM_INFO: ChatInfoData = {
  type: "dm",
  name: "Alice",
  memberCount: 2,
  onlineCount: 1,
  members: [MEMBER_ALICE, MEMBER_BOB],
  description: null,
  isMuted: false,
};

const STREAM_INFO: ChatInfoData = {
  type: "stream",
  name: "engineering",
  memberCount: 25,
  onlineCount: 8,
  members: [MEMBER_ALICE, MEMBER_BOB],
  description: "Engineering discussions",
  isMuted: true,
};

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

describe("useChatInfoStore", () => {
  afterEach(() => {
    useChatInfoStore.getState().clear();
  });

  it("starts with null data and no loading", () => {
    const state = useChatInfoStore.getState();
    expect(state.data).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("setData stores DM info", () => {
    useChatInfoStore.getState().setData(DM_INFO);
    const state = useChatInfoStore.getState();
    expect(state.data?.type).toBe("dm");
    expect(state.data?.name).toBe("Alice");
    expect(state.loading).toBe(false);
  });

  it("setData stores stream info with description", () => {
    useChatInfoStore.getState().setData(STREAM_INFO);
    const state = useChatInfoStore.getState();
    expect(state.data?.type).toBe("stream");
    expect(state.data?.description).toBe("Engineering discussions");
    expect(state.data?.isMuted).toBe(true);
  });

  it("setLoading toggles loading state", () => {
    useChatInfoStore.getState().setLoading(true);
    expect(useChatInfoStore.getState().loading).toBe(true);
  });

  it("setError stores error and clears loading", () => {
    useChatInfoStore.setState({ loading: true });
    useChatInfoStore.getState().setError("Failed to load");
    const state = useChatInfoStore.getState();
    expect(state.error).toBe("Failed to load");
    expect(state.loading).toBe(false);
  });

  it("clear resets all state", () => {
    useChatInfoStore.getState().setData(STREAM_INFO);
    useChatInfoStore.getState().clear();
    const state = useChatInfoStore.getState();
    expect(state.data).toBeNull();
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
  });

  it("setData replaces previous data", () => {
    useChatInfoStore.getState().setData(DM_INFO);
    useChatInfoStore.getState().setData(STREAM_INFO);
    expect(useChatInfoStore.getState().data?.type).toBe("stream");
  });

  it("setData clears previous error", () => {
    useChatInfoStore.setState({ error: "old error" });
    useChatInfoStore.getState().setData(DM_INFO);
    expect(useChatInfoStore.getState().error).toBeNull();
  });
});

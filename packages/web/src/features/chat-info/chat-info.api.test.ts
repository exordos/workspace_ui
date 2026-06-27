import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchStreamMemberBindings, fetchStreams } from "~/shared/api/messenger-streams";
import {
  invalidateStream,
  loadStreamMembers,
  loadStreamMembersSnapshot,
  loadStreamMetadata,
  loadStreamsSnapshot,
  resetChatInfoApiCacheForTests,
} from "./chat-info.api";

vi.mock("~/shared/api/messenger-streams", () => ({
  fetchStreamMemberBindings: vi.fn(),
  fetchStreams: vi.fn(),
}));

const STREAM_A_UUID = "11111111-1111-4111-8111-111111111111";
const STREAM_B_UUID = "22222222-2222-4222-8222-222222222222";
const USER_A_UUID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B_UUID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const USER_C_UUID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const BINDING_A_UUID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const BINDING_B_UUID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const BINDING_C_UUID = "ffffffff-ffff-4fff-8fff-ffffffffffff";

describe("chat-info.api", () => {
  afterEach(() => {
    resetChatInfoApiCacheForTests();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("deduplicates in-flight member requests for the same stream", async () => {
    vi.mocked(fetchStreamMemberBindings).mockResolvedValue([
      { uuid: BINDING_A_UUID, stream_uuid: STREAM_A_UUID, user_uuid: USER_A_UUID, role: "owner" },
      { uuid: BINDING_B_UUID, stream_uuid: STREAM_A_UUID, user_uuid: USER_B_UUID, role: "member" },
      { uuid: BINDING_C_UUID, stream_uuid: STREAM_A_UUID, user_uuid: USER_C_UUID, role: "member" },
    ]);

    const [left, right] = await Promise.all([
      loadStreamMembers("inst-a", STREAM_A_UUID),
      loadStreamMembers("inst-a", STREAM_A_UUID),
    ]);

    expect(left).toEqual([USER_A_UUID, USER_B_UUID, USER_C_UUID]);
    expect(right).toEqual([USER_A_UUID, USER_B_UUID, USER_C_UUID]);
    expect(fetchStreamMemberBindings).toHaveBeenCalledTimes(1);
  });

  it("reuses members cache until TTL expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-26T09:00:00.000Z"));
    vi.mocked(fetchStreamMemberBindings).mockResolvedValue([
      { uuid: BINDING_A_UUID, stream_uuid: STREAM_A_UUID, user_uuid: USER_A_UUID, role: "owner" },
      { uuid: BINDING_B_UUID, stream_uuid: STREAM_A_UUID, user_uuid: USER_B_UUID, role: "member" },
    ]);

    await loadStreamMembers("inst-a", STREAM_A_UUID);
    await loadStreamMembers("inst-a", STREAM_A_UUID);

    expect(fetchStreamMemberBindings).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-03-26T09:01:01.000Z"));
    await loadStreamMembers("inst-a", STREAM_A_UUID);

    expect(fetchStreamMemberBindings).toHaveBeenCalledTimes(2);
  });

  it("loads stream member roles from bindings", async () => {
    vi.mocked(fetchStreamMemberBindings).mockResolvedValue([
      { uuid: BINDING_A_UUID, stream_uuid: STREAM_A_UUID, user_uuid: USER_A_UUID, role: "owner" },
      { uuid: BINDING_B_UUID, stream_uuid: STREAM_A_UUID, user_uuid: USER_B_UUID, role: "member" },
    ]);

    const snapshot = await loadStreamMembersSnapshot("inst-a", STREAM_A_UUID);

    expect(snapshot.memberIds).toEqual([USER_A_UUID, USER_B_UUID]);
    expect(snapshot.rolesByUserId).toEqual({
      [USER_A_UUID]: "owner",
      [USER_B_UUID]: "member",
    });
    expect(snapshot.bindingUuidsByUserId).toEqual({
      [USER_A_UUID]: BINDING_A_UUID,
      [USER_B_UUID]: BINDING_B_UUID,
    });
  });

  it("isolates streams snapshot cache by instance id", async () => {
    vi.mocked(fetchStreams)
      .mockResolvedValueOnce([
        {
          stream_uuid: STREAM_A_UUID,
          name: "eng",
          description: "A",
          is_announcement_only: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          stream_uuid: STREAM_B_UUID,
          name: "design",
          description: "B",
          is_announcement_only: false,
        },
      ]);

    const a1 = await loadStreamsSnapshot("inst-a");
    const a2 = await loadStreamsSnapshot("inst-a");
    const b1 = await loadStreamsSnapshot("inst-b");

    expect(a1[0]?.stream_uuid).toBe(STREAM_A_UUID);
    expect(a2[0]?.stream_uuid).toBe(STREAM_A_UUID);
    expect(b1[0]?.stream_uuid).toBe(STREAM_B_UUID);
    expect(fetchStreams).toHaveBeenCalledTimes(2);
  });

  it("loads metadata from cached streams snapshot and invalidates on demand", async () => {
    vi.mocked(fetchStreams)
      .mockResolvedValueOnce([
        {
          stream_uuid: STREAM_A_UUID,
          name: "eng",
          description: "First",
          is_announcement_only: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          stream_uuid: STREAM_A_UUID,
          name: "eng",
          description: "Second",
          is_announcement_only: false,
        },
      ]);

    const first = await loadStreamMetadata("inst-a", STREAM_A_UUID);
    const second = await loadStreamMetadata("inst-a", STREAM_A_UUID);
    invalidateStream("inst-a", STREAM_A_UUID);
    const third = await loadStreamMetadata("inst-a", STREAM_A_UUID);

    expect(first.description).toBe("First");
    expect(second.description).toBe("First");
    expect(third.description).toBe("Second");
    expect(fetchStreams).toHaveBeenCalledTimes(2);
  });
});

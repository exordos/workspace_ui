/**
 * Tests for user profile feature backed by the new users API.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { useUserProfileStore } from "./user-profile.model";

const USER_UUID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_UUID = "22222222-2222-4222-8222-222222222222";

const { fetchUserMock, requestUserStatusMock } = vi.hoisted(() => ({
  fetchUserMock: vi.fn(),
  requestUserStatusMock: vi.fn((_userId?: unknown, _options?: unknown) => Promise.resolve()),
}));

vi.mock("~/shared/api/messenger-users", () => ({
  fetchUser: (userId: unknown, options?: unknown) => fetchUserMock(userId, options),
}));

vi.mock("~/entities/user/api/user.api", () => ({
  requestUserStatus: (userId: unknown, options?: unknown) => requestUserStatusMock(userId, options),
}));

const MOCK_USER = {
  user_id: USER_UUID,
  full_name: "Alice Wonderland",
  email: "alice@example.com",
  avatar_url: "https://example.com/avatar.png",
  role: 400,
  is_active: true,
};

describe("useUserProfileStore", () => {
  afterEach(() => {
    useUserProfileStore.getState().clear();
    useUsersStore.getState().clear();
    useInstancesStore.setState({ instances: [], currentInstanceId: null, activeOrgEpoch: 0 });
    fetchUserMock.mockReset();
    requestUserStatusMock.mockReset();
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    it("starts idle with no profile", () => {
      const state = useUserProfileStore.getState();
      expect(state.status).toBe("idle");
      expect(state.profile).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe("loadProfile", () => {
    it("loads a UUID profile from the new users API", async () => {
      fetchUserMock.mockResolvedValue(MOCK_USER);

      await useUserProfileStore.getState().loadProfile(USER_UUID);

      expect(fetchUserMock).toHaveBeenCalledWith(USER_UUID, undefined);

      const state = useUserProfileStore.getState();
      expect(state.status).toBe("done");
      expect(state.profile).toEqual({
        userId: USER_UUID,
        fullName: "Alice Wonderland",
        email: "alice@example.com",
        avatarUrl: "https://example.com/avatar.png",
        role: 400,
        isActive: true,
      });

      const merged = useUsersStore.getState().getUser(USER_UUID);
      expect(merged?.full_name).toBe("Alice Wonderland");
      expect(merged?.email).toBe("alice@example.com");
      expect(merged?.avatar_url).toBe("https://example.com/avatar.png");
      expect(merged?.role).toBe(400);
      expect(merged?.is_active).toBe(true);
      expect(requestUserStatusMock).toHaveBeenCalledWith(USER_UUID, {
        reason: "right_panel",
        priority: "high",
      });
    });

    it("handles optional fields omitted by the new backend", async () => {
      fetchUserMock.mockResolvedValue({
        user_id: OTHER_USER_UUID,
        full_name: "Bob",
      });

      await useUserProfileStore.getState().loadProfile(OTHER_USER_UUID);

      const state = useUserProfileStore.getState();
      expect(state.status).toBe("done");
      expect(state.profile).toEqual({
        userId: OTHER_USER_UUID,
        fullName: "Bob",
        email: "",
        avatarUrl: undefined,
        role: undefined,
        isActive: undefined,
      });
    });

    it("sets error when the user is not returned", async () => {
      fetchUserMock.mockResolvedValue(null);

      await useUserProfileStore.getState().loadProfile(USER_UUID);

      const state = useUserProfileStore.getState();
      expect(state.status).toBe("error");
      expect(state.error).toContain("Failed");
      expect(state.profile).toBeNull();
      expect(requestUserStatusMock).not.toHaveBeenCalled();
    });

    it("sets error on network exception", async () => {
      fetchUserMock.mockRejectedValue(new Error("timeout"));

      await useUserProfileStore.getState().loadProfile(USER_UUID);

      const state = useUserProfileStore.getState();
      expect(state.status).toBe("error");
    });

    it("does not apply stale profile after organization switch and clear", async () => {
      useInstancesStore.setState({
        instances: [
          {
            id: "inst-a",
            realm: "https://a.test",
            login: "a@test.com",
            authType: "iam",
            iamAccessToken: "a-key",
          },
          {
            id: "inst-b",
            realm: "https://b.test",
            login: "b@test.com",
            authType: "iam",
            iamAccessToken: "b-key",
          },
        ],
        currentInstanceId: "inst-a",
        activeOrgEpoch: 0,
      });

      let resolveResponse: ((value: typeof MOCK_USER) => void) | undefined;
      fetchUserMock.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveResponse = resolve;
          }),
      );

      const pending = useUserProfileStore.getState().loadProfile(USER_UUID);
      useInstancesStore.getState().setCurrentInstanceId("inst-b");
      useUserProfileStore.getState().clear();

      expect(resolveResponse).toBeTypeOf("function");
      resolveResponse!(MOCK_USER);

      await pending;

      const state = useUserProfileStore.getState();
      expect(state.status).toBe("idle");
      expect(state.profile).toBeNull();
      expect(state.error).toBeNull();
      expect(useUsersStore.getState().getUser(USER_UUID)).toBeUndefined();
      expect(requestUserStatusMock).not.toHaveBeenCalled();
    });
  });

  describe("clear", () => {
    it("resets profile and status", async () => {
      fetchUserMock.mockResolvedValue(MOCK_USER);

      await useUserProfileStore.getState().loadProfile(USER_UUID);
      useUserProfileStore.getState().clear();

      const state = useUserProfileStore.getState();
      expect(state.status).toBe("idle");
      expect(state.profile).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe("status transitions", () => {
    it("transitions through loading to done", async () => {
      const statuses: string[] = [];
      const unsub = useUserProfileStore.subscribe((s) => statuses.push(s.status));

      fetchUserMock.mockResolvedValue(MOCK_USER);

      await useUserProfileStore.getState().loadProfile(USER_UUID);
      unsub();

      expect(statuses).toContain("loading");
      expect(statuses).toContain("done");
    });

    it("transitions through loading to error on failure", async () => {
      const statuses: string[] = [];
      const unsub = useUserProfileStore.subscribe((s) => statuses.push(s.status));

      fetchUserMock.mockResolvedValue(null);

      await useUserProfileStore.getState().loadProfile(USER_UUID);
      unsub();

      expect(statuses).toContain("loading");
      expect(statuses).toContain("error");
    });
  });
});

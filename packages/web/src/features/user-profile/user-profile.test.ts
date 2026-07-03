import { afterEach, describe, expect, it, vi } from "vitest";
import { useInstancesStore } from "~/entities/instance/instance.model";
import { useUsersStore } from "~/entities/user/user.model";
import { clearRealmProfileFieldsCache } from "~/shared/api/zulip-realm-profile-fields";
import { useUserProfileStore } from "./user-profile.model";

vi.mock("~/shared/api/client", () => ({
  zulipApi: {
    get: vi.fn(),
  },
  getCurrentInstance: vi.fn(() => null),
}));

const MOCK_ZULIP_USER = {
  user: {
    user_id: 42,
    full_name: "Alice Wonderland",
    email: "alice@example.com",
    avatar_url: "https://example.com/avatar.png",
    role: 400,
    is_bot: false,
    is_active: true,
    date_joined: "2025-01-10T08:15:00Z",
    timezone: "Europe/Moscow",
    profile_data: {
      "1": { value: "Engineer" },
      "2": { value: "+7-999-123-4567" },
    },
  },
};

describe("useUserProfileStore", () => {
  afterEach(() => {
    useUserProfileStore.getState().clear();
    useUsersStore.getState().clear();
    useInstancesStore.setState({ instances: [], currentInstanceId: null, activeOrgEpoch: 0 });
    clearRealmProfileFieldsCache();
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
    it("does not call legacy Zulip profile endpoint during user store cutover", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.get).mockResolvedValue({
        ok: true,
        status: 200,
        data: MOCK_ZULIP_USER,
        headers: new Headers(),
        raw: new Response(),
        durationMs: 50,
      });

      await useUserProfileStore.getState().loadProfile(42);

      expect(zulipApi.get).not.toHaveBeenCalled();

      const state = useUserProfileStore.getState();
      expect(state.status).toBe("done");
      expect(state.profile).toBeNull();
      expect(state.error).toBeNull();
      expect(useUsersStore.getState().getUser("42")).toBeUndefined();
    });

    it("does not load legacy custom profile fields during user store cutover", async () => {
      const { zulipApi, getCurrentInstance } = await import("~/shared/api/client");
      vi.mocked(getCurrentInstance).mockReturnValue({
        id: "test-inst",
        realm: "https://z.example.com",
        email: "a@b.com",
        apiKey: "key",
      });
      vi.mocked(zulipApi.get).mockImplementation((path: string) => {
        if (path === "/realm/profile_fields") {
          return Promise.resolve({
            ok: true,
            status: 200,
            data: {
              custom_fields: [
                { id: 5, name: "Должность", type: 1, order: 1 },
                { id: 6, name: "Телефон", type: 1, order: 2 },
              ],
            },
            headers: new Headers(),
            raw: new Response(),
            durationMs: 1,
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          data: {
            user: {
              user_id: 7,
              full_name: "Sam",
              email: "sam@example.com",
              avatar_url: "",
              role: 400,
              profile_data: {
                "5": { value: "AQA Lead" },
                "6": { value: "+7 900 000-00-00" },
              },
            },
          },
          headers: new Headers(),
          raw: new Response(),
          durationMs: 1,
        });
      });

      await useUserProfileStore.getState().loadProfile(7);

      const state = useUserProfileStore.getState();
      expect(zulipApi.get).not.toHaveBeenCalled();
      expect(state.status).toBe("done");
      expect(state.profile).toBeNull();
    });

    it("ignores failed legacy response mocks because profile fetch is disabled", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.get).mockResolvedValue({
        ok: false,
        status: 404,
        data: null,
        headers: new Headers(),
        raw: new Response(),
        durationMs: 10,
      });

      await useUserProfileStore.getState().loadProfile(999);

      const state = useUserProfileStore.getState();
      expect(zulipApi.get).not.toHaveBeenCalled();
      expect(state.status).toBe("done");
      expect(state.error).toBeNull();
      expect(state.profile).toBeNull();
    });

    it("sets error when user id validation fails", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.get).mockRejectedValue(new Error("timeout"));

      await useUserProfileStore.getState().loadProfile(0);

      const state = useUserProfileStore.getState();
      expect(zulipApi.get).not.toHaveBeenCalled();
      expect(state.status).toBe("error");
    });

    it("finishes without profile when legacy profile fields are unavailable during cutover", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.get).mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          user: {
            user_id: 10,
            full_name: "Bob",
            email: "bob@example.com",
            avatar_url: "",
            role: 400,
          },
        },
        headers: new Headers(),
        raw: new Response(),
        durationMs: 20,
      });

      await useUserProfileStore.getState().loadProfile(10);

      const state = useUserProfileStore.getState();
      expect(state.status).toBe("done");
      expect(state.profile).toBeNull();
      expect(state.error).toBeNull();
    });

    it("does not apply stale profile after organization switch and clear", async () => {
      const { zulipApi, getCurrentInstance } = await import("~/shared/api/client");
      vi.mocked(getCurrentInstance).mockReturnValue(null);
      useInstancesStore.setState({
        instances: [
          { id: "inst-a", realm: "https://a.test", email: "a@test.com", apiKey: "a-key" },
          { id: "inst-b", realm: "https://b.test", email: "b@test.com", apiKey: "b-key" },
        ],
        currentInstanceId: "inst-a",
        activeOrgEpoch: 0,
      });

      vi.mocked(zulipApi.get).mockResolvedValue({
        ok: true,
        status: 200,
        data: MOCK_ZULIP_USER,
        headers: new Headers(),
        raw: new Response(),
        durationMs: 50,
      });

      const pending = useUserProfileStore.getState().loadProfile(42);
      useInstancesStore.getState().setCurrentInstanceId("inst-b");
      useUserProfileStore.getState().clear();

      await pending;

      const state = useUserProfileStore.getState();
      expect(state.status).toBe("idle");
      expect(state.profile).toBeNull();
      expect(state.error).toBeNull();
      expect(useUsersStore.getState().getUser("42")).toBeUndefined();
    });
  });

  describe("clear", () => {
    it("resets profile and status", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.get).mockResolvedValue({
        ok: true,
        status: 200,
        data: MOCK_ZULIP_USER,
        headers: new Headers(),
        raw: new Response(),
        durationMs: 50,
      });

      await useUserProfileStore.getState().loadProfile(42);
      useUserProfileStore.getState().clear();

      const state = useUserProfileStore.getState();
      expect(state.status).toBe("idle");
      expect(state.profile).toBeNull();
      expect(state.error).toBeNull();
    });
  });

  describe("status transitions", () => {
    it("transitions through loading to done", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      const statuses: string[] = [];
      const unsub = useUserProfileStore.subscribe((s) => statuses.push(s.status));

      vi.mocked(zulipApi.get).mockResolvedValue({
        ok: true,
        status: 200,
        data: MOCK_ZULIP_USER,
        headers: new Headers(),
        raw: new Response(),
        durationMs: 50,
      });

      await useUserProfileStore.getState().loadProfile(42);
      unsub();

      expect(statuses).toContain("loading");
      expect(statuses).toContain("done");
    });

    it("transitions through loading to done when legacy failure mocks are unused", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      const statuses: string[] = [];
      const unsub = useUserProfileStore.subscribe((s) => statuses.push(s.status));

      vi.mocked(zulipApi.get).mockResolvedValue({
        ok: false,
        status: 500,
        data: null,
        headers: new Headers(),
        raw: new Response(),
        durationMs: 10,
      });

      await useUserProfileStore.getState().loadProfile(42);
      unsub();

      expect(statuses).toContain("loading");
      expect(statuses).toContain("done");
    });
  });
});

/**
 * Tests for user profile feature — loading, caching, clearing, and error handling.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
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
    it("loads profile on success", async () => {
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

      expect(zulipApi.get).toHaveBeenCalledWith("/users/42", {
        client_gravatar: "false",
        include_custom_profile_fields: "true",
      });

      const state = useUserProfileStore.getState();
      expect(state.status).toBe("done");
      expect(state.profile).not.toBeNull();
      expect(state.profile!.userId).toBe(42);
      expect(state.profile!.fullName).toBe("Alice Wonderland");
      expect(state.profile!.email).toBe("alice@example.com");
      expect(state.profile!.timezone).toBe("Europe/Moscow");
      expect(state.profile!.jobTitle).toBe("Engineer");
      expect(state.profile!.phone).toBe("+7-999-123-4567");
      expect(state.profile!.isBot).toBe(false);
      expect(state.profile!.isActive).toBe(true);
      expect(state.profile!.dateJoined).toBe("2025-01-10T08:15:00Z");
    });

    it("maps profile_data using realm field definitions when instance is active", async () => {
      const { zulipApi, getCurrentInstance } = await import("~/shared/api/client");
      vi.mocked(getCurrentInstance).mockReturnValue({
        id: "test-inst",
        realm: "https://z.example.com",
        email: "a@b.com",
        apiKey: "key",
      });
      vi.mocked(zulipApi.get).mockImplementation(async (path: string) => {
        if (path === "/realm/profile_fields") {
          return {
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
          };
        }
        return {
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
        };
      });

      await useUserProfileStore.getState().loadProfile(7);

      const state = useUserProfileStore.getState();
      expect(state.profile?.jobTitle).toBe("AQA Lead");
      expect(state.profile?.phone).toBe("+7 900 000-00-00");
    });

    it("sets error on failed response", async () => {
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
      expect(state.status).toBe("error");
      expect(state.error).toContain("Failed");
      expect(state.profile).toBeNull();
    });

    it("sets error on network exception", async () => {
      const { zulipApi } = await import("~/shared/api/client");
      vi.mocked(zulipApi.get).mockRejectedValue(new Error("timeout"));

      await useUserProfileStore.getState().loadProfile(42);

      const state = useUserProfileStore.getState();
      expect(state.status).toBe("error");
    });

    it("handles missing optional profile fields", async () => {
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
      expect(state.profile!.userId).toBe(10);
      expect(state.profile!.jobTitle).toBeUndefined();
      expect(state.profile!.phone).toBeUndefined();
      expect(state.profile!.timezone).toBeUndefined();
      expect(state.profile!.isBot).toBeUndefined();
      expect(state.profile!.isActive).toBeUndefined();
      expect(state.profile!.dateJoined).toBeUndefined();
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

    it("transitions through loading to error on failure", async () => {
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
      expect(statuses).toContain("error");
    });
  });
});

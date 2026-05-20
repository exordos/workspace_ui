/**
 * Tests for usersStore — the user profile and presence cache.
 *
 * Stores user_id → {full_name, email, avatar_url, presence} mappings derived
 * from API responses and message payloads. Also maintains an email→userId index
 * for presence updates that arrive keyed by email (Zulip presence events).
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ZulipRawMessage } from "~/shared/api/zulip.types";
import { useUsersStore } from "./user.model";

function resetStore() {
  useUsersStore.getState().clear();
}

// Verifies merge semantics, presence updates, avatar/name helpers, and index integrity.
describe("usersStore", () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  // mergeUser is the primary insert/update — used for both initial load and live events.
  describe("mergeUser", () => {
    // A new user_id must create a fresh entry with all provided fields.
    it("adds a new user to the store", () => {
      useUsersStore.getState().mergeUser({ user_id: 1, full_name: "Alice", email: "alice@t.com" });

      const user = useUsersStore.getState().getUser(1);
      expect(user).toBeDefined();
      expect(user!.full_name).toBe("Alice");
      expect(user!.email).toBe("alice@t.com");
    });

    // Partial updates must merge, not overwrite — missing fields are preserved.
    it("updates an existing user preserving fields not in payload", () => {
      useUsersStore.getState().mergeUser({
        user_id: 1,
        full_name: "Alice",
        email: "alice@t.com",
        avatar_url: "/avatar.png",
        role: 200,
      });
      useUsersStore.getState().mergeUser({ user_id: 1, full_name: "Alice Updated" });

      const user = useUsersStore.getState().getUser(1);
      expect(user!.full_name).toBe("Alice Updated");
      expect(user!.email).toBe("alice@t.com");
      expect(user!.avatar_url).toBe("/avatar.png");
      expect(user!.role).toBe(200);
    });

    // Email index is needed because Zulip presence events arrive keyed by email.
    it("builds email-to-userId index", () => {
      useUsersStore.getState().mergeUser({ user_id: 42, full_name: "Bob", email: "bob@t.com" });

      expect(useUsersStore.getState().emailToUserId.get("bob@t.com")).toBe(42);
    });

    // Defensive: null user_id from malformed API response must not corrupt the Map.
    it("ignores mergeUser when user_id is null", () => {
      useUsersStore
        .getState()
        .mergeUser({ user_id: null as unknown as number, full_name: "Ghost" });

      expect(useUsersStore.getState().users.size).toBe(0);
    });
  });

  // mergeUsers handles bulk loads (e.g. initial /users fetch).
  describe("mergeUsers", () => {
    // Batch insert must add all valid users in one state update for performance.
    it("adds multiple users in a single batch", () => {
      useUsersStore.getState().mergeUsers([
        { user_id: 1, full_name: "Alice" },
        { user_id: 2, full_name: "Bob", email: "bob@t.com" },
      ]);

      expect(useUsersStore.getState().users.size).toBe(2);
      expect(useUsersStore.getState().getUser(2)!.full_name).toBe("Bob");
    });

    // Invalid entries in a batch must be skipped without affecting valid ones.
    it("skips entries with null user_id", () => {
      useUsersStore.getState().mergeUsers([
        { user_id: null as unknown as number, full_name: "Ghost" },
        { user_id: 5, full_name: "Valid" },
      ]);

      expect(useUsersStore.getState().users.size).toBe(1);
    });

    it("stores is_active from Zulip directory payloads", () => {
      useUsersStore.getState().mergeUsers([{ user_id: 30, full_name: "Zed", is_active: false }]);
      expect(useUsersStore.getState().getUser(30)?.is_active).toBe(false);
    });

    it("preserves is_active when batch entry omits it", () => {
      useUsersStore.getState().mergeUsers([{ user_id: 31, full_name: "Y", is_active: false }]);
      useUsersStore.getState().mergeUsers([{ user_id: 31, full_name: "Yol" }]);
      expect(useUsersStore.getState().getUser(31)?.is_active).toBe(false);
    });

    it("merges profile_data from directory payloads", () => {
      useUsersStore.getState().mergeUsers([
        {
          user_id: 9,
          full_name: "Pat",
          profile_data: { "1": { value: "Lead", rendered_value: "<p>Lead</p>" } },
        },
      ]);
      expect(useUsersStore.getState().getUser(9)?.profile_data?.["1"]?.value).toBe("Lead");
    });

    it("preserves profile_data when batch entry omits it", () => {
      useUsersStore.getState().mergeUsers([
        {
          user_id: 11,
          full_name: "Sam",
          profile_data: { "2": { value: "Mgr" } },
        },
      ]);
      useUsersStore.getState().mergeUsers([{ user_id: 11, full_name: "Samuel" }]);
      expect(useUsersStore.getState().getUser(11)?.full_name).toBe("Samuel");
      expect(useUsersStore.getState().getUser(11)?.profile_data?.["2"]?.value).toBe("Mgr");
    });
  });

  // mergeFromMessage auto-populates the user cache from message payloads.
  describe("mergeFromMessage", () => {
    // Stream messages carry sender info — must be extracted to avoid extra API calls.
    it("extracts sender from a stream message", () => {
      const msg: ZulipRawMessage = {
        id: 100,
        sender_id: 10,
        sender_full_name: "Charlie",
        avatar_url: "/charlie.png",
        content: "hello",
        timestamp: 1000,
        type: "stream",
        stream_id: 5,
      };

      useUsersStore.getState().mergeFromMessage(msg);

      const user = useUsersStore.getState().getUser(10);
      expect(user).toBeDefined();
      expect(user!.full_name).toBe("Charlie");
      expect(user!.avatar_url).toBe("/charlie.png");
    });

    // DM messages include all participants in display_recipient — extract them all.
    it("extracts recipients from a private message", () => {
      const msg: ZulipRawMessage = {
        id: 101,
        sender_id: 10,
        sender_full_name: "Charlie",
        content: "hi",
        timestamp: 1000,
        type: "private",
        display_recipient: [
          { id: 10, full_name: "Charlie", email: "charlie@t.com" },
          { id: 20, full_name: "Dana", email: "dana@t.com", avatar_url: "/dana.png" },
        ],
      };

      useUsersStore.getState().mergeFromMessage(msg);

      expect(useUsersStore.getState().getUser(10)).toBeDefined();
      expect(useUsersStore.getState().getUser(20)).toBeDefined();
      expect(useUsersStore.getState().getUser(20)!.email).toBe("dana@t.com");
    });
  });

  // Presence (active/idle/offline) drives the green/yellow dot next to avatars.
  describe("presence", () => {
    // Direct update by userId — used when presence event includes user_id.
    it("setPresence updates user presence", () => {
      useUsersStore.getState().mergeUser({ user_id: 1, full_name: "Alice" });
      useUsersStore.getState().setPresence(1, { status: "active", timestamp: 5000 });

      expect(useUsersStore.getState().getUser(1)!.presence).toEqual({
        status: "active",
        timestamp: 5000,
      });
    });

    // Zulip presence events are keyed by email — must resolve via the index.
    it("setPresenceByEmail updates presence via email index", () => {
      useUsersStore.getState().mergeUser({ user_id: 1, full_name: "Alice", email: "alice@t.com" });
      useUsersStore
        .getState()
        .setPresenceByEmail("alice@t.com", { status: "idle", timestamp: 6000 });

      expect(useUsersStore.getState().getUser(1)!.presence!.status).toBe("idle");
    });

    // Unknown emails (e.g. users not yet loaded) must be silently ignored.
    it("setPresenceByEmail is a no-op for unknown email", () => {
      useUsersStore.getState().mergeUser({ user_id: 1, full_name: "Alice" });
      useUsersStore
        .getState()
        .setPresenceByEmail("unknown@t.com", { status: "active", timestamp: 7000 });

      expect(useUsersStore.getState().getUser(1)!.presence).toBeUndefined();
    });

    // Unknown userIds must not create phantom entries in the store.
    it("setPresence is a no-op for unknown userId", () => {
      useUsersStore.getState().setPresence(999, { status: "active", timestamp: 8000 });
      expect(useUsersStore.getState().users.size).toBe(0);
    });
  });

  describe("status", () => {
    it("setStatus stores custom emoji/text and timestamp", () => {
      useUsersStore.getState().mergeUser({ user_id: 1, full_name: "Alice" });
      useUsersStore.getState().setStatus(
        1,
        {
          text: "Focusing",
          emojiName: "speech_balloon",
          emojiCode: "1f4ac",
          reactionType: "unicode_emoji",
          away: false,
        },
        12345,
      );

      expect(useUsersStore.getState().getUser(1)?.status).toEqual({
        text: "Focusing",
        emojiName: "speech_balloon",
        emojiCode: "1f4ac",
        reactionType: "unicode_emoji",
        away: false,
      });
      expect(useUsersStore.getState().getUser(1)?.statusFetchedAt).toBe(12345);
      expect(useUsersStore.getState().getUser(1)?.statusFetchState).toBe("ready");
      expect(useUsersStore.getState().getUser(1)?.statusErrorKind).toBeUndefined();
      expect(useUsersStore.getState().getUser(1)?.statusNextRetryAt).toBeUndefined();
    });

    it("setStatus clears status when null is passed", () => {
      useUsersStore.getState().mergeUser({
        user_id: 1,
        full_name: "Alice",
        status: { text: "Lunch", away: false },
      });

      useUsersStore.getState().setStatus(1, null, 999);

      expect(useUsersStore.getState().getUser(1)?.status).toBeUndefined();
      expect(useUsersStore.getState().getUser(1)?.statusFetchedAt).toBe(999);
    });

    it("setStatus is a no-op for unknown users", () => {
      useUsersStore.getState().setStatus(999, { text: "Ghost", away: false });
      expect(useUsersStore.getState().users.size).toBe(0);
    });

    it("setStatusFetchMeta updates fetch-state metadata", () => {
      useUsersStore.getState().mergeUser({ user_id: 1, full_name: "Alice" });

      useUsersStore.getState().setStatusFetchMeta(1, {
        fetchState: "error",
        errorKind: "transient",
        nextRetryAt: 999_000,
        fetchedAt: 777_000,
      });

      const user = useUsersStore.getState().getUser(1);
      expect(user?.statusFetchState).toBe("error");
      expect(user?.statusErrorKind).toBe("transient");
      expect(user?.statusNextRetryAt).toBe(999_000);
      expect(user?.statusFetchedAt).toBe(777_000);
    });
  });

  // getAvatarUrl is used by Avatar component — must handle all edge cases.
  describe("getAvatarUrl", () => {
    // Normal case: user has a valid avatar URL.
    it("returns avatar_url for a user with one", () => {
      useUsersStore
        .getState()
        .mergeUser({ user_id: 1, full_name: "Alice", avatar_url: "/avatar.png" });

      expect(useUsersStore.getState().getAvatarUrl(1)).toBe("/avatar.png");
    });

    // Missing avatar triggers the fallback initials avatar in the UI.
    it("returns undefined for a user without avatar_url", () => {
      useUsersStore.getState().mergeUser({ user_id: 1, full_name: "Alice" });

      expect(useUsersStore.getState().getAvatarUrl(1)).toBeUndefined();
    });

    // Whitespace-only URLs must be treated as missing to avoid broken <img> tags.
    it("returns undefined for empty string avatar_url", () => {
      useUsersStore.getState().mergeUser({ user_id: 1, full_name: "Alice", avatar_url: "  " });

      expect(useUsersStore.getState().getAvatarUrl(1)).toBeUndefined();
    });

    // Unknown user must not throw — returns undefined for graceful fallback.
    it("returns undefined for unknown user", () => {
      expect(useUsersStore.getState().getAvatarUrl(999)).toBeUndefined();
    });
  });

  // getDisplayName is the single source of truth for rendering user names.
  describe("getDisplayName", () => {
    // Normal case: return the user's full_name.
    it("returns full_name when present", () => {
      useUsersStore.getState().mergeUser({ user_id: 1, full_name: "Alice Wonderland" });

      expect(useUsersStore.getState().getDisplayName(1)).toBe("Alice Wonderland");
    });

    // Empty name must fall back to "Unknown" to avoid blank UI elements.
    it("returns 'Unknown' for user with empty name", () => {
      useUsersStore.getState().mergeUser({ user_id: 1, full_name: "" });

      expect(useUsersStore.getState().getDisplayName(1)).toBe("Unknown");
    });

    // Non-existent user returns "Unknown" rather than crashing.
    it("returns 'Unknown' for nonexistent user", () => {
      expect(useUsersStore.getState().getDisplayName(999)).toBe("Unknown");
    });
  });

  // getAvatarMap provides a bulk lookup for rendering avatar grids.
  describe("getAvatarMap", () => {
    // Only users WITH avatars should appear — users without are excluded.
    it("returns a map of userId to avatar_url for all users with avatars", () => {
      useUsersStore.getState().mergeUsers([
        { user_id: 1, full_name: "A", avatar_url: "/a.png" },
        { user_id: 2, full_name: "B" },
        { user_id: 3, full_name: "C", avatar_url: "/c.png" },
      ]);

      const map = useUsersStore.getState().getAvatarMap();
      expect(map.size).toBe(2);
      expect(map.get(1)).toBe("/a.png");
      expect(map.get(3)).toBe("/c.png");
    });
  });

  // clear() is called on logout / instance switch to avoid data leaks.
  describe("clear", () => {
    // Both the user Map and email index must be wiped.
    it("empties all user data", () => {
      useUsersStore.getState().mergeUser({ user_id: 1, full_name: "A", email: "a@t.com" });
      useUsersStore.getState().clear();

      expect(useUsersStore.getState().users.size).toBe(0);
      expect(useUsersStore.getState().emailToUserId.size).toBe(0);
    });
  });
});

/**
 * Tests for the Mention Suggestions feature — @mention autocomplete.
 *
 * Covers the filterUsers pure function and the Zustand store
 * (query, visibility, results management, clear).
 */
import { afterEach, describe, expect, it } from "vitest";
import { filterUsers } from "./mention-suggest.lib";
import { useMentionSuggestStore } from "./mention-suggest.model";
import type { MentionSuggestion } from "./mention-suggest.types";

const USERS: MentionSuggestion[] = [
  {
    userUuid: "4f2f1a30-c0a0-4d8b-a001-000000000001",
    displayName: "Alice Johnson",
    username: "alice",
    email: "alice@example.com",
    status: "offline",
    avatarUrl: "https://cdn.example.com/a.jpg",
  },
  {
    userUuid: "4f2f1a30-c0a0-4d8b-a001-000000000002",
    displayName: "Bob Smith",
    username: "bobby",
    email: "bob@example.com",
    status: "offline",
  },
  {
    userUuid: "4f2f1a30-c0a0-4d8b-a001-000000000003",
    displayName: "Charlie Brown",
    username: "charlie",
    email: "charlie.b@example.com",
    status: "offline",
    avatarUrl: "https://cdn.example.com/c.jpg",
  },
  {
    userUuid: "4f2f1a30-c0a0-4d8b-a001-000000000004",
    displayName: "Diana Prince",
    username: "diana",
    email: "diana@example.com",
    status: "offline",
  },
  {
    userUuid: "4f2f1a30-c0a0-4d8b-a001-000000000005",
    displayName: "Алексей Иванов",
    username: "alexey",
    email: "alexey@example.com",
    status: "offline",
  },
  {
    userUuid: "4f2f1a30-c0a0-4d8b-a001-000000000006",
    displayName: "Eve Stone",
    username: "eve",
    email: "eve@example.com",
    status: "offline",
  },
  {
    userUuid: "4f2f1a30-c0a0-4d8b-a001-000000000007",
    displayName: "Frank Moore",
    username: "frank",
    email: "frank@example.com",
    status: "offline",
  },
  {
    userUuid: "4f2f1a30-c0a0-4d8b-a001-000000000008",
    displayName: "Grace Hopper",
    username: "grace",
    email: "grace@example.com",
    status: "offline",
  },
  {
    userUuid: "4f2f1a30-c0a0-4d8b-a001-000000000009",
    displayName: "Helen Hunt",
    username: "helen",
    email: "helen@example.com",
    status: "offline",
  },
  {
    userUuid: "4f2f1a30-c0a0-4d8b-a001-000000000010",
    displayName: "Ivan Petrov",
    username: "ivan",
    email: "ivan@example.com",
    status: "offline",
  },
  {
    userUuid: "4f2f1a30-c0a0-4d8b-a001-000000000011",
    displayName: "Jane Doe",
    username: "jane",
    email: "jane@example.com",
    status: "offline",
  },
];

describe("filterUsers", () => {
  it("returns all users for empty query", () => {
    const results = filterUsers("", USERS);
    expect(results).toHaveLength(USERS.length);
    expect(results.map((user) => user.userUuid)).toEqual(USERS.map((user) => user.userUuid));
  });

  it("returns all users for whitespace-only query", () => {
    const results = filterUsers("   ", USERS);
    expect(results).toHaveLength(USERS.length);
  });

  it("limits empty-query results only when maxResults is explicit", () => {
    const results = filterUsers("", USERS, 2);
    expect(results).toHaveLength(2);
    expect(results.map((user) => user.username)).toEqual(["alice", "bobby"]);
  });

  it("matches by Workspace UUID", () => {
    const results = filterUsers("000000000003", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.username).toBe("charlie");
  });

  it("matches by username case-insensitively", () => {
    const results = filterUsers("BOBBY", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.displayName).toBe("Bob Smith");
  });

  it("matches by display name case-insensitively", () => {
    const results = filterUsers("alice", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.userUuid).toBe("4f2f1a30-c0a0-4d8b-a001-000000000001");
  });

  it("matches by partial display name", () => {
    const results = filterUsers("john", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.displayName).toBe("Alice Johnson");
  });

  it("matches by email case-insensitively", () => {
    const results = filterUsers("CHARLIE.B@", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.username).toBe("charlie");
  });

  it("returns multiple matches", () => {
    const results = filterUsers("example.com", USERS);
    expect(results).toHaveLength(USERS.length);
  });

  it("handles Cyrillic characters", () => {
    const results = filterUsers("Алексей", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.username).toBe("alexey");
  });

  it("returns empty array for no matches", () => {
    expect(filterUsers("zzzzz", USERS)).toHaveLength(0);
  });

  it("returns empty array for empty users list", () => {
    expect(filterUsers("alice", [])).toHaveLength(0);
  });

  it("limits matches only when maxResults is explicit", () => {
    const results = filterUsers("example", USERS, 2);
    expect(results).toHaveLength(2);
  });
});

describe("useMentionSuggestStore", () => {
  afterEach(() => {
    useMentionSuggestStore.getState().clear();
  });

  it("starts with empty state", () => {
    const state = useMentionSuggestStore.getState();
    expect(state.query).toBe("");
    expect(state.results).toHaveLength(0);
    expect(state.visible).toBe(false);
  });

  it("sets query", () => {
    useMentionSuggestStore.getState().setQuery("alice");
    expect(useMentionSuggestStore.getState().query).toBe("alice");
  });

  it("sets results", () => {
    useMentionSuggestStore.getState().setResults(USERS.slice(0, 2));
    expect(useMentionSuggestStore.getState().results).toHaveLength(2);
  });

  it("shows suggestion dropdown", () => {
    useMentionSuggestStore.getState().show();
    expect(useMentionSuggestStore.getState().visible).toBe(true);
  });

  it("hides suggestion dropdown", () => {
    useMentionSuggestStore.getState().show();
    useMentionSuggestStore.getState().hide();
    expect(useMentionSuggestStore.getState().visible).toBe(false);
  });

  it("clears all state", () => {
    useMentionSuggestStore.getState().setQuery("test");
    useMentionSuggestStore.getState().setResults(USERS);
    useMentionSuggestStore.getState().show();

    useMentionSuggestStore.getState().clear();

    const state = useMentionSuggestStore.getState();
    expect(state.query).toBe("");
    expect(state.results).toHaveLength(0);
    expect(state.visible).toBe(false);
  });

  it("hide also clears query and results", () => {
    useMentionSuggestStore.getState().setQuery("test");
    useMentionSuggestStore.getState().setResults(USERS.slice(0, 1));
    useMentionSuggestStore.getState().show();

    useMentionSuggestStore.getState().hide();

    expect(useMentionSuggestStore.getState().query).toBe("");
    expect(useMentionSuggestStore.getState().results).toHaveLength(0);
  });
});

describe("filterUsers (edge cases)", () => {
  it("handles special regex metacharacters in query safely", () => {
    expect(() => filterUsers(".*+?^${}()|[]\\", USERS)).not.toThrow();
    expect(filterUsers(".*+?^${}()|[]\\", USERS)).toHaveLength(0);
  });

  it("handles very long query (>100 chars)", () => {
    const longQuery = "a".repeat(200);
    expect(filterUsers(longQuery, USERS)).toHaveLength(0);
  });

  it("single character query matches", () => {
    const results = filterUsers("b", USERS);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((user) => user.username.includes("b"))).toBe(true);
  });

  it("prioritizes UUID, username, display-name, then email matches", () => {
    const users: MentionSuggestion[] = [
      {
        userUuid: "zzzz-needle",
        displayName: "No Match",
        username: "plain",
        email: "plain@test.com",
        status: "offline",
      },
      {
        userUuid: "aaaa-other",
        displayName: "No Match",
        username: "needle",
        email: "other@test.com",
        status: "offline",
      },
      {
        userUuid: "bbbb-other",
        displayName: "Needle Name",
        username: "other",
        email: "other@test.com",
        status: "offline",
      },
      {
        userUuid: "cccc-other",
        displayName: "No Match",
        username: "other",
        email: "needle@test.com",
        status: "offline",
      },
    ];
    const results = filterUsers("needle", users);
    expect(results.map((user) => user.userUuid)).toEqual([
      "zzzz-needle",
      "aaaa-other",
      "bbbb-other",
      "cccc-other",
    ]);
  });

  it("user matching several fields appears once in the highest-priority group", () => {
    const users: MentionSuggestion[] = [
      {
        userUuid: "needle-user",
        displayName: "needle user",
        username: "needle",
        email: "needle@example.com",
        status: "offline",
      },
    ];
    const results = filterUsers("needle", users);
    expect(results).toHaveLength(1);
  });

  it("returns empty array when maxResults is 0", () => {
    expect(filterUsers("alice", USERS, 0)).toHaveLength(0);
  });

  it("trims leading and trailing whitespace from query", () => {
    const results = filterUsers("  alice  ", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.username).toBe("alice");
  });

  it("handles mixed case query matching", () => {
    const results = filterUsers("aLiCe", USERS);
    expect(results).toHaveLength(1);
  });
});

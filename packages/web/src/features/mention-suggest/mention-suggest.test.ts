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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USERS: MentionSuggestion[] = [
  {
    userId: 1,
    fullName: "Alice Johnson",
    email: "alice@example.com",
    avatarUrl: "https://cdn.example.com/a.jpg",
  },
  { userId: 2, fullName: "Bob Smith", email: "bob@example.com" },
  {
    userId: 3,
    fullName: "Charlie Brown",
    email: "charlie.b@example.com",
    avatarUrl: "https://cdn.example.com/c.jpg",
  },
  { userId: 4, fullName: "Diana Prince", email: "diana@example.com" },
  { userId: 5, fullName: "Алексей Иванов", email: "alexey@example.com" },
];

// ---------------------------------------------------------------------------
// filterUsers — pure function for matching users against a query
// ---------------------------------------------------------------------------

describe("filterUsers", () => {
  it("returns first maxResults users for empty query (bare @)", () => {
    const results = filterUsers("", USERS);
    expect(results).toHaveLength(5);
    expect(results[0]!.userId).toBe(1);
  });

  it("returns first maxResults users for whitespace-only query", () => {
    const results = filterUsers("   ", USERS);
    expect(results).toHaveLength(5);
  });

  it("respects maxResults for empty query", () => {
    const results = filterUsers("", USERS, 2);
    expect(results).toHaveLength(2);
  });

  it("matches by full name (case-insensitive)", () => {
    const results = filterUsers("alice", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.userId).toBe(1);
  });

  it("matches by partial full name", () => {
    const results = filterUsers("john", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.fullName).toBe("Alice Johnson");
  });

  it("matches by email (case-insensitive)", () => {
    const results = filterUsers("BOB@", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.userId).toBe(2);
  });

  it("matches by partial email prefix", () => {
    const results = filterUsers("charlie.b", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.userId).toBe(3);
  });

  it("returns multiple matches", () => {
    const results = filterUsers("example.com", USERS);
    expect(results).toHaveLength(5);
  });

  it("handles Cyrillic characters", () => {
    const results = filterUsers("Алексей", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.userId).toBe(5);
  });

  it("returns empty array for no matches", () => {
    expect(filterUsers("zzzzz", USERS)).toHaveLength(0);
  });

  it("returns empty array for empty users list", () => {
    expect(filterUsers("alice", [])).toHaveLength(0);
  });

  it("limits results to maxResults", () => {
    const results = filterUsers("example", USERS, 2);
    expect(results).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

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

// filterUsers edge cases — special characters, prioritization, boundaries
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
    expect(results.some((u) => u.fullName.toLowerCase().includes("b"))).toBe(true);
  });

  it("prioritizes name matches over email-only matches", () => {
    const users: MentionSuggestion[] = [
      { userId: 10, fullName: "No Match", email: "alice@test.com" },
      { userId: 11, fullName: "Alice Real", email: "other@test.com" },
    ];
    const results = filterUsers("alice", users);
    expect(results).toHaveLength(2);
    expect(results[0]!.userId).toBe(11);
    expect(results[1]!.userId).toBe(10);
  });

  it("user matching both name and email appears once (in name group)", () => {
    const users: MentionSuggestion[] = [
      { userId: 20, fullName: "alice alice", email: "alice@example.com" },
    ];
    const results = filterUsers("alice", users);
    expect(results).toHaveLength(1);
  });

  it("returns empty array when maxResults is 0", () => {
    expect(filterUsers("alice", USERS, 0)).toHaveLength(0);
  });

  it("trims leading and trailing whitespace from query", () => {
    const results = filterUsers("  alice  ", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.userId).toBe(1);
  });

  it("handles mixed case query matching", () => {
    const results = filterUsers("aLiCe", USERS);
    expect(results).toHaveLength(1);
  });
});

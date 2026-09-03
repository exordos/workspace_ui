/**
 * Tests for the Mention Suggestions feature — @mention autocomplete.
 *
 * Covers the rankMentionSuggestions pure function and the Zustand store
 * (query, visibility, results management, clear).
 */
import { afterEach, describe, expect, it } from "vitest";
import { MENTION_SUGGESTION_LIMIT, rankMentionSuggestions } from "./mention-suggest.lib";
import { useMentionSuggestStore } from "./mention-suggest.model";
import type { MentionRankingContext, MentionSuggestion } from "./mention-suggest.types";

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

describe("rankMentionSuggestions", () => {
  it("returns every user for an empty query, ordered by name", () => {
    const results = rankMentionSuggestions("", USERS);
    expect(results).toHaveLength(USERS.length);
    expect(results.map((user) => user.username).slice(0, 3)).toEqual(["alice", "bobby", "charlie"]);
  });

  it("returns all users for whitespace-only query", () => {
    const results = rankMentionSuggestions("   ", USERS);
    expect(results).toHaveLength(USERS.length);
  });

  it("limits empty-query results only when maxResults is explicit", () => {
    const results = rankMentionSuggestions("", USERS, { maxResults: 2 });
    expect(results).toHaveLength(2);
    expect(results.map((user) => user.username)).toEqual(["alice", "bobby"]);
  });

  it("keeps the dropdown short by default in the composer", () => {
    expect(MENTION_SUGGESTION_LIMIT).toBe(8);
    expect(
      rankMentionSuggestions("", USERS, { maxResults: MENTION_SUGGESTION_LIMIT }),
    ).toHaveLength(MENTION_SUGGESTION_LIMIT);
  });

  it("matches by Workspace UUID", () => {
    const results = rankMentionSuggestions("000000000003", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.username).toBe("charlie");
  });

  it("matches by username case-insensitively", () => {
    const results = rankMentionSuggestions("BOBBY", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.displayName).toBe("Bob Smith");
  });

  it("matches by display name case-insensitively", () => {
    const results = rankMentionSuggestions("alice", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.userUuid).toBe("4f2f1a30-c0a0-4d8b-a001-000000000001");
  });

  it("matches by partial display name", () => {
    const results = rankMentionSuggestions("john", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.displayName).toBe("Alice Johnson");
  });

  it("matches by email case-insensitively", () => {
    const results = rankMentionSuggestions("CHARLIE.B@", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.username).toBe("charlie");
  });

  it("returns multiple matches", () => {
    const results = rankMentionSuggestions("example.com", USERS);
    expect(results).toHaveLength(USERS.length);
  });

  it("handles Cyrillic characters", () => {
    const results = rankMentionSuggestions("Алексей", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.username).toBe("alexey");
  });

  it("returns empty array for no matches", () => {
    expect(rankMentionSuggestions("zzzzz", USERS)).toHaveLength(0);
  });

  it("returns empty array for empty users list", () => {
    expect(rankMentionSuggestions("alice", [])).toHaveLength(0);
  });

  it("limits matches only when maxResults is explicit", () => {
    const results = rankMentionSuggestions("example", USERS, { maxResults: 2 });
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

describe("rankMentionSuggestions (edge cases)", () => {
  it("handles special regex metacharacters in query safely", () => {
    expect(() => rankMentionSuggestions(".*+?^${}()|[]\\", USERS)).not.toThrow();
    expect(rankMentionSuggestions(".*+?^${}()|[]\\", USERS)).toHaveLength(0);
  });

  it("handles very long query (>100 chars)", () => {
    const longQuery = "a".repeat(200);
    expect(rankMentionSuggestions(longQuery, USERS)).toHaveLength(0);
  });

  it("single character query matches", () => {
    const results = rankMentionSuggestions("b", USERS);
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((user) => user.username.includes("b"))).toBe(true);
  });

  it("prioritizes name matches over email, and puts UUID matches last", () => {
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
    const results = rankMentionSuggestions("needle", users);
    expect(results.map((user) => user.userUuid)).toEqual([
      "aaaa-other",
      "bbbb-other",
      "cccc-other",
      "zzzz-needle",
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
    const results = rankMentionSuggestions("needle", users);
    expect(results).toHaveLength(1);
  });

  it("returns empty array when maxResults is 0", () => {
    expect(rankMentionSuggestions("alice", USERS, { maxResults: 0 })).toHaveLength(0);
  });

  it("trims leading and trailing whitespace from query", () => {
    const results = rankMentionSuggestions("  alice  ", USERS);
    expect(results).toHaveLength(1);
    expect(results[0]!.username).toBe("alice");
  });

  it("handles mixed case query matching", () => {
    const results = rankMentionSuggestions("aLiCe", USERS);
    expect(results).toHaveLength(1);
  });
});

const RANKING_USERS: MentionSuggestion[] = [
  {
    userUuid: "u-anna",
    displayName: "Anna Orlova",
    username: "anna",
    email: "anna@example.com",
    status: "offline",
  },
  {
    userUuid: "u-ivan",
    displayName: "Ivan Petrov",
    username: "ivan",
    email: "ivan@example.com",
    status: "offline",
  },
  {
    userUuid: "u-pyotr",
    displayName: "Пётр Ильин",
    username: "pyotr",
    email: "pyotr@example.com",
    status: "offline",
  },
  {
    userUuid: "u-joanna",
    displayName: "Joanna Banks",
    username: "joanna",
    email: "joanna@example.com",
    status: "offline",
  },
];

describe("rankMentionSuggestions (match quality)", () => {
  it("puts an exact username ahead of a longer prefix match", () => {
    const results = rankMentionSuggestions("anna", RANKING_USERS);
    expect(results[0]!.userUuid).toBe("u-anna");
  });

  it("puts a prefix match ahead of a substring match", () => {
    const results = rankMentionSuggestions("an", RANKING_USERS);
    expect(results[0]!.userUuid).toBe("u-anna");
    expect(results.map((user) => user.userUuid)).toContain("u-ivan");
  });

  it("matches the start of a later word in the display name", () => {
    const results = rankMentionSuggestions("pet", RANKING_USERS);
    expect(results.map((user) => user.userUuid)).toEqual(["u-ivan"]);
  });

  it("matches every token of a multi-word query against its own word", () => {
    const results = rankMentionSuggestions("iv pe", RANKING_USERS);
    expect(results.map((user) => user.userUuid)).toEqual(["u-ivan"]);
  });

  it("treats ё and е as the same letter", () => {
    const results = rankMentionSuggestions("петр", RANKING_USERS);
    expect(results.map((user) => user.userUuid)).toEqual(["u-pyotr"]);
  });

  it("ignores UUID fragments for short queries", () => {
    const results = rankMentionSuggestions("u-i", RANKING_USERS);
    expect(results).toHaveLength(0);
  });
});

describe("rankMentionSuggestions (conversation context)", () => {
  const query = "";

  it("offers whoever just wrote in this conversation first", () => {
    const context: MentionRankingContext = { recentAuthorUuids: ["u-joanna", "u-ivan"] };
    const results = rankMentionSuggestions(query, RANKING_USERS, { context });
    expect(results.map((user) => user.userUuid).slice(0, 2)).toEqual(["u-joanna", "u-ivan"]);
  });

  it("prefers channel members over the rest of the workspace", () => {
    const context: MentionRankingContext = {
      channelMemberUuids: new Set(["u-pyotr"]),
    };
    const results = rankMentionSuggestions(query, RANKING_USERS, { context });
    expect(results[0]!.userUuid).toBe("u-pyotr");
  });

  it("marks people outside the channel once membership is known", () => {
    const context: MentionRankingContext = { channelMemberUuids: new Set(["u-pyotr"]) };
    const results = rankMentionSuggestions(query, RANKING_USERS, { context });
    expect(results.find((user) => user.userUuid === "u-pyotr")!.outsideChannel).toBe(false);
    expect(results.find((user) => user.userUuid === "u-ivan")!.outsideChannel).toBe(true);
  });

  it("marks nobody while channel membership is still unknown", () => {
    const results = rankMentionSuggestions(query, RANKING_USERS, {
      context: { channelMemberUuids: null },
    });
    expect(results.every((user) => user.outsideChannel === undefined)).toBe(true);
  });

  it("prefers recent direct message partners", () => {
    const context: MentionRankingContext = { dmPartnerUuids: ["u-joanna"] };
    const results = rankMentionSuggestions(query, RANKING_USERS, { context });
    expect(results[0]!.userUuid).toBe("u-joanna");
  });

  it("prefers people the author mentions often", () => {
    const context: MentionRankingContext = { frecencyByUserUuid: { "u-pyotr": 8 } };
    const results = rankMentionSuggestions(query, RANKING_USERS, { context });
    expect(results[0]!.userUuid).toBe("u-pyotr");
  });

  it("ranks the author last without hiding them", () => {
    const results = rankMentionSuggestions(query, RANKING_USERS, {
      context: { selfUserUuid: "u-anna" },
    });
    expect(results).toHaveLength(RANKING_USERS.length);
    expect(results.at(-1)!.userUuid).toBe("u-anna");
  });

  it("keeps match quality above context", () => {
    const context: MentionRankingContext = { recentAuthorUuids: ["u-joanna"] };
    const results = rankMentionSuggestions("anna", RANKING_USERS, { context });
    expect(results.map((user) => user.userUuid)).toEqual(["u-anna", "u-joanna"]);
  });
});

/**
 * Tests for mention frecency — the decayed record of who this author picks from "@".
 */
import { beforeEach, describe, expect, it } from "vitest";
import { loadMentionFrecency, recordMentionPick } from "./mention-frecency.lib";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 3);

describe("mention frecency", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("has no scores before anything is picked", () => {
    expect(loadMentionFrecency(NOW)).toEqual({});
  });

  it("counts repeated picks of the same person", () => {
    recordMentionPick("user-a", NOW);
    recordMentionPick("user-a", NOW);

    expect(loadMentionFrecency(NOW)["user-a"]).toBeCloseTo(2, 5);
  });

  it("halves a score after one half-life", () => {
    recordMentionPick("user-a", NOW - 14 * DAY_MS);

    expect(loadMentionFrecency(NOW)["user-a"]).toBeCloseTo(0.5, 5);
  });

  it("ranks a person picked this week above one picked a year ago", () => {
    recordMentionPick("stale", NOW - 365 * DAY_MS);
    recordMentionPick("stale", NOW - 365 * DAY_MS);
    recordMentionPick("stale", NOW - 365 * DAY_MS);
    recordMentionPick("fresh", NOW - DAY_MS);

    const scores = loadMentionFrecency(NOW);
    expect(scores.fresh).toBeGreaterThan(scores.stale ?? 0);
  });

  it("forgets scores that decayed into noise", () => {
    recordMentionPick("ancient", NOW - 365 * DAY_MS);

    expect(loadMentionFrecency(NOW)).toEqual({});
  });

  it("survives a corrupted store", () => {
    window.localStorage.setItem("workspace-mention-frecency", "{oops");

    expect(loadMentionFrecency(NOW)).toEqual({});
    expect(() => recordMentionPick("user-a", NOW)).not.toThrow();
    expect(loadMentionFrecency(NOW)["user-a"]).toBeCloseTo(1, 5);
  });

  it("ignores an empty user id", () => {
    recordMentionPick("", NOW);

    expect(loadMentionFrecency(NOW)).toEqual({});
  });
});

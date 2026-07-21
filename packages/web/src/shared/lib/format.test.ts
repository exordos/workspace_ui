/**
 * Tests for the formatting and presence utilities.
 *
 * These functions convert timestamps to human-readable strings and
 * determine user online/idle/offline status for the sidebar and profile.
 * Incorrect presence logic would show wrong online indicators, and
 * incorrect time formatting would confuse users in chat.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { formatLastSeen, isPresenceOnline, getPresenceState, sidebarRowClass } from "./format";

// formatLastSeen converts a Unix timestamp to a relative "last seen" string (e.g. "5 min ago")
describe("formatLastSeen", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const now = () => Math.floor(Date.now() / 1000);

  // Active users within the threshold should show a meaningful status string
  it("returns non-empty string for active within threshold", () => {
    const result = formatLastSeen(now() - 30, "active");
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  // Each time bucket (<60s, <1h, <1d, >=1d) must produce a non-empty output
  it("returns non-empty string for <60s ago", () => {
    expect(formatLastSeen(now() - 30)).toBeTruthy();
  });

  it("returns non-empty string for <1h", () => {
    expect(formatLastSeen(now() - 600)).toBeTruthy();
  });

  it("returns non-empty string for <1d", () => {
    expect(formatLastSeen(now() - 7200)).toBeTruthy();
  });

  it("returns non-empty string for >=1d", () => {
    expect(formatLastSeen(now() - 172800)).toBeTruthy();
  });

  // Different time intervals must produce distinct strings so users can tell them apart
  it("returns different strings for different intervals", () => {
    const recent = formatLastSeen(now() - 30, "active");
    const minutes = formatLastSeen(now() - 600);
    const hours = formatLastSeen(now() - 7200);
    const days = formatLastSeen(now() - 172800);
    const all = new Set([recent, minutes, hours, days]);
    expect(all.size).toBeGreaterThanOrEqual(3);
  });
});

// isPresenceOnline drives the green dot indicator on avatars
describe("isPresenceOnline", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const now = () => Math.floor(Date.now() / 1000);

  // Recent active presence means the user is actively using the app
  it("returns true when active and recent", () => {
    expect(isPresenceOnline(now() - 60, "active")).toBe(true);
  });

  // Idle users should not show as "online" — they may have stepped away
  it("returns false when idle", () => {
    expect(isPresenceOnline(now() - 60, "idle")).toBe(false);
  });

  // Stale "active" status (>2min) means the server hasn't received fresh heartbeats
  it("returns false when active but too old", () => {
    expect(isPresenceOnline(now() - 300, "active")).toBe(false);
  });
});

// getPresenceState returns a three-state enum ("active" | "idle" | "offline")
// used by the sidebar to color-code user presence indicators
describe("getPresenceState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-13T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const now = () => Math.floor(Date.now() / 1000);

  it('returns "active" for recent active presence', () => {
    expect(getPresenceState(now() - 30, "active")).toBe("active");
  });

  it('returns "idle" for recent idle presence', () => {
    expect(getPresenceState(now() - 30, "idle")).toBe("idle");
  });

  // After 2 min without a fresh heartbeat, "active" degrades to "idle"
  it('returns "idle" for active user beyond 2min threshold but within 10min', () => {
    expect(getPresenceState(now() - 300, "active")).toBe("idle");
  });

  // After 10 min with no presence update, user is considered fully offline
  it('returns "offline" for stale presence beyond 10min', () => {
    expect(getPresenceState(now() - 700, "active")).toBe("offline");
  });

  // Missing status field (undefined) should fall through to offline when stale
  it('returns "offline" when no status and beyond idle threshold', () => {
    expect(getPresenceState(now() - 700)).toBe("offline");
  });

  // A recent timestamp with no status defaults to idle (conservative assumption)
  it('returns "idle" for recent timestamp without status', () => {
    expect(getPresenceState(now() - 30)).toBe("idle");
  });
});

// sidebarRowClass returns Tailwind classes for the active/hover state of sidebar items
describe("sidebarRowClass", () => {
  // Active (selected) row — Brand accent-soft from the design tokens
  it("returns accent-soft when active", () => {
    expect(sidebarRowClass(true)).toBe("bg-accent-soft");
  });

  // Inactive rows only show background on hover
  it("returns hover class when not active", () => {
    expect(sidebarRowClass(false)).toBe("hover:bg-sidebar-hover");
  });
});

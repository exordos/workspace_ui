/**
 * Tests for the Jitsi video call URL utilities.
 *
 * These functions detect, parse, and build Jitsi meeting URLs. They are used
 * to auto-detect meeting links in chat messages, open the in-app call modal,
 * and generate shareable meeting URLs. Incorrect URL parsing would fail to
 * detect meetings or open calls on the wrong domain.
 */

import { describe, expect, it, vi } from "vitest";
import { getJitsiMeetingUrl, parseJitsiUrl, buildJitsiMeetingUrl } from "./jitsi";

vi.mock("../config/constants", () => ({
  JITSI_MEET_DOMAIN: "meet.example.com",
  JITSI_MEET_BASE_URL: "https://meet.example.com",
}));

// getJitsiMeetingUrl scans message text to find and extract Jitsi meeting links
describe("getJitsiMeetingUrl", () => {
  // Exact match — the simplest case when message is just the URL
  it("returns URL when text is exactly a meeting URL", () => {
    expect(getJitsiMeetingUrl("https://meet.example.com/room123")).toBe(
      "https://meet.example.com/room123",
    );
  });

  // Base URL without room segment is not a valid meeting — don't trigger call UI
  it("returns null for base URL without room", () => {
    expect(getJitsiMeetingUrl("https://meet.example.com")).toBeNull();
  });

  // URLs embedded in natural language text must be extracted correctly
  it("extracts meeting URL from longer text", () => {
    const text = "Join meeting: https://meet.example.com/standup today";
    expect(getJitsiMeetingUrl(text)).toBe("https://meet.example.com/standup");
  });

  // meet.jit.si is the public Jitsi instance — must also be recognized
  it("extracts meet.jit.si URLs", () => {
    const text = "Join at https://meet.jit.si/MyRoom please";
    expect(getJitsiMeetingUrl(text)).toBe("https://meet.jit.si/MyRoom");
  });

  // Text without any Jitsi URL should return null — no false positives
  it("returns null when no Jitsi URL is present", () => {
    expect(getJitsiMeetingUrl("No meeting links here")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(getJitsiMeetingUrl("")).toBeNull();
  });

  // URLs with extra path segments should be preserved (e.g. room/extra)
  it("handles URL with path segments", () => {
    expect(getJitsiMeetingUrl("https://meet.example.com/room/extra")).toBe(
      "https://meet.example.com/room/extra",
    );
  });

  // HTTP scheme (non-HTTPS) should also be detected — some internal deployments use it
  it("handles http scheme", () => {
    const text = "Link: http://meet.example.com/test-room end";
    expect(getJitsiMeetingUrl(text)).toBe("http://meet.example.com/test-room");
  });

  // Whitespace around the URL should be trimmed
  it("handles whitespace around URL", () => {
    expect(getJitsiMeetingUrl("  https://meet.example.com/room  ")).toBe(
      "https://meet.example.com/room",
    );
  });

  // URL extraction must stop at whitespace boundaries
  it("stops extraction at whitespace in embedded URL", () => {
    const text = "Join https://meet.jit.si/room1 now!";
    expect(getJitsiMeetingUrl(text)).toBe("https://meet.jit.si/room1");
  });

  it("returns full trimmed text when it starts with base URL", () => {
    const text = "https://meet.example.com/room1 other text";
    expect(getJitsiMeetingUrl(text)).toBe(text);
  });

  // Non-Jitsi domains must be ignored — prevents opening random URLs as calls
  it("ignores unrelated domains", () => {
    expect(getJitsiMeetingUrl("https://other.example.com/room")).toBeNull();
  });

  // Domain matching should be case-insensitive per URL spec
  it("is case-insensitive for domain matching", () => {
    const text = "Go to HTTPS://MEET.JIT.SI/Room";
    expect(getJitsiMeetingUrl(text)).toBe("HTTPS://MEET.JIT.SI/Room");
  });
});

// parseJitsiUrl breaks a meeting URL into domain + roomName for the Jitsi SDK
describe("parseJitsiUrl", () => {
  // Configured domain URL should extract domain and room name
  it("parses configured domain URL", () => {
    expect(parseJitsiUrl("https://meet.example.com/my-room")).toEqual({
      domain: "meet.example.com",
      roomName: "my-room",
    });
  });

  // Public Jitsi instance URLs must also parse correctly
  it("parses meet.jit.si URL", () => {
    expect(parseJitsiUrl("https://meet.jit.si/DailyStandup")).toEqual({
      domain: "meet.jit.si",
      roomName: "DailyStandup",
    });
  });

  // Unknown domains (e.g. Zoom, Google Meet) must return null
  it("returns null for unknown domain", () => {
    expect(parseJitsiUrl("https://zoom.us/meeting/123")).toBeNull();
  });

  // Malformed input must not crash the parser
  it("returns null for invalid URL", () => {
    expect(parseJitsiUrl("not-a-url")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(parseJitsiUrl("")).toBeNull();
  });

  // URL without room path is not a valid meeting
  it("returns null when path is empty", () => {
    expect(parseJitsiUrl("https://meet.example.com/")).toBeNull();
    expect(parseJitsiUrl("https://meet.example.com")).toBeNull();
  });

  // Percent-encoded room names (from copy-paste) must be decoded
  it("decodes URI-encoded room names", () => {
    expect(parseJitsiUrl("https://meet.example.com/room%20name")).toEqual({
      domain: "meet.example.com",
      roomName: "room name",
    });
  });

  // Only the first path segment is the room name — sub-paths are ignored
  it("extracts only first path segment as room name", () => {
    const result = parseJitsiUrl("https://meet.example.com/room/sub/path");
    expect(result?.roomName).toBe("room");
  });

  // Hostname comparison must be case-insensitive per RFC 3986
  it("handles case-insensitive hostname", () => {
    expect(parseJitsiUrl("https://MEET.EXAMPLE.COM/room")).toEqual({
      domain: "meet.example.com",
      roomName: "room",
    });
  });

  it("handles http scheme", () => {
    expect(parseJitsiUrl("http://meet.example.com/test")).toEqual({
      domain: "meet.example.com",
      roomName: "test",
    });
  });

  // Non-web schemes must be rejected even on allowed hosts
  it("returns null for javascript scheme", () => {
    const jsScheme = ["java", "script"].join("");
    expect(parseJitsiUrl(`${jsScheme}://meet.example.com/room`)).toBeNull();
  });

  it("returns null for ftp scheme", () => {
    expect(parseJitsiUrl("ftp://meet.example.com/room")).toBeNull();
  });
});

// buildJitsiMeetingUrl creates a meeting URL from a room name — used by "Start Call" button
describe("buildJitsiMeetingUrl", () => {
  // Simple room names produce clean URLs
  it("builds URL from simple room name", () => {
    expect(buildJitsiMeetingUrl("daily-standup")).toBe("https://meet.example.com/daily-standup");
  });

  // Special characters must be encoded to produce valid URLs
  it("encodes special characters in room name", () => {
    expect(buildJitsiMeetingUrl("room with spaces")).toBe(
      "https://meet.example.com/room%20with%20spaces",
    );
  });

  // Slashes in room names must be encoded to avoid creating extra path segments
  it("encodes slashes in room name", () => {
    expect(buildJitsiMeetingUrl("team/meeting")).toBe("https://meet.example.com/team%2Fmeeting");
  });

  // Empty room name edge case — produces base URL with trailing slash
  it("handles empty room name", () => {
    expect(buildJitsiMeetingUrl("")).toBe("https://meet.example.com/");
  });

  // Unicode room names (e.g. Cyrillic, accented chars) must be properly encoded
  it("encodes unicode characters", () => {
    const roomName = "café";
    const url = buildJitsiMeetingUrl(roomName);
    expect(url).toBe(`https://meet.example.com/${encodeURIComponent(roomName)}`);
  });
});

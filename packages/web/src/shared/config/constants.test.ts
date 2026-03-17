/**
 * Tests for the shared constants module.
 *
 * Constants are used across the app for consistent configuration
 * (scrollbar styling, Jitsi domain, API origins). These tests verify
 * that all exported values have the expected types and formats,
 * catching misconfiguration from env vars before it causes runtime errors.
 */

import { describe, expect, it } from "vitest";
import {
  SCROLL_AREA_CLASS,
  JITSI_MEET_DOMAIN,
  JITSI_MEET_BASE_URL,
  WORKSPACE_ORIGIN,
  WORKSPACE_UPLOADS_ORIGIN,
} from "./constants";

describe("constants", () => {
  // SCROLL_AREA_CLASS provides consistent thin-scrollbar styling across all scrollable areas
  it("SCROLL_AREA_CLASS is a non-empty string", () => {
    expect(typeof SCROLL_AREA_CLASS).toBe("string");
    expect(SCROLL_AREA_CLASS.length).toBeGreaterThan(0);
  });

  // Must include Tailwind scrollbar utility classes for the custom scrollbar look
  it("SCROLL_AREA_CLASS contains scrollbar utility classes", () => {
    expect(SCROLL_AREA_CLASS).toContain("scrollbar");
    expect(SCROLL_AREA_CLASS).toContain("scrollbar-thin");
  });

  // Jitsi domain is used to match/extract meeting URLs from message content
  it("JITSI_MEET_DOMAIN is a string", () => {
    expect(typeof JITSI_MEET_DOMAIN).toBe("string");
  });

  // Base URL is constructed from domain — used by buildJitsiMeetingUrl
  it("JITSI_MEET_BASE_URL is a string", () => {
    expect(typeof JITSI_MEET_BASE_URL).toBe("string");
  });

  // When a Jitsi domain is configured, the base URL must be a valid HTTPS URL
  it("JITSI_MEET_BASE_URL starts with https when domain is set", () => {
    if (JITSI_MEET_DOMAIN) {
      expect(JITSI_MEET_BASE_URL).toMatch(/^https:\/\//);
      expect(JITSI_MEET_BASE_URL).toContain(JITSI_MEET_DOMAIN);
    }
  });

  // API origin is used as the base for all Zulip/Workspace API requests
  it("WORKSPACE_ORIGIN is a string", () => {
    expect(typeof WORKSPACE_ORIGIN).toBe("string");
  });

  // Uploads origin is used to construct user_uploads URLs for file/image display
  it("WORKSPACE_UPLOADS_ORIGIN is a string", () => {
    expect(typeof WORKSPACE_UPLOADS_ORIGIN).toBe("string");
  });

  // All constants must be defined — undefined would cause runtime errors in consumers
  it("all exports are defined (not undefined)", () => {
    expect(SCROLL_AREA_CLASS).toBeDefined();
    expect(JITSI_MEET_DOMAIN).toBeDefined();
    expect(JITSI_MEET_BASE_URL).toBeDefined();
    expect(WORKSPACE_ORIGIN).toBeDefined();
    expect(WORKSPACE_UPLOADS_ORIGIN).toBeDefined();
  });
});

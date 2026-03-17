/**
 * Tests for the input validation and sanitization module.
 *
 * These tests ensure that user-provided URLs, emails, files, and filenames
 * are properly validated before being used in navigation, API calls, or storage.
 * Invalid input could lead to XSS attacks, path traversal, or server-side exploits.
 */

import { describe, expect, it } from "vitest";
import {
  isValidUrl,
  isValidRealmUrl,
  isValidEmail,
  detectImageMime,
  validateFileUpload,
  sanitizeFilename,
} from "./validation";

// URL validation — the first line of defense against malicious navigation and XSS
describe("isValidUrl", () => {
  // Standard web protocols are the only safe ones for user-facing links
  it("accepts https", () => expect(isValidUrl("https://example.com")).toBe(true));
  it("accepts http", () => expect(isValidUrl("http://example.com")).toBe(true));
  // javascript: protocol is the most common XSS injection vector via URLs
  // eslint-disable-next-line no-script-url
  it("rejects javascript:", () => expect(isValidUrl("javascript:alert(1)")).toBe(false));
  // data: URIs can embed arbitrary HTML/JS and bypass same-origin policy
  it("rejects data:", () => expect(isValidUrl("data:text/html,<h1>XSS</h1>")).toBe(false));
  // ftp: is not needed in the app and could expose internal resources
  it("rejects ftp:", () => expect(isValidUrl("ftp://files.example.com")).toBe(false));
  // Empty and malformed input should never slip through to window.open or fetch
  it("rejects empty", () => expect(isValidUrl("")).toBe(false));
  it("rejects garbage", () => expect(isValidUrl("not a url")).toBe(false));
  // file: protocol could read local filesystem in Electron
  it("rejects file:", () => expect(isValidUrl("file:///etc/passwd")).toBe(false));
});

// Realm URL validation — used when connecting to a Zulip server instance
describe("isValidRealmUrl", () => {
  // Realm must be HTTPS to protect credentials in transit
  it("accepts valid realm", () => expect(isValidRealmUrl("https://zulip.example.com")).toBe(true));
  // HTTP realm would send API key over plaintext — must be rejected
  it("rejects http", () => expect(isValidRealmUrl("http://zulip.example.com")).toBe(false));
  // A URL without hostname can't point to a real server
  it("rejects no hostname", () => expect(isValidRealmUrl("https://")).toBe(false));
  // Trailing-dot hostnames are often incomplete input and produce broken API URLs.
  it("rejects hostname ending with dot", () =>
    expect(isValidRealmUrl("https://chat.example.com.")).toBe(false));
  // Empty labels (double dots) indicate malformed hostnames.
  it("rejects hostname with empty labels", () =>
    expect(isValidRealmUrl("https://chat..example.com")).toBe(false));
});

// Email validation — used in login form and user profile fields
describe("isValidEmail", () => {
  it("accepts valid email", () => expect(isValidEmail("user@example.com")).toBe(true));
  // Missing @ means it's not an email — prevents sending to wrong API endpoint
  it("rejects no @", () => expect(isValidEmail("user.example.com")).toBe(false));
  it("rejects empty", () => expect(isValidEmail("")).toBe(false));
  // Users often paste emails with whitespace — trimming avoids unnecessary errors
  it("trims whitespace", () => expect(isValidEmail(" user@example.com ")).toBe(true));
});

// MIME detection by magic bytes — prevents trusting file extensions which can be spoofed
describe("detectImageMime", () => {
  // PNG magic bytes: 0x89 0x50 0x4E 0x47 — ensures we identify the real format
  it("detects PNG", () => {
    const buf = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;
    expect(detectImageMime(buf)).toBe("image/png");
  });

  // JPEG magic bytes: 0xFF 0xD8 0xFF
  it("detects JPEG", () => {
    const buf = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;
    expect(detectImageMime(buf)).toBe("image/jpeg");
  });

  // Unknown file content should return null so caller can decide how to handle
  it("returns null for unknown", () => {
    const buf = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0]).buffer;
    expect(detectImageMime(buf)).toBeNull();
  });
});

// File upload validation — prevents empty or oversized files from reaching the server
describe("validateFileUpload", () => {
  it("accepts normal file", () => {
    const file = new File(["content"], "test.txt", { type: "text/plain" });
    expect(validateFileUpload(file).valid).toBe(true);
  });

  // Empty files waste bandwidth and confuse file viewers
  it("rejects empty file", () => {
    const file = new File([], "empty.txt");
    expect(validateFileUpload(file).valid).toBe(false);
  });
});

// Filename sanitization — removes chars that could exploit OS or server file systems
describe("sanitizeFilename", () => {
  // Characters like < > : " / \ | ? * are forbidden on Windows and can break server paths
  it("removes dangerous characters", () => {
    expect(sanitizeFilename('file<>:"/\\|?*.txt')).toBe("file_________.txt");
  });

  // Multiple consecutive dots could be used for extension spoofing (e.g. file...exe)
  it("collapses multiple dots", () => {
    expect(sanitizeFilename("file...txt")).toBe("file.txt");
  });

  it("trims whitespace", () => {
    expect(sanitizeFilename("  file.txt  ")).toBe("file.txt");
  });

  // Path traversal (../../) is the classic attack to write outside the upload directory
  it("handles path traversal", () => {
    const result = sanitizeFilename("../../etc/passwd");
    expect(result).not.toContain("..");
    expect(result).not.toContain("/");
    expect(result).not.toContain("\\");
  });
});

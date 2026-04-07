/**
 * Tests for the iframe embedding module and EmbedFrame component.
 *
 * This module controls which URLs can be embedded in iframes, applies
 * sandboxing policies (strict/interactive/full), and provides a React
 * component with origin validation, loading states, and security attributes.
 * Broken origin checks could allow embedding of malicious content (XSS/phishing).
 */

import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import {
  isEmbedAllowed,
  getAllowedOrigins,
  getSandboxPolicy,
  getFrameSrcDirective,
  EmbedFrame,
} from "./embed.js";

// isEmbedAllowed is the security gate — only trusted origins can be embedded
describe("isEmbedAllowed", () => {
  // The app's own API origin should always be embeddable
  it("allows workspace API origin", () => {
    const origins = getAllowedOrigins();
    if (origins.length > 0) {
      expect(isEmbedAllowed(`${origins[0]}/page`)).toBe(true);
    }
  });

  // Unknown origins must be blocked to prevent embedding malicious content
  it("rejects unknown origin", () => {
    expect(isEmbedAllowed("https://evil.example.com/phishing")).toBe(false);
  });

  // javascript: in iframe src would execute code in the parent context
  it("rejects javascript: protocol", () => {
    // eslint-disable-next-line no-script-url
    expect(isEmbedAllowed("javascript:alert(1)")).toBe(false);
  });

  // data: URIs can embed arbitrary HTML/JS content
  it("rejects data: protocol", () => {
    expect(isEmbedAllowed("data:text/html,<h1>XSS</h1>")).toBe(false);
  });

  // Empty string is invalid — must not pass through to iframe src
  it("rejects empty string", () => {
    expect(isEmbedAllowed("")).toBe(false);
  });

  // Malformed input must be rejected, not cause URL parsing errors
  it("rejects malformed URL", () => {
    expect(isEmbedAllowed("not-a-url")).toBe(false);
  });
});

// getAllowedOrigins returns the whitelist of embeddable origins
describe("getAllowedOrigins", () => {
  it("returns an array", () => {
    expect(Array.isArray(getAllowedOrigins())).toBe(true);
  });

  // When configured, the workspace/zulip origin must be in the list
  it("includes workspace origin if set", () => {
    const origins = getAllowedOrigins();
    if (origins.length === 0) {
      expect(origins).toEqual([]);
      return;
    }

    // In browser runtime we always include the app origin (window.location.origin).
    expect(origins).toContain(window.location.origin);
  });
});

// getSandboxPolicy returns an iframe sandbox attribute string with progressive permissions
describe("getSandboxPolicy", () => {
  // Strict: minimal permissions — just scripts and same-origin for basic embeds
  it("strict has allow-scripts and allow-same-origin", () => {
    const policy = getSandboxPolicy("strict");
    expect(policy).toContain("allow-scripts");
    expect(policy).toContain("allow-same-origin");
    expect(policy).not.toContain("allow-forms");
  });

  // Interactive: adds forms and popups for embedded apps that need user input
  it("interactive adds forms and popups", () => {
    const policy = getSandboxPolicy("interactive");
    expect(policy).toContain("allow-forms");
    expect(policy).toContain("allow-popups");
  });

  // Full: maximum permissions for trusted embeds (e.g. Jitsi, file viewer)
  it("full adds downloads and popup-escape", () => {
    const policy = getSandboxPolicy("full");
    expect(policy).toContain("allow-downloads");
    expect(policy).toContain("allow-popups-to-escape-sandbox");
  });
});

// getFrameSrcDirective generates the CSP frame-src value for HTTP headers
describe("getFrameSrcDirective", () => {
  // Must return a non-empty string for the Content-Security-Policy header
  it("returns string", () => {
    const directive = getFrameSrcDirective();
    expect(typeof directive).toBe("string");
    expect(directive.length).toBeGreaterThan(0);
  });
});

// Detailed sandbox level verification — ensures each level adds only intended permissions
describe("getSandboxPolicy levels", () => {
  // Strict must NOT include interactive or full permissions
  it("strict does not include forms, popups, or downloads", () => {
    const p = getSandboxPolicy("strict");
    expect(p).not.toContain("allow-forms");
    expect(p).not.toContain("allow-popups");
    expect(p).not.toContain("allow-downloads");
  });

  // Interactive adds forms + popups but not file downloads
  it("interactive includes forms + popups but not downloads", () => {
    const p = getSandboxPolicy("interactive");
    expect(p).toContain("allow-forms");
    expect(p).toContain("allow-popups");
    expect(p).not.toContain("allow-downloads");
  });

  // Full is the most permissive — used for trusted embedded applications
  it("full includes everything", () => {
    const p = getSandboxPolicy("full");
    expect(p).toContain("allow-scripts");
    expect(p).toContain("allow-same-origin");
    expect(p).toContain("allow-forms");
    expect(p).toContain("allow-popups");
    expect(p).toContain("allow-popups-to-escape-sandbox");
    expect(p).toContain("allow-downloads");
  });
});

// Additional edge cases for isEmbedAllowed — covers less common attack vectors
describe("isEmbedAllowed additional", () => {
  // file: protocol could read local files in Electron
  it("rejects file: protocol", () => {
    expect(isEmbedAllowed("file:///etc/passwd")).toBe(false);
  });

  // ftp: is a legacy protocol with no legitimate embed use case
  it("rejects ftp: protocol", () => {
    expect(isEmbedAllowed("ftp://files.example.com/file.txt")).toBe(false);
  });

  // blob: URLs can reference in-memory content — bypass origin checks
  it("rejects blob: protocol", () => {
    expect(isEmbedAllowed("blob:https://evil.com/uuid")).toBe(false);
  });

  // Port numbers change the origin — must be rejected even for allowed hosts
  it("handles URL with port in allowed origins", () => {
    const origins = getAllowedOrigins();
    if (origins.length > 0) {
      expect(isEmbedAllowed(`${origins[0]}:8080/page`)).toBe(false);
    }
  });
});

// EmbedFrame React component — wraps iframe with security validation and loading state
describe("EmbedFrame", () => {
  // Blocked URLs should render the fallback UI (e.g. "Content not available")
  it("renders fallback when URL is not in allowlist", () => {
    render(
      <EmbedFrame
        url="https://evil.example.com/page"
        title="Blocked"
        fallback={<div data-testid="fallback">Blocked</div>}
      />,
    );
    expect(screen.getByTestId("fallback")).toBeInTheDocument();
  });

  // Without a fallback, blocked URLs should render nothing (empty container)
  it("renders null when URL is blocked and no fallback given", () => {
    const { container } = render(
      <EmbedFrame url="https://evil.example.com/page" title="Blocked" />,
    );
    expect(container.innerHTML).toBe("");
  });

  // Allowed origins should render a properly configured iframe
  it("renders iframe for allowed origin", () => {
    const origins = getAllowedOrigins();
    if (origins.length === 0) return;

    const url = `${origins[0]}/embed-page`;
    const { container } = render(<EmbedFrame url={url} title="Allowed Frame" />);
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute("src")).toBe(url);
    expect(iframe?.getAttribute("title")).toBe("Allowed Frame");
    expect(iframe?.getAttribute("sandbox")).toBe(getSandboxPolicy("strict"));
  });

  // A loading spinner should be visible while the iframe content loads
  it("shows loading spinner before load event", () => {
    const origins = getAllowedOrigins();
    if (origins.length === 0) return;

    const { container } = render(<EmbedFrame url={`${origins[0]}/page`} title="Loading" />);
    expect(container.querySelector(".animate-spin")).not.toBeNull();
  });

  // onLoad callback fires when iframe loads, and the spinner is removed
  it("calls onLoad callback and removes spinner", () => {
    const origins = getAllowedOrigins();
    if (origins.length === 0) return;

    const onLoad = vi.fn();
    const { container } = render(
      <EmbedFrame url={`${origins[0]}/page`} title="Cb" onLoad={onLoad} />,
    );

    const iframe = container.querySelector("iframe")!;
    fireEvent.load(iframe);

    expect(onLoad).toHaveBeenCalledOnce();
    expect(container.querySelector(".animate-spin")).toBeNull();
  });

  // Security attributes must be set to prevent data leaks and control permissions
  it("iframe has security attributes set correctly", () => {
    const origins = getAllowedOrigins();
    if (origins.length === 0) return;

    const { container } = render(<EmbedFrame url={`${origins[0]}/page`} title="Secure" />);
    const iframe = container.querySelector("iframe")!;
    expect(iframe.getAttribute("referrerPolicy")).toBe("strict-origin-when-cross-origin");
    expect(iframe.getAttribute("allow")).toBe("camera; microphone; fullscreen; display-capture");
  });

  // Sandbox level can be overridden per embed (e.g. "full" for Jitsi)
  it("uses specified sandbox level", () => {
    const origins = getAllowedOrigins();
    if (origins.length === 0) return;

    const { container } = render(
      <EmbedFrame url={`${origins[0]}/page`} title="Full" sandbox="full" />,
    );
    const iframe = container.querySelector("iframe");
    expect(iframe?.getAttribute("sandbox")).toBe(getSandboxPolicy("full"));
  });

  // Custom className is forwarded to the container for layout control
  it("applies custom className", () => {
    const origins = getAllowedOrigins();
    if (origins.length === 0) return;

    const { container } = render(
      <EmbedFrame url={`${origins[0]}/page`} title="Cls" className="my-class" />,
    );
    expect(container.firstElementChild?.classList.contains("my-class")).toBe(true);
  });
});

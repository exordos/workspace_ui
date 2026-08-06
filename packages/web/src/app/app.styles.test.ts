import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const focusOutlineStyles = readFileSync(
  resolve(import.meta.dirname, "focus-outline.styles.css"),
  "utf8",
);
const appStyles = readFileSync(resolve(import.meta.dirname, "app.styles.css"), "utf8");
const workspaceMessageBodySource = readFileSync(
  resolve(import.meta.dirname, "../entities/messenger/messenger-workspace-message-body.ui.tsx"),
  "utf8",
);
const fileDownloadErrorIcon = readFileSync(
  resolve(import.meta.dirname, "../shared/assets/media/file-download-error.svg"),
  "utf8",
);
const videoOffIcon = readFileSync(
  resolve(import.meta.dirname, "../shared/assets/media/video-off.svg"),
  "utf8",
);

describe("icon-only button preset contract", () => {
  it("opts out labeled CTAs via data-icon-hover and gap utilities", () => {
    // Text nodes do not break :has(> *:not(svg)); without these guards, svg+label
    // buttons get text-icon-base (gray) until hover flips to text-icon-active.
    expect(appStyles).toContain('[data-icon-hover="custom"]');
    expect(appStyles).toContain(':not([class*="gap-"])');
    expect(appStyles).toContain("text-icon-base");
  });
});

describe("focus-outline styles contract", () => {
  it("separates focus outline styling for controls and text-entry inputs", () => {
    expect(focusOutlineStyles).toContain("button:focus-visible");
    expect(focusOutlineStyles).toContain(
      'input:not([type="checkbox"]):not([type="radio"]):focus-visible',
    );
    expect(focusOutlineStyles).toContain("@apply outline-2 outline-offset-2 outline-accent-soft");
    expect(focusOutlineStyles).toContain("@apply outline-1 outline-offset-0 outline-accent-soft");
  });
});

describe("protected video placeholder styles contract", () => {
  it("keeps BEM selectors literal so Tailwind cannot turn underscores into spaces", () => {
    expect(appStyles).toMatch(
      /\.workspace-message-file-placeholder__video-visual\s*\{[^}]*display:\s*flex;/s,
    );
    expect(appStyles).toMatch(
      /\.workspace-message-file-placeholder__video-icon\s*\{[^}]*display:\s*flex;[^}]*width:\s*3rem;[^}]*height:\s*3rem;/s,
    );
    expect(appStyles).toContain(
      '.workspace-message-file-placeholder[data-workspace-preview-status="loading"]',
    );
    expect(appStyles).not.toContain("background-color: rgb(69 10 10)");
    expect(appStyles).not.toContain("rgb(15 23 42)");
    expect(appStyles).not.toContain("rgb(30 41 59)");
    expect(appStyles).not.toContain("rgb(255 255 255 / 0.9)");
    expect(appStyles).not.toContain("rgb(254 202 202)");
    expect(appStyles).toMatch(
      /\.workspace-message-file-placeholder__video-visual\s*\{[^}]*background-color:\s*var\(--color-msg-bg\);/s,
    );
    expect(appStyles).toMatch(
      /\[data-workspace-message-bubble="true"\]\[data-message-owner="own"\][^{]*\{[^}]*background-color:\s*var\(--color-msg-own-bg\);/s,
    );
    expect(appStyles).toMatch(
      /\.workspace-message-file-placeholder__video-icon\s*\{[^}]*color:\s*var\(--color-icon-base\);[^}]*background-color:\s*var\(--color-bg-elevated\);/s,
    );
    expect(appStyles).toMatch(
      /\[data-workspace-preview-status="load-error"\][^{]*\{[^}]*color:\s*var\(--color-icon-base\);/s,
    );
    expect(appStyles).toMatch(
      /\[data-workspace-preview-status="display-error"\][^{]*\{[^}]*color:\s*var\(--color-icon-base\);/s,
    );
    expect(appStyles).not.toMatch(
      /\[data-workspace-preview-status="(?:load|display)-error"\][^{]*\{[^}]*color:\s*var\(--color-call-red\);/s,
    );
    expect(fileDownloadErrorIcon).toContain('stroke-width="1.4"');
    expect(videoOffIcon).toContain('stroke-width="1.4"');
    expect(workspaceMessageBodySource).not.toContain(
      "[&_.workspace-message-file-placeholder__video-",
    );
  });

  it("stops both protected-video spinners when reduced motion is requested", () => {
    expect(appStyles).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*\.workspace-message-file-placeholder\[data-workspace-preview-status="loading"\][\s\S]*\.media-viewer-resource-placeholder\[data-media-viewer-resource-state="loading"\][\s\S]*animation:\s*none;/,
    );
  });
});

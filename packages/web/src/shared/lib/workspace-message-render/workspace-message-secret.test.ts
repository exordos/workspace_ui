import { describe, expect, it } from "vitest";
import { t } from "~/i18n/i18n";
import {
  buildWorkspaceForwardUrn,
  buildWorkspaceSecretUrn,
  parseWorkspaceSecretUrn,
} from "../workspace-reference-urn.lib";
import { parseWorkspaceMessageBody } from "./workspace-message-parse.lib";
import {
  collectWorkspaceMessageSecretReferences,
  containsWorkspaceMessageSecretReference,
  hasWorkspaceMessageSecretContent,
  renderWorkspaceMessageBody,
} from "./workspace-message-render.lib";
import { summarizeWorkspaceMessageMarkdown } from "./workspace-message-summary.lib";

const STREAM = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const bytes = Uint8Array.from({ length: 64 }, (_, index) => index);
const urn = buildWorkspaceSecretUrn(STREAM, KEY, { bytes })!;

describe("encrypted fragment URNs", () => {
  it("preserves original stream, exact historical key and encrypted bytes", () => {
    expect(parseWorkspaceSecretUrn(urn)).toEqual({
      kind: "secret",
      streamUuid: STREAM,
      keyUuid: KEY,
      envelope: { bytes },
    });
    expect(urn).toMatch(/^urn:secret:v1:[0-9a-f-]+:[0-9a-f-]+:[A-Za-z0-9_-]+$/);
    expect(parseWorkspaceSecretUrn(urn.replace(KEY, "invalid"))).toBeNull();
  });
  it.each([
    "urn:secret:v2:x:y:AAA",
    urn + "=",
    urn + ":extra",
    urn.replace(/:[^:]+$/, ":AB"),
    urn.replace(/:[^:]+$/, ":"),
    urn + "?plain=secret",
  ])("rejects malformed/unsupported format %s", (value) => {
    expect(parseWorkspaceSecretUrn(value)).toBeNull();
  });
  it("rejects empty or oversized envelopes symmetrically", () => {
    expect(buildWorkspaceSecretUrn(STREAM, KEY, { bytes: new Uint8Array() })).toBeNull();
    expect(buildWorkspaceSecretUrn(STREAM, KEY, { bytes: new Uint8Array(30001) })).toBeNull();
    const largest = buildWorkspaceSecretUrn(STREAM, KEY, { bytes: new Uint8Array(30000) });
    expect(parseWorkspaceSecretUrn(largest)?.envelope.bytes.length).toBe(30000);
  });
  it("renders inline closed hosts while preserving surrounding public Markdown", () => {
    const document = parseWorkspaceMessageBody(
      `**Public before** [DO NOT DISPLAY](<${urn}>) after`,
    );
    const { html } = renderWorkspaceMessageBody(document);
    expect(html).toContain("<strong>Public before</strong>");
    expect(html).toContain("after");
    expect(html).toContain("data-workspace-secret-urn=");
    expect(html).not.toContain("DO NOT DISPLAY");
    expect(html).not.toContain('href="urn:secret');
    expect(collectWorkspaceMessageSecretReferences(document)).toHaveLength(1);
    expect(document.safeTextPreview).toContain(t("e2ee.secretFragment"));
    expect(document.safeTextPreview).not.toContain("DO NOT DISPLAY");
  });
  it("summarizes valid, invalid and unknown versions using a neutral label", () => {
    for (const value of [urn, "urn:secret:v99:whatever", "urn:secret:invalid"]) {
      const markdown = `Before [untrusted disclosed label](${value}) after`;
      const summary = summarizeWorkspaceMessageMarkdown(markdown);
      expect(summary.text).toBe(`Before ${t("e2ee.secretFragment")} after`);
      const { html } = renderWorkspaceMessageBody(parseWorkspaceMessageBody(markdown));
      expect(html).not.toContain("untrusted disclosed label");
      expect(summary.text).not.toContain("urn:");
    }
  });
  it("never interprets literal code as encrypted fragments", () => {
    const doc = parseWorkspaceMessageBody(
      "`[literal](" + urn + ")`\n\n```\n[also literal](" + urn + ")\n```",
    );
    expect(collectWorkspaceMessageSecretReferences(doc)).toEqual([]);
    expect(renderWorkspaceMessageBody(doc).html).not.toContain("data-workspace-secret-urn=");
  });
});

it("bounds nested encrypted forwards and verifies original secret membership without plaintext", () => {
  const reference = parseWorkspaceSecretUrn(urn)!;
  const source = `Public [secret](${urn})`;
  const forward = `[Forwarded](${buildWorkspaceForwardUrn(KEY, source)})`;
  const nested = parseWorkspaceMessageBody(
    `[Forwarded again](${buildWorkspaceForwardUrn(KEY, forward)})`,
  );
  expect(hasWorkspaceMessageSecretContent(nested)).toBe(true);
  expect(containsWorkspaceMessageSecretReference(nested, reference)).toBe(true);
  expect(containsWorkspaceMessageSecretReference(nested, { ...reference, keyUuid: STREAM })).toBe(
    false,
  );
  expect(
    containsWorkspaceMessageSecretReference(
      parseWorkspaceMessageBody("`[code](" + urn + ")`"),
      reference,
    ),
  ).toBe(false);
  expect(containsWorkspaceMessageSecretReference(nested, reference, 13)).toBe(false);
});

it.each([`## Header [secret label](${urn})`, `| Column |\n| --- |\n| [secret label](${urn}) |`])(
  "keeps secret labels and ciphertext out of GFM previews",
  (markdown) => {
    const summary = summarizeWorkspaceMessageMarkdown(markdown);
    const document = parseWorkspaceMessageBody(markdown);
    expect(summary.text).toContain(t("e2ee.secretFragment"));
    expect(summary.text).not.toContain("secret label");
    expect(summary.text).not.toContain("urn:secret");
    expect(document.safeTextPreview).not.toContain("secret label");
  },
);

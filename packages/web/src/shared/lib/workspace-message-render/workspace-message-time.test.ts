import { afterEach, describe, expect, it } from "vitest";
import { getLocale, setLocale } from "~/i18n/i18n";
import {
  formatLocalMessageTime,
  formatWorkspaceMessageTime,
  parseWorkspaceMessageTime,
} from "../workspace-message-time.lib";
import { formatWorkspaceMessageTimesForCopy } from "./workspace-message-marked.lib";
import { parseWorkspaceMessageBody } from "./workspace-message-parse.lib";
import { renderWorkspaceMessageBody } from "./workspace-message-render.lib";
import { summarizeWorkspaceMessageBody } from "./workspace-message-summary.lib";

const originalLocale = getLocale();
afterEach(() => setLocale(originalLocale));
const utc = "2026-10-13T10:02:00Z";
const source = `urn:time:${utc}`;

describe("global message times", () => {
  it("copies displayed times while preserving Markdown, code, escaped and invalid URNs", () => {
    for (const locale of ["ru", "en"] as const) {
      setLocale(locale);
      const input = [
        `\`${source}\``,
        `**${source}**`,
        `\\${source}`,
        "urn:time:tomorrow",
        `> ${source}`,
        `| Time |\n| --- |\n| ${source} |`,
      ].join("\n\n");
      const displayed = formatLocalMessageTime(utc);
      expect(formatWorkspaceMessageTimesForCopy(input)).toBe(
        [
          `\`${source}\``,
          `**${displayed}**`,
          `\\${source}`,
          "urn:time:tomorrow",
          `> ${displayed}`,
          `| Time |\n| --- |\n| ${displayed} |`,
        ].join("\n\n"),
      );
    }
  });
  it("normalizes explicit zones to the same UTC instant and preserves precision", () => {
    expect(parseWorkspaceMessageTime("2026-10-13T13:02:00+03:00")).toBe(utc);
    expect(parseWorkspaceMessageTime("2026-10-13T03:02:00-07:00")).toBe(utc);
    expect(parseWorkspaceMessageTime("2026-10-13T10:02Z")).toBe(utc);
    expect(parseWorkspaceMessageTime("2024-02-29T23:59:59.125Z")).toBe("2024-02-29T23:59:59.125Z");
    expect(formatWorkspaceMessageTime(new Date("2026-10-13T13:02:00+03:00"))).toBe(source);
  });

  it.each([
    "2026-02-29T10:00:00Z",
    "2026-04-31T10:00:00Z",
    "2026-13-01T10:00:00Z",
    "2026-10-13T24:00:00Z",
    "2026-10-13T10:60:00Z",
    "2026-10-13T10:00:60Z",
    "2026-10-13T10:00:00+24:00",
    "2026-10-13T10:00:00+03:60",
    "2026-10-13T10:00:00",
    "tomorrow",
    "0",
    "0000-01-01T00:00:00Z",
  ])("keeps ambiguous or invalid time %s as literal text", (value) => {
    expect(parseWorkspaceMessageTime(value)).toBeNull();
    const literal = `urn:time:${value}`;
    const parsed = parseWorkspaceMessageBody(literal);
    const result = renderWorkspaceMessageBody(parsed);
    expect(summarizeWorkspaceMessageBody(parsed).text).toBe(literal);
    expect(result.html).not.toContain("<time ");
    expect(result.html).toContain(literal);
  });

  it("normalizes URN casing and offsets to the same instant", () => {
    for (const markdown of [source, `URN:TIME:${utc}`, "urn:time:2026-10-13T13:02:00+03:00"]) {
      const parsed = parseWorkspaceMessageBody(markdown);
      const container = document.createElement("div");
      container.innerHTML = renderWorkspaceMessageBody(parsed).html;
      expect(container.querySelector("time")).toHaveAttribute("datetime", utc);
      expect(summarizeWorkspaceMessageBody(parsed).text).toBe(formatLocalMessageTime(utc));
      expect(parsed.sourceMarkdown).toBe(markdown);
    }
  });

  it("renders safe semantic times and localizes summaries without changing stored Markdown", () => {
    for (const locale of ["ru", "en"] as const) {
      setLocale(locale);
      const document = parseWorkspaceMessageBody(`**Meeting ${source}**`);
      const result = renderWorkspaceMessageBody(document);
      const container = window.document.createElement("div");
      container.innerHTML = result.html;
      const time = container.querySelector("time");
      expect(time).toHaveAttribute("datetime", utc);
      expect(time).toHaveAttribute("role", "button");
      expect(time).toHaveAttribute("aria-haspopup", "dialog");
      expect(time).toHaveTextContent(formatLocalMessageTime(utc));
      expect(time?.title).toContain(locale === "ru" ? "часовом поясе" : "time zone");
      expect(time?.title).toContain("UTC");
      expect(document.sourceMarkdown).toBe(`**Meeting ${source}**`);
      expect(document.metadata.contentKind).toBe("inline-rich");
      expect(document.safeTextPreview).toContain(formatLocalMessageTime(utc));
      expect(summarizeWorkspaceMessageBody(document).text).toContain(formatLocalMessageTime(utc));
    }
  });

  it("leaves code and escaped syntax literal but renders dates inside quotes, lists and tables", () => {
    const result = renderWorkspaceMessageBody(
      parseWorkspaceMessageBody(
        [
          `\`${source}\``,
          `\\${source}`,
          "```",
          source,
          "```",
          `> ${source}`,
          `- ${source}`,
          `| Time |\n| --- |\n| ${source} |`,
        ].join("\n\n"),
      ),
    );
    const container = document.createElement("div");
    container.innerHTML = result.html;
    expect(container.querySelectorAll("time")).toHaveLength(3);
    expect(container.querySelectorAll("code time")).toHaveLength(0);
    expect(container.querySelector("code")?.textContent).toBe(source);
    expect(container.textContent?.split(source)).toHaveLength(4);
  });

  it("cannot inject attributes or HTML through a time", () => {
    const result = renderWorkspaceMessageBody(
      parseWorkspaceMessageBody(
        'urn:time:2026-10-13T10:02:00Z"onclick="alert(1) <script>alert(1)</script>',
      ),
    );
    const container = document.createElement("div");
    container.innerHTML = result.html;
    expect(container.querySelector("[onclick],script")).toBeNull();
    expect(container.querySelector("time")).toHaveAttribute("datetime", "2026-10-13T10:02:00Z");
  });
});

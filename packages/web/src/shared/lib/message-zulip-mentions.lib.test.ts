import { describe, expect, it, vi } from "vitest";
import {
  injectZulipMentionPlaceholders,
  restoreZulipMentionPlaceholders,
} from "./message-zulip-mentions.lib";

describe("injectZulipMentionPlaceholders", () => {
  it("records wildcard mentions without calling resolver", () => {
    const resolve = vi.fn(() => null as number | null);
    const { markdown, tokens } = injectZulipMentionPlaceholders("Hi @**all** there", resolve);
    expect(resolve).not.toHaveBeenCalled();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.kind).toBe("wildcard");
    expect(tokens[0]?.displayName).toBe("all");
    expect(markdown.includes("@**")).toBe(false);
  });

  it("resolves user id via resolver", () => {
    const { markdown, tokens } = injectZulipMentionPlaceholders("Ping @**John**", (name) =>
      name === "John" ? 42 : null,
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.kind).toBe("user");
    expect(tokens[0]?.userId).toBe(42);
    expect(markdown).not.toContain("@**");
  });

  it("resolves Workspace user uuid via resolver", () => {
    const { markdown, tokens } = injectZulipMentionPlaceholders("Ping @**John**", (name) =>
      name === "John" ? { userUuid: "a225223c-637c-4afa-918f-5f2798b9305f" } : null,
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.kind).toBe("user");
    expect(tokens[0]?.userId).toBeUndefined();
    expect(tokens[0]?.userUuid).toBe("a225223c-637c-4afa-918f-5f2798b9305f");
    expect(markdown).not.toContain("@**");
  });

  it("marks unknown users as unresolved", () => {
    const { tokens } = injectZulipMentionPlaceholders("@**Nobody**", () => null);
    expect(tokens[0]?.kind).toBe("unresolved");
  });

  it("uses explicit user id in silent reply @_**Name|id** without calling resolver", () => {
    const resolve = vi.fn(() => null as number | null);
    const { markdown, tokens } = injectZulipMentionPlaceholders(
      "@_**Doublek|507** [wrote](https://example.com/near/1)",
      resolve,
    );
    expect(resolve).not.toHaveBeenCalled();
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.kind).toBe("user");
    expect(tokens[0]?.userId).toBe(507);
    expect(tokens[0]?.displayName).toBe("Doublek");
    expect(markdown).not.toContain("@_");
    expect(markdown).not.toContain("**");
  });

  it("parses silent mention inside reply quote block with CRLF", () => {
    const body =
      "@_**Doublek|507** [wrote](https://zulip.example.com/#narrow/dm/507/near/5698318):\r\n```quote\r\n:squared_ok:\r\n```\r\n\r\nrest";
    const { tokens, markdown } = injectZulipMentionPlaceholders(body, () => null);
    expect(tokens[0]?.userId).toBe(507);
    expect(tokens[0]?.displayName).toBe("Doublek");
    expect(markdown).toContain("```quote");
  });

  it("resolves @_**Name** without id via resolver", () => {
    const { tokens } = injectZulipMentionPlaceholders("@_**Alice**", (n) =>
      n === "Alice" ? 3 : null,
    );
    expect(tokens[0]?.userId).toBe(3);
    expect(tokens[0]?.kind).toBe("user");
  });
});

describe("restoreZulipMentionPlaceholders", () => {
  it("prefixes wildcard mention label with @", () => {
    const { markdown, tokens } = injectZulipMentionPlaceholders("Hi @**all**", () => null);
    const html = restoreZulipMentionPlaceholders(`<p>${markdown}</p>`, tokens);
    expect(html).toContain(">@all<");
    expect(html).toContain("user-group-mention");
  });

  it("replaces markers with span markup matching sanitizeHtml expectations", () => {
    const { markdown, tokens } = injectZulipMentionPlaceholders("@**John** hi", (n) =>
      n === "John" ? 7 : null,
    );
    const markedLike = `<p>${markdown}</p>`;
    const html = restoreZulipMentionPlaceholders(markedLike, tokens);
    expect(html).toContain('class="user-mention"');
    expect(html).toContain('data-user-id="7"');
    expect(html).toContain(">@John<");
    expect(html).not.toContain("**");
  });

  it("adds data-user-uuid to Workspace mention spans", () => {
    const { markdown, tokens } = injectZulipMentionPlaceholders("@**John** hi", (n) =>
      n === "John" ? { userUuid: "a225223c-637c-4afa-918f-5f2798b9305f" } : null,
    );
    const html = restoreZulipMentionPlaceholders(`<p>${markdown}</p>`, tokens);
    expect(html).toContain('class="user-mention"');
    expect(html).toContain('data-user-uuid="a225223c-637c-4afa-918f-5f2798b9305f"');
    expect(html).not.toContain("data-user-id");
  });
});

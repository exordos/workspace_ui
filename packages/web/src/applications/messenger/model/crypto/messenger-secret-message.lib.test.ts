import { describe, expect, it, vi } from "vitest";
import { buildWorkspaceSecretUrn } from "~/shared/lib/workspace-reference-urn.lib";
import {
  buildMessengerSecretMarkdown,
  restoreMessengerSecretMarkdown,
} from "./messenger-secret-message.lib";

const STREAM = "11111111-1111-4111-8111-111111111111";
const KEY = "22222222-2222-4222-8222-222222222222";
const urn = buildWorkspaceSecretUrn(STREAM, KEY, { bytes: new Uint8Array([1, 2, 3]) })!;
const link = `[secret](<${urn}> "private")`;

describe("encrypted fragment editing", () => {
  it.each([
    `Before ${link} after`,
    `**${link}**`,
    `[Adam](urn:user:${STREAM}) :smile: ${link} [Adam](urn:user:${STREAM} "silent")`,
    `@**Adam** :smile: ${link} &amp; \\*literal\\*`,
    `||public|| ${link}`,
    `\`\`\`quote\n[Adam](urn:user:${STREAM}) ${link}\n\`\`\``,
    `\`\`\`spoiler Details\n:smile: ${link}\n\`\`\``,
    `> ${link}\n> public`,
    `- ${link}\n- public`,
    `| Public | Private |\n| --- | --- |\n| text | ${link} |`,
    `\`${link}\` then ${link}\n\n\`\`\`\n${link}\n\`\`\``,
    `\\[secret](${urn}) then ${link}`,
  ])("restores actual links without changing surrounding Markdown: %s", async (markdown) => {
    const decrypt = vi.fn().mockResolvedValue("private\nsecond line");
    const restored = await restoreMessengerSecretMarkdown(markdown, decrypt);
    const actualIndex = markdown.startsWith("`")
      ? markdown.indexOf(link, markdown.indexOf(" then "))
      : markdown.indexOf(link);
    expect(restored).toBe(
      markdown.slice(0, actualIndex) +
        ":::private\nsecond line:::" +
        markdown.slice(actualIndex + link.length),
    );
    expect(decrypt).toHaveBeenCalledOnce();
    expect(decrypt).toHaveBeenCalledWith(
      expect.objectContaining({ streamUuid: STREAM, keyUuid: KEY }),
    );
  });

  it("leaves literal links and original line breaks unchanged when no secret is rendered", async () => {
    const markdown = `\`${link}\`\r\n\r\n\`\`\`ts\r\n${link}\r\n\`\`\``;
    const decrypt = vi.fn();
    expect(await restoreMessengerSecretMarkdown(markdown, decrypt)).toBe(markdown);
    expect(decrypt).not.toHaveBeenCalled();
  });

  it("fails the entire restoration when any fragment is unavailable", async () => {
    const decrypt = vi.fn().mockResolvedValueOnce("available").mockResolvedValueOnce(null);
    await expect(restoreMessengerSecretMarkdown(`${link} and ${link}`, decrypt)).rejects.toThrow(
      "invalid-secret",
    );
    expect(decrypt).toHaveBeenCalledTimes(2);
  });

  it("restores multiple generations and re-encrypts every range before transport", async () => {
    const nextKey = "33333333-3333-4333-8333-333333333333";
    const secondUrn = buildWorkspaceSecretUrn(STREAM, nextKey, {
      bytes: new Uint8Array([4, 5, 6]),
    })!;
    const restored = await restoreMessengerSecretMarkdown(
      `${link} public [second](${secondUrn})`,
      (reference) => Promise.resolve(reference.keyUuid === KEY ? "one" : "two\nlines"),
    );
    expect(restored).toBe(":::one::: public :::two\nlines:::");
    const wire = buildMessengerSecretMarkdown(STREAM, restored, [
      { kind: "e2ee", keyUuid: nextKey, content: { bytes: new Uint8Array([7]) } },
      { kind: "e2ee", keyUuid: nextKey, content: { bytes: new Uint8Array([8]) } },
    ]);
    expect(wire).not.toContain("one");
    expect(wire).not.toContain("two");
    expect(wire).not.toContain(":::");
    expect(wire.match(/urn:secret:/g)).toHaveLength(2);
  });

  it.each([`> \`\`\`\n> ${link}\n> \`\`\`\n>\n> ${link}`, `- code:\n\n      ${link}\n\n- ${link}`])(
    "keeps normalized code tokens opaque while restoring the following link: %s",
    async (markdown) => {
      const decrypt = vi.fn().mockResolvedValue("private");
      const index = markdown.lastIndexOf(link);
      expect(await restoreMessengerSecretMarkdown(markdown, decrypt)).toBe(
        markdown.slice(0, index) + ":::private:::" + markdown.slice(index + link.length),
      );
      expect(decrypt).toHaveBeenCalledOnce();
    },
  );

  it.each([null, "", "  ", "inside ::: marker"])(
    "rejects unavailable or ambiguous plaintext: %s",
    async (plaintext) => {
      await expect(
        restoreMessengerSecretMarkdown(link, () => Promise.resolve(plaintext)),
      ).rejects.toThrow("invalid-secret");
    },
  );

  it("rejects public delimiters that could expose a restored fragment", async () => {
    await expect(
      restoreMessengerSecretMarkdown(`::: public ${link}`, () => Promise.resolve("private")),
    ).rejects.toThrow("invalid-secret");
  });
});

import { describe, expect, it } from "vitest";
import { parseWorkspaceMessageBody } from "./workspace-message-parse.lib";

function placementOf(markdown: string): string {
  return parseWorkspaceMessageBody(markdown).metadata.preferredMetaPlacement;
}

const QUOTE_MESSAGE_UUID = "11111111-1111-4111-8111-111111111111";
const FILE_UUID = "22222222-2222-4222-8222-222222222222";

describe("preferredMetaPlacement", () => {
  describe("inline when the message ends with a text paragraph", () => {
    it("keeps a single plain line inline", () => {
      expect(placementOf("Simple workspace text")).toBe("inline");
    });

    it("keeps a soft line break inline because it stays inside one paragraph", () => {
      expect(placementOf("First line\nSecond line")).toBe("inline");
    });

    it("keeps several plain paragraphs inline", () => {
      expect(placementOf("First paragraph\n\nSecond paragraph")).toBe("inline");
    });

    it("keeps a trailing paragraph after a quote reference inline", () => {
      expect(
        placementOf(
          [
            `[Old Bob](urn:quote:${QUOTE_MESSAGE_UUID})`,
            "",
            "это нормально. сервер закрыл сокет",
          ].join("\n"),
        ),
      ).toBe("inline");
    });

    it("keeps a trailing paragraph after a markdown blockquote inline", () => {
      expect(placementOf("> quoted reply\n\nand a follow-up")).toBe("inline");
    });

    it("keeps a trailing paragraph after a list inline", () => {
      expect(placementOf("- one\n- two\n\nafter the list")).toBe("inline");
    });

    it("keeps a trailing paragraph after a code block inline", () => {
      expect(
        placementOf(["```ts", "const value = 1;", "```", "", "after the code"].join("\n")),
      ).toBe("inline");
    });

    it("keeps mentions, links and inline code inline", () => {
      expect(
        placementOf("@Cassandra Volkova смотри [docs](https://example.com) и `message.reactions`"),
      ).toBe("inline");
    });

    it("keeps a trailing paragraph inline even when media appears earlier", () => {
      expect(
        placementOf([`![screen.png](urn:image:${FILE_UUID})`, "", "подпись к скрину"].join("\n")),
      ).toBe("inline");
    });
  });

  describe("row when the last block is not a text paragraph", () => {
    it("uses row for a list as the last block", () => {
      expect(placementOf("Intro\n\n- one\n- two")).toBe("row");
    });

    it("uses row for a code block as the last block", () => {
      expect(placementOf(["Intro", "", "```ts", "const value = 1;", "```"].join("\n"))).toBe("row");
    });

    it("uses row for a markdown blockquote as the last block", () => {
      expect(placementOf("Intro\n\n> quoted tail")).toBe("row");
    });

    it("uses row for a table as the last block", () => {
      expect(
        placementOf(
          ["Intro", "", "| Topic | State |", "|:--|--:|", "| Renderer | Ready |"].join("\n"),
        ),
      ).toBe("row");
    });

    it("uses row for a heading as the last block", () => {
      expect(placementOf("Intro\n\n## Delivery status")).toBe("row");
    });

    it("uses row for a quote reference as the last block", () => {
      expect(placementOf(`Смотри тут\n\n[Old Bob](urn:quote:${QUOTE_MESSAGE_UUID})`)).toBe("row");
    });

    it("uses row when the last paragraph carries media", () => {
      expect(placementOf(`![screen.png](urn:image:${FILE_UUID})`)).toBe("row");
    });

    it("uses row when the last paragraph carries an attachment", () => {
      expect(placementOf(`[report.pdf](urn:file:${FILE_UUID}?name=report.pdf)`)).toBe("row");
    });

    it("uses row for an empty message", () => {
      expect(placementOf("")).toBe("row");
    });
  });
});

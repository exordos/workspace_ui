import { describe, expect, it } from "vitest";
import {
  areEquivalentChatIds,
  canonicalizeChatId,
  folderItemLookupKeysForChatId,
  resolveFolderItemUuid,
} from "./folder-sync-chat-id.lib";

describe("canonicalizeChatId", () => {
  it("keeps bare numeric ids as opaque invalid legacy ids", () => {
    expect(canonicalizeChatId("11")).toBe("11");
  });

  it("normalizes stream topic casing and empty topic", () => {
    expect(canonicalizeChatId("stream:11111111-1111-4111-8111-111111111111:General")).toBe(
      "stream:11111111-1111-4111-8111-111111111111:general",
    );
    expect(canonicalizeChatId("stream:11111111-1111-4111-8111-111111111111:")).toBe(
      "stream:11111111-1111-4111-8111-111111111111:general",
    );
  });

  it("keeps stream-dash ids as opaque invalid legacy ids", () => {
    expect(canonicalizeChatId("stream-42")).toBe("stream-42");
  });

  it("sorts dm participant ids", () => {
    expect(canonicalizeChatId("dm:21,7")).toBe("dm:7,21");
    expect(canonicalizeChatId("dm:7,21")).toBe("dm:7,21");
  });

  it("accepts pm prefix like dm", () => {
    expect(canonicalizeChatId("pm:3,1")).toBe("dm:1,3");
  });
});

describe("areEquivalentChatIds", () => {
  it("matches aliases that share canonical form", () => {
    expect(
      areEquivalentChatIds(
        "stream:11111111-1111-4111-8111-111111111111",
        "stream:11111111-1111-4111-8111-111111111111:general",
      ),
    ).toBe(true);
    expect(areEquivalentChatIds("dm:7,21", "dm:21,7")).toBe(true);
  });

  it("does not treat bare numeric ids as stream or dm identifiers", () => {
    expect(areEquivalentChatIds("42", "stream:42:general")).toBe(false);
    expect(areEquivalentChatIds("42", "dm:42")).toBe(false);
  });
});

describe("folderItemLookupKeysForChatId", () => {
  it("does not index bare numeric ids under stream canonical key", () => {
    expect(folderItemLookupKeysForChatId("42")).toEqual(["42"]);
    expect(folderItemLookupKeysForChatId("42")).not.toEqual(expect.arrayContaining(["dm:42"]));
  });
});

describe("resolveFolderItemUuid", () => {
  it("resolves by canonical key without scanning alias sets", () => {
    const items = [
      {
        uuid: "item-11",
        chatId: "stream:11111111-1111-4111-8111-111111111111:general",
      },
    ];
    expect(resolveFolderItemUuid(items, "stream:11111111-1111-4111-8111-111111111111")).toBe(
      "item-11",
    );
  });
});

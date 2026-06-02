import { describe, expect, it } from "vitest";
import {
  areEquivalentChatIds,
  canonicalizeChatId,
  folderItemLookupKeysForChatId,
  resolveFolderItemUuid,
} from "./folder-sync-chat-id.lib";

describe("canonicalizeChatId", () => {
  it("maps bare numeric folder ids to stream general topic", () => {
    expect(canonicalizeChatId("11")).toBe("stream:11:general");
    expect(canonicalizeChatId("stream:11:general")).toBe("stream:11:general");
  });

  it("normalizes stream topic casing and empty topic", () => {
    expect(canonicalizeChatId("stream:5:General")).toBe("stream:5:general");
    expect(canonicalizeChatId("stream:5:")).toBe("stream:5:general");
  });

  it("maps stream-dash ids to stream colon form", () => {
    expect(canonicalizeChatId("stream-42")).toBe("stream:42:general");
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
    expect(areEquivalentChatIds("11", "stream:11:general")).toBe(true);
    expect(areEquivalentChatIds("dm:7,21", "dm:21,7")).toBe(true);
  });

  it("does not treat bare numeric ids as dm identifiers", () => {
    expect(areEquivalentChatIds("42", "dm:42")).toBe(false);
  });
});

describe("folderItemLookupKeysForChatId", () => {
  it("indexes bare numeric ids under stream canonical key", () => {
    expect(folderItemLookupKeysForChatId("42")).toEqual(
      expect.arrayContaining(["stream:42:general"]),
    );
    expect(folderItemLookupKeysForChatId("42")).not.toEqual(expect.arrayContaining(["dm:42"]));
  });
});

describe("resolveFolderItemUuid", () => {
  it("resolves by canonical key without scanning alias sets", () => {
    const items = [{ uuid: "item-11", chatId: "11" }];
    expect(resolveFolderItemUuid(items, "stream:11:general")).toBe("item-11");
  });
});

import { describe, expect, it } from "vitest";
import { parseDmKeyToUserIds } from "./message-chat-context.lib";

describe("parseDmKeyToUserIds", () => {
  it("parses numeric dm keys and excludes current user for fetch narrow", () => {
    expect(parseDmKeyToUserIds("7,42", 7)).toEqual([42]);
  });

  it("parses IAM UUID dm keys and excludes current user for fetch narrow", () => {
    const currentUuid = "00000000-0000-0000-0000-000000000001";
    const peerUuid = "00000000-0000-0000-0000-000000000002";
    expect(parseDmKeyToUserIds(`${currentUuid},${peerUuid}`, currentUuid)).toEqual([peerUuid]);
  });
});

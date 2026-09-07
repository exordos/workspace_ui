import { describe, expect, it } from "vitest";
import {
  buildWorkspaceProfileShareLink,
  parseWorkspaceProfileShareHash,
} from "./workspace-profile-link.lib";

const USER_UUID = "33333333-3333-4333-8333-333333333333";

describe("Workspace profile links", () => {
  it("reads the existing web and Android share format", () => {
    const link = buildWorkspaceProfileShareLink("https://workspace.example.com/", USER_UUID);
    expect(link).toBe(`https://workspace.example.com/#user/${USER_UUID}`);
    expect(parseWorkspaceProfileShareHash(new URL(link!).hash)).toBe(USER_UUID);
  });

  it.each([
    "",
    "#user/",
    "#user/user-1",
    `#user/${USER_UUID}/extra`,
    `#user/${USER_UUID}?other=1`,
    "#message-123",
    "#user/%2F%2Fevil.example",
  ])("ignores an invalid or unrelated fragment: %s", (hash) =>
    expect(parseWorkspaceProfileShareHash(hash)).toBeNull(),
  );

  it("normalizes UUID letter case without accepting encoded route segments", () => {
    expect(parseWorkspaceProfileShareHash("#user/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")).toBe(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );
    expect(parseWorkspaceProfileShareHash(`#user/%33${USER_UUID.slice(1)}`)).toBeNull();
  });

  it("does not invent a server or serialize an invalid user", () => {
    expect(buildWorkspaceProfileShareLink(undefined, USER_UUID)).toBeNull();
    expect(buildWorkspaceProfileShareLink("file:///workspace", USER_UUID)).toBeNull();
    expect(buildWorkspaceProfileShareLink("https://workspace.example.com", "../user")).toBeNull();
  });
});

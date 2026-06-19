import { describe, expect, it } from "vitest";
import {
  buildMessengerMessageWebPermalink,
  encodeWorkspaceHashComponent,
} from "./messenger-web-permalink.lib";

describe("encodeWorkspaceHashComponent", () => {
  it("escapes hash-sensitive characters per Workspace", () => {
    expect(encodeWorkspaceHashComponent("a b")).toContain(".");
  });
});

describe("buildMessengerMessageWebPermalink", () => {
  it("builds DM permalink matching Workspace pm_perma_link (sorted ids + -dm)", () => {
    const url = buildMessengerMessageWebPermalink(
      "https://chat.example.com",
      {
        id: 5635212,
        stream_id: null,
        subject: "",
        display_recipient: [
          { id: 422, full_name: "Me" },
          { id: 507, full_name: "Doublek" },
        ],
      },
      () => undefined,
    );
    expect(url).toBe("https://chat.example.com/#narrow/dm/422,507-dm/near/5635212");
  });

  it("uses -group for 3+ participants", () => {
    const url = buildMessengerMessageWebPermalink(
      "https://chat.example.com",
      {
        id: 10,
        stream_id: null,
        subject: "",
        display_recipient: [
          { id: 1, full_name: "A" },
          { id: 2, full_name: "B" },
          { id: 3, full_name: "C" },
        ],
      },
      () => undefined,
    );
    expect(url).toBe("https://chat.example.com/#narrow/dm/1,2,3-group/near/10");
  });

  it("builds stream permalink with channel + topic + near", () => {
    const url = buildMessengerMessageWebPermalink(
      "https://chat.example.com",
      {
        id: 99,
        stream_id: 5,
        subject: "general chat",
        display_recipient: "general",
      },
      (sid) => (sid === 5 ? "general" : undefined),
    );
    expect(url).toContain("https://chat.example.com/#narrow/channel/");
    expect(url).toContain("/topic/");
    expect(url).toContain("/near/99");
  });

  it("returns null when realm is empty", () => {
    expect(
      buildMessengerMessageWebPermalink(
        "",
        {
          id: 1,
          stream_id: null,
          subject: "",
          display_recipient: [{ id: 1, full_name: "A" }],
        },
        () => undefined,
      ),
    ).toBeNull();
  });

  it("returns null for private message without recipient list", () => {
    expect(
      buildMessengerMessageWebPermalink(
        "https://chat.example.com",
        {
          id: 1,
          stream_id: null,
          subject: "",
          display_recipient: undefined,
        },
        () => undefined,
      ),
    ).toBeNull();
  });
});

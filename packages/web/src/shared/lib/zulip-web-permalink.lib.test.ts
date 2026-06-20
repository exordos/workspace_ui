import { describe, expect, it } from "vitest";
import { buildZulipMessageWebPermalink, encodeZulipHashComponent } from "./zulip-web-permalink.lib";

describe("encodeZulipHashComponent", () => {
  it("escapes hash-sensitive characters per Zulip", () => {
    expect(encodeZulipHashComponent("a b")).toContain(".");
  });
});

describe("buildZulipMessageWebPermalink", () => {
  it("builds DM permalink matching Zulip pm_perma_link (sorted ids + -dm)", () => {
    const url = buildZulipMessageWebPermalink(
      "https://zulip.example.com",
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
    expect(url).toBe("https://zulip.example.com/#narrow/dm/422,507-dm/near/5635212");
  });

  it("uses -group for 3+ participants", () => {
    const url = buildZulipMessageWebPermalink(
      "https://zulip.example.com",
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
    expect(url).toBe("https://zulip.example.com/#narrow/dm/1,2,3-group/near/10");
  });

  it("builds stream permalink with channel + topic + near", () => {
    const url = buildZulipMessageWebPermalink(
      "https://zulip.example.com",
      {
        id: 99,
        stream_id: 5,
        subject: "general chat",
        display_recipient: "general",
      },
      (sid) => (sid === 5 ? "general" : undefined),
    );
    expect(url).toContain("https://zulip.example.com/#narrow/channel/");
    expect(url).toContain("/topic/");
    expect(url).toContain("/near/99");
  });

  it("returns null when realm is empty", () => {
    expect(
      buildZulipMessageWebPermalink(
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
      buildZulipMessageWebPermalink(
        "https://zulip.example.com",
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

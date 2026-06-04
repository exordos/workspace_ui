import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { outgoingEchoContentMatches } from "./message-outgoing-echo.lib";

function msg(partial: Partial<MockMessage>): MockMessage {
  return {
    id: 1,
    sender_id: 10,
    sender_full_name: "A",
    stream_id: null,
    subject: "",
    content: "",
    timestamp: 0,
    ...partial,
  };
}

describe("outgoingEchoContentMatches", () => {
  it("matches plain text to equivalent HTML paragraph", () => {
    expect(
      outgoingEchoContentMatches(msg({ content: "hello" }), msg({ content: "<p>hello</p>" })),
    ).toBe(true);
  });

  it("normalizes whitespace", () => {
    expect(
      outgoingEchoContentMatches(msg({ content: "a  b" }), msg({ content: "<p>a\n\tb</p>" })),
    ).toBe(true);
  });

  it("returns false for different bodies", () => {
    expect(
      outgoingEchoContentMatches(msg({ content: "one" }), msg({ content: "<p>two</p>" })),
    ).toBe(false);
  });

  it("matches optimistic markdown upload to server HTML inline image echo", () => {
    const optimistic = msg({
      content: "[image.png](/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png)",
    });
    const serverEcho = msg({
      content: [
        '<p>emoji <img class="emoji" alt=":smile:" src="/static/generated/emoji/smile.png"></p>',
        '<div class="message_inline_image">',
        '<a href="/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png">',
        '<img src="/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/840x560.webp">',
        "</a></div>",
      ].join(""),
    });
    expect(outgoingEchoContentMatches(optimistic, serverEcho)).toBe(true);
  });

  it("returns false when upload paths differ between markdown and HTML", () => {
    expect(
      outgoingEchoContentMatches(
        msg({ content: "[a.png](/user_uploads/1/a.png)" }),
        msg({
          content:
            '<div class="message_inline_image"><a href="/user_uploads/2/b.png"><img src="/user_uploads/2/b.png"></a></div>',
        }),
      ),
    ).toBe(false);
  });
});

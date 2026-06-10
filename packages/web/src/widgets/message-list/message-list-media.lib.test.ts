import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { buildMessageMediaGallery } from "./message-list-media.lib";

function msg(id: number, content: string): MockMessage {
  return {
    id,
    sender_id: 42,
    sender_full_name: "Alice",
    stream_id: 10,
    display_recipient: "engineering",
    channel: "engineering",
    subject: "general",
    content,
    timestamp: 1_710_000_000 + id,
  };
}

describe("buildMessageMediaGallery", () => {
  it("extracts image urls in appearance order", () => {
    const gallery = buildMessageMediaGallery([
      msg(1, '<p><img src="https://cdn.example.com/a.png" /></p>'),
      msg(2, '<p><img src="https://cdn.example.com/b.png" /></p>'),
    ]);

    expect(gallery.items.map((item) => item.url)).toEqual([
      "https://cdn.example.com/a.png",
      "https://cdn.example.com/b.png",
    ]);
    expect(gallery.indexByUrl.get("https://cdn.example.com/a.png")).toBe(0);
    expect(gallery.indexByUrl.get("https://cdn.example.com/b.png")).toBe(1);
  });

  it("deduplicates repeated images across messages", () => {
    const gallery = buildMessageMediaGallery([
      msg(1, '<p><img src="https://cdn.example.com/a.png" /></p>'),
      msg(2, '<p><img src="https://cdn.example.com/a.png" /></p>'),
    ]);

    expect(gallery.items).toHaveLength(1);
    expect(gallery.indexByUrl.get("https://cdn.example.com/a.png")).toBe(0);
  });

  it("normalizes relative image urls to absolute", () => {
    const gallery = buildMessageMediaGallery([
      msg(1, '<p><img src="/user_uploads/1/a.png" /></p>'),
    ]);

    expect(gallery.items[0]?.url).toMatch(/\/user_uploads\/1\/a\.png$/);
    expect(gallery.indexByUrl.size).toBe(1);
  });

  it("includes user_upload image links as gallery items", () => {
    const gallery = buildMessageMediaGallery([
      msg(
        1,
        '<p><a href="/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png">image.png</a></p>',
      ),
    ]);

    expect(gallery.items).toHaveLength(1);
    expect(gallery.items[0]?.url).toMatch(
      /\/user_uploads\/2\/ff\/aP3oHiNs40xdmpUNVol7Z5ga\/image\.png$/,
    );
  });

  it("prefers original user_upload path over thumbnail img src", () => {
    const gallery = buildMessageMediaGallery([
      msg(
        1,
        [
          '<p><a href="/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png">image.png</a></p>',
          '<div class="message_inline_image">',
          '<a href="/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png">',
          '<img src="/user_uploads/thumbnail/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png/840x560.webp" alt="image.png">',
          "</a></div>",
        ].join(""),
      ),
    ]);

    expect(gallery.items).toHaveLength(1);
    expect(gallery.items[0]?.url).toMatch(
      /\/user_uploads\/2\/ff\/aP3oHiNs40xdmpUNVol7Z5ga\/image\.png$/,
    );
    expect(gallery.items[0]?.url).not.toContain("/thumbnail/");
  });

  it("extracts video urls from video source and user_upload links", () => {
    const gallery = buildMessageMediaGallery([
      msg(
        1,
        '<video controls><source src="/user_uploads/1/private.mp4" type="video/mp4" /></video>',
      ),
      msg(2, '<p><a href="/user_uploads/2/clip.webm">clip.webm</a></p>'),
    ]);

    expect(gallery.items).toHaveLength(2);
    expect(gallery.items[0]?.type).toBe("video");
    expect(gallery.items[0]?.url).toMatch(/private\.mp4$/);
    expect(gallery.items[1]?.type).toBe("video");
    expect(gallery.items[1]?.url).toMatch(/clip\.webm$/);
  });

  it("orders images before videos within the same message", () => {
    const gallery = buildMessageMediaGallery([
      msg(
        1,
        '<p><img src="https://cdn.example.com/a.png" /><video><source src="/user_uploads/1/v.mp4" /></video></p>',
      ),
    ]);

    expect(gallery.items.map((item) => item.type)).toEqual(["image", "video"]);
  });

  it("deduplicates repeated videos across messages", () => {
    const gallery = buildMessageMediaGallery([
      msg(1, '<video><source src="/user_uploads/1/same.mp4" type="video/mp4" /></video>'),
      msg(2, '<video><source src="/user_uploads/1/same.mp4" type="video/mp4" /></video>'),
    ]);

    expect(gallery.items).toHaveLength(1);
    expect(gallery.items[0]?.type).toBe("video");
  });
});

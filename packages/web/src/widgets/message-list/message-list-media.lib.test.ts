import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/messenger.types";
import { testMessageId, testMessageOrdinal } from "~/test/factories";
import { buildMessageMediaGallery, resolveGalleryMediaIndex } from "./message-list-media.lib";

function msg(id: number | string, content: string): MockMessage {
  return {
    id: testMessageId(id),
    sender_id: 42,
    sender_full_name: "Alice",
    stream_uuid: "00000000-0000-4000-8000-000000000010",
    display_recipient: "engineering",
    channel: "engineering",
    subject: "general",
    content,
    timestamp: 1_710_000_000 + testMessageOrdinal(id),
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
    expect(gallery.items).toHaveLength(1);
    expect(gallery.indexByUrl.get("/user_uploads/1/a.png")).toBe(0);
  });

  it("indexes thumbnail and full-resolution user upload URLs to the same item", () => {
    const gallery = buildMessageMediaGallery([
      msg(1, '<p><img src="/user_uploads/1/a.png" /></p>'),
    ]);
    const lookupKey = "/user_uploads/1/a.png";
    const thumbKey = "/user_uploads/thumbnail/1/a.png/840x560.webp";

    expect(resolveGalleryMediaIndex(gallery, lookupKey)).toBe(0);
    expect(resolveGalleryMediaIndex(gallery, thumbKey)).toBe(0);
    expect(gallery.indexByUrl.get(lookupKey)).toBe(0);
  });

  it("deduplicates thumbnail and full-resolution references to the same image", () => {
    const gallery = buildMessageMediaGallery([
      msg(1, '<p><img src="/user_uploads/1/a.png" /></p>'),
      msg(2, '<p><img src="/user_uploads/thumbnail/1/a.png/840x560.webp" alt="a.png" /></p>'),
    ]);

    expect(gallery.items).toHaveLength(1);
  });

  it("includes user_upload image links as gallery items", () => {
    const gallery = buildMessageMediaGallery([
      msg(
        42,
        '<p><a href="/user_uploads/2/ff/aP3oHiNs40xdmpUNVol7Z5ga/image.png">image.png</a></p>',
      ),
    ]);

    expect(gallery.items).toHaveLength(1);
    expect(gallery.items[0]?.url).toMatch(
      /\/user_uploads\/2\/ff\/aP3oHiNs40xdmpUNVol7Z5ga\/image\.png$/,
    );
    expect(gallery.items[0]?.downloadFileName).toBe(`image-${testMessageId(42)}.png`);
  });

  it("adds message id and per-message counter to generic image download names", () => {
    const gallery = buildMessageMediaGallery([
      msg(
        42,
        [
          '<p><a href="/user_uploads/2/aa/one/image.png">image.png</a></p>',
          '<p><a href="/user_uploads/2/bb/two/image.png">image.png</a></p>',
        ].join(""),
      ),
    ]);

    expect(gallery.items).toHaveLength(2);
    expect(gallery.items[0]?.downloadFileName).toBe(`image-${testMessageId(42)}-1.png`);
    expect(gallery.items[1]?.downloadFileName).toBe(`image-${testMessageId(42)}-2.png`);
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

  it("extracts user upload images from markdown message bodies", () => {
    const gallery = buildMessageMediaGallery([
      msg(1, "[a.png](/user_uploads/1/a.png)"),
      msg(2, "[b.png](/user_uploads/1/b.png)"),
    ]);

    expect(gallery.items).toHaveLength(2);
    expect(gallery.indexByUrl.get("/user_uploads/1/a.png")).toBe(0);
    expect(gallery.indexByUrl.get("/user_uploads/1/b.png")).toBe(1);
  });

  it("extracts Workspace file image links from markdown by filename", () => {
    const href = "/api/messenger/v1/files/33333333-3333-4333-8333-333333333333/actions/download";
    const gallery = buildMessageMediaGallery([msg(1, `[photo.jpg](${href})`)]);

    expect(gallery.items).toHaveLength(1);
    expect(gallery.items[0]?.type).toBe("image");
    expect(gallery.items[0]?.url).toMatch(/\/api\/messenger\/v1\/files\/.+\/actions\/download$/);
    expect(gallery.indexByUrl.get(href)).toBe(0);
  });

  it("extracts backend Workspace file image URNs from markdown", () => {
    const urn =
      "urn:image:33333333-3333-7333-c333-333333333333?name=photo.bin&content_type=image%2Fjpeg&w=1280&h=720&size=1024";
    const href = "/api/messenger/v1/files/33333333-3333-7333-c333-333333333333/actions/download";
    const gallery = buildMessageMediaGallery([msg(1, `![photo.bin](${urn})`)]);

    expect(gallery.items).toHaveLength(1);
    expect(gallery.items[0]?.type).toBe("image");
    expect(gallery.items[0]?.url).toMatch(/\/api\/messenger\/v1\/files\/.+\/actions\/download$/);
    expect(gallery.items[0]?.downloadFileName).toBe(`image-${testMessageId(1)}.jpg`);
    expect(gallery.indexByUrl.get(href)).toBe(0);
    expect(resolveGalleryMediaIndex(gallery, urn)).toBe(0);
  });

  it("extracts backend Workspace file video URNs from markdown", () => {
    const urn =
      "urn:video:44444444-4444-7444-c444-444444444444?name=clip.bin&content_type=video%2Fmp4&w=1920&h=1080&size=2048";
    const href = "/api/messenger/v1/files/44444444-4444-7444-c444-444444444444/actions/download";
    const gallery = buildMessageMediaGallery([msg(1, `[clip.bin](${urn})`)]);

    expect(gallery.items).toHaveLength(1);
    expect(gallery.items[0]?.type).toBe("video");
    expect(gallery.items[0]?.url).toMatch(/\/api\/messenger\/v1\/files\/.+\/actions\/download$/);
    expect(gallery.items[0]?.downloadFileName).toBe(`media-${testMessageId(1)}.mp4`);
    expect(gallery.indexByUrl.get(href)).toBe(0);
    expect(resolveGalleryMediaIndex(gallery, urn)).toBe(0);
  });
});

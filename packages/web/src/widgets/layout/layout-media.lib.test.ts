import { describe, expect, it } from "vitest";
import type { MockMessage } from "~/shared/api/zulip.types";
import { buildRightPanelMedia } from "./layout-media.lib";

function createMessage(content: string): MockMessage {
  return {
    id: 1,
    sender_id: 10,
    sender_full_name: "Alice",
    stream_id: null,
    subject: "",
    content,
    timestamp: 1,
  };
}

describe("buildRightPanelMedia", () => {
  it("counts image and video tags plus classified anchor links", () => {
    const messages: MockMessage[] = [
      createMessage(
        '<p><img src="https://cdn.example.com/a.png" /></p><a href="https://docs.example.com/file.pdf">file</a><a href="https://example.com/page">page</a>',
      ),
      createMessage('<video src="https://cdn.example.com/clip.mp4"></video>'),
    ];

    expect(buildRightPanelMedia(messages)).toEqual({
      photos: 1,
      videos: 1,
      files: 1,
      links: 2,
    });
  });

  it("classifies media links by extension even without media tags", () => {
    const messages: MockMessage[] = [
      createMessage(
        '<a href="https://cdn.example.com/sticker.webp">img</a><a href="https://cdn.example.com/video.mp4">vid</a>',
      ),
    ];

    expect(buildRightPanelMedia(messages)).toEqual({
      photos: 1,
      videos: 1,
      files: 0,
      links: 2,
    });
  });

  it("returns undefined when no links or media are present", () => {
    const messages: MockMessage[] = [createMessage("<p>plain text</p>")];

    expect(buildRightPanelMedia(messages)).toBeUndefined();
  });
});

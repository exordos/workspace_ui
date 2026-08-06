import { describe, expect, it } from "vitest";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { collectWorkspaceMessageMediaGallery } from "./workspace-message-list-media.lib";

type MessageOverrides = Omit<Partial<MessengerMessage>, "payload"> & {
  markdown: string;
};

function createWorkspaceMessage(overrides: MessageOverrides): MessengerMessage {
  const { markdown, ...rest } = overrides;
  return {
    uuid: "message-uuid-1",
    conversationId: "topic:stream-uuid-1:topic-uuid-1",
    projectId: "project-uuid-1",
    streamUuid: "stream-uuid-1",
    topicUuid: "topic-uuid-1",
    authorUuid: "author-uuid-1",
    userUuid: "author-uuid-1",
    payload: { kind: "markdown", content: markdown },
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-07-03T09:00:00.000Z",
    updatedAt: "2026-07-03T09:00:00.000Z",
    ...rest,
  };
}

describe("collectWorkspaceMessageMediaGallery", () => {
  it("collects images and videos in message and document order", () => {
    const imageUuid = "11111111-1111-4111-8111-111111111111";
    const videoUuid = "22222222-2222-4222-8222-222222222222";
    const secondImageUuid = "33333333-3333-4333-8333-333333333333";

    const gallery = collectWorkspaceMessageMediaGallery([
      createWorkspaceMessage({
        uuid: "first-message",
        markdown: [
          `![first.png](urn:image:${imageUuid}?name=first.png&content_type=image%2Fpng)`,
          `[clip.mp4](urn:video:${videoUuid}?name=clip.mp4&content_type=video%2Fmp4)`,
        ].join("\n"),
      }),
      createWorkspaceMessage({
        uuid: "second-message",
        markdown: `![second.png](urn:image:${secondImageUuid}?name=second.png&content_type=image%2Fpng)`,
      }),
    ]);

    expect(
      gallery.items.map(({ messageUuid, file }) => ({
        messageUuid,
        fileUuid: file.fileUuid,
        mediaKind: file.mediaKind,
      })),
    ).toEqual([
      { messageUuid: "first-message", fileUuid: imageUuid, mediaKind: "image" },
      { messageUuid: "first-message", fileUuid: videoUuid, mediaKind: "video" },
      { messageUuid: "second-message", fileUuid: secondImageUuid, mediaKind: "image" },
    ]);
  });

  it("deduplicates by fileUuid and preserves the first media reference", () => {
    const fileUuid = "44444444-4444-4444-8444-444444444444";

    const gallery = collectWorkspaceMessageMediaGallery([
      createWorkspaceMessage({
        uuid: "original-message",
        markdown: `[original.mp4](urn:video:${fileUuid}?name=original.mp4&content_type=video%2Fmp4)`,
      }),
      createWorkspaceMessage({
        uuid: "duplicate-message",
        markdown: `![duplicate.png](urn:image:${fileUuid}?name=duplicate.png&content_type=image%2Fpng)`,
      }),
    ]);

    expect(gallery.items).toHaveLength(1);
    expect(gallery.items[0]).toEqual({
      messageUuid: "original-message",
      file: expect.objectContaining({
        fileUuid,
        name: "original.mp4",
        mediaKind: "video",
      }),
    });
  });

  it("maps the clicked video fileUuid to its mixed gallery index", () => {
    const imageUuid = "55555555-5555-4555-8555-555555555555";
    const videoUuid = "66666666-6666-4666-8666-666666666666";

    const gallery = collectWorkspaceMessageMediaGallery([
      createWorkspaceMessage({
        uuid: "mixed-message",
        markdown: [
          `![first.png](urn:image:${imageUuid}?name=first.png)`,
          `[clip.mp4](urn:video:${videoUuid}?name=clip.mp4)`,
        ].join("\n"),
      }),
    ]);

    expect(gallery.indexByFileUuid.get(videoUuid)).toBe(1);
    expect(gallery.items[gallery.indexByFileUuid.get(videoUuid)!]?.file.fileUuid).toBe(videoUuid);
  });

  it("ignores attachments and URNs rendered as code", () => {
    const attachmentUuid = "77777777-7777-4777-8777-777777777777";
    const fakeVideoUuid = "88888888-8888-4888-8888-888888888888";

    const gallery = collectWorkspaceMessageMediaGallery([
      createWorkspaceMessage({
        uuid: "non-media-message",
        markdown: [
          `[report.pdf](urn:file:${attachmentUuid}?name=report.pdf)`,
          `\`urn:video:${fakeVideoUuid}?name=fake.mp4\``,
        ].join("\n"),
      }),
    ]);

    expect(gallery.items).toEqual([]);
    expect(gallery.indexByFileUuid.size).toBe(0);
  });
});

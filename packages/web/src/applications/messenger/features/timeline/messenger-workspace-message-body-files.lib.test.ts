import { describe, expect, it } from "vitest";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import {
  collectWorkspaceMessageFileReferences,
  selectWorkspaceMessageMediaPreviewReference,
} from "./messenger-workspace-message-body-files.lib";

const IMAGE_A = "11111111-1111-4111-8111-111111111111";
const IMAGE_B = "22222222-2222-4222-8222-222222222222";
const VIDEO_A = "33333333-3333-4333-8333-333333333333";
const VIDEO_B = "44444444-4444-4444-8444-444444444444";
const FILE_A = "55555555-5555-4555-8555-555555555555";

describe("selectWorkspaceMessageMediaPreviewReference", () => {
  it("selects the first image even when a video appears earlier", () => {
    const document = parseWorkspaceMessageBody(
      [
        `[clip.mp4](urn:video:${VIDEO_A}?content_type=video%2Fmp4)`,
        `![first.png](urn:image:${IMAGE_A}?content_type=image%2Fpng)`,
        `![second.png](urn:image:${IMAGE_B}?content_type=image%2Fpng)`,
      ].join("\n\n"),
    );

    expect(collectWorkspaceMessageFileReferences(document).map((file) => file.fileUuid)).toEqual([
      VIDEO_A,
      IMAGE_A,
      IMAGE_B,
    ]);
    expect(selectWorkspaceMessageMediaPreviewReference(document)?.fileUuid).toBe(IMAGE_A);
  });

  it("falls back to the first video when there are no images", () => {
    const document = parseWorkspaceMessageBody(
      [
        `[first.mp4](urn:video:${VIDEO_A}?content_type=video%2Fmp4)`,
        `[second.mp4](urn:video:${VIDEO_B}?content_type=video%2Fmp4)`,
      ].join("\n\n"),
    );

    expect(selectWorkspaceMessageMediaPreviewReference(document)?.fileUuid).toBe(VIDEO_A);
  });

  it("does not expose quoted or spoiler media as the leading preview", () => {
    const document = parseWorkspaceMessageBody(
      [
        `> ![quoted.png](urn:image:${IMAGE_A}?content_type=image%2Fpng)`,
        "",
        "```spoiler Hidden",
        `![hidden.png](urn:image:${IMAGE_B}?content_type=image%2Fpng)`,
        "```",
        "",
        `[visible.mp4](urn:video:${VIDEO_A}?content_type=video%2Fmp4)`,
      ].join("\n"),
    );

    expect(collectWorkspaceMessageFileReferences(document).map((file) => file.fileUuid)).toEqual([
      IMAGE_A,
      IMAGE_B,
      VIDEO_A,
    ]);
    expect(selectWorkspaceMessageMediaPreviewReference(document)?.fileUuid).toBe(VIDEO_A);
  });

  it("ignores ordinary attachments", () => {
    const document = parseWorkspaceMessageBody(
      `[report.pdf](urn:file:${FILE_A}?content_type=application%2Fpdf)`,
    );

    expect(selectWorkspaceMessageMediaPreviewReference(document)).toBeNull();
  });
});

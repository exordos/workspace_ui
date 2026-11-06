import { useCallback, useMemo, useRef } from "react";
import { fn } from "storybook/test";
import type { LoadWorkspaceFilePreview } from "~/entities/messenger/messenger-workspace-message-file-preview.hook";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { WorkspaceMessageList } from "./workspace-message-list.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const SYNTHETIC_IMAGE =
  '<svg xmlns="http://www.w3.org/2000/svg" width="364" height="260"><rect width="364" height="260" fill="#dbeafe"/><circle cx="260" cy="70" r="30" fill="#fbbf24"/><path d="M0 260L120 80L240 260Z" fill="#2563eb"/><path d="M140 260L280 120L364 260Z" fill="#1e40af"/></svg>';

function PreviewRecoveryExample({
  mediaKind,
  recoverOnRetry,
}: Readonly<{
  mediaKind: "image" | "video";
  recoverOnRetry: boolean;
}>) {
  const messages = useMemo<MessengerMessage[]>(() => {
    const fileUuid = "11111111-1111-4111-8111-111111111111";
    const contentType = mediaKind === "video" ? "video/mp4" : "image/svg+xml";
    const name = mediaKind === "video" ? "landscape.mp4" : "landscape.svg";
    return [
      {
        uuid: "preview-recovery-message",
        conversationId: "topic:preview-stream:preview-topic",
        projectId: "preview-project",
        streamUuid: "preview-stream",
        topicUuid: "preview-topic",
        authorUuid: "preview-author",
        userUuid: "preview-author",
        payload: {
          kind: "markdown",
          content: `![${name}](urn:${mediaKind}:${fileUuid}?name=${name}&content_type=${encodeURIComponent(contentType)}&w=364&h=260)`,
        },
        read: true,
        pinned: false,
        starred: false,
        isOwn: false,
        reactions: {},
        reactionUserUuidsByEmojiName: {},
        ownReactionUuidsByEmojiName: {},
        createdAt: "2026-10-28T10:00:00Z",
        updatedAt: "2026-10-28T10:00:00Z",
      },
    ];
  }, [mediaKind]);
  const attempts = useRef(0);
  const loadPreview = useCallback<LoadWorkspaceFilePreview>(() => {
    attempts.current += 1;
    if (!recoverOnRetry || attempts.current === 1) {
      return Promise.reject(new Error("Synthetic preview load failure"));
    }
    return Promise.resolve(new Blob([SYNTHETIC_IMAGE], { type: "image/svg+xml" }));
  }, [recoverOnRetry]);
  const actions = useMemo(
    () => ({
      onLoadWorkspaceFilePreview: loadPreview,
      onDownloadFile: fn(),
      onOpenWorkspaceMedia: fn(),
    }),
    [loadPreview],
  );

  return (
    <div className="flex h-96 w-full max-w-2xl flex-col bg-bg">
      <WorkspaceMessageList
        messages={messages}
        currentUserUuid="preview-viewer"
        conversationId="topic:preview-stream:preview-topic"
        actions={actions}
      />
    </div>
  );
}

const meta = {
  title: "Widgets/WorkspaceMessageList/PreviewRecovery",
  component: PreviewRecoveryExample,
  parameters: { layout: "padded" },
  args: { mediaKind: "image", recoverOnRetry: false },
  render: (args) => (
    <PreviewRecoveryExample key={`${args.mediaKind}:${args.recoverOnRetry}`} {...args} />
  ),
} satisfies Meta<typeof PreviewRecoveryExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const ImageFailure: Story = {};
export const VideoFailure: Story = { args: { mediaKind: "video" } };
export const ImageRetry: Story = { args: { recoverOnRetry: true } };

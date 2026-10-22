import { useState } from "react";
import { useArgs } from "storybook/preview-api";
import { fn } from "storybook/test";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { EncryptedChatServiceMessage } from "~/features/encrypted-chat-message/encrypted-chat-service-message.ui";
import { t } from "~/i18n/i18n";
import { buildWorkspaceForwardUrn } from "~/shared/lib/workspace-reference-urn.lib";
import { Button } from "~/shared/ui/button";
import { WorkspaceMessageList } from "./workspace-message-list.ui";
import { WorkspaceServiceMessageGroup } from "./workspace-service-message-group.ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

const meta = {
  title: "Widgets/WorkspaceMessageList/ServiceMessageGroup",
  component: WorkspaceServiceMessageGroup,
  args: { count: 5, expanded: false, status: null, onToggle: fn(), children: null },
  parameters: { layout: "padded" },
  render: function Render(args) {
    const [{ expanded }, updateArgs] = useArgs<typeof args>();
    return (
      <div className="bg-bg-primary mx-auto w-full max-w-2xl py-3">
        <WorkspaceServiceMessageGroup
          {...args}
          expanded={expanded}
          onToggle={() => updateArgs({ expanded: !expanded })}
        >
          {expanded
            ? Array.from({ length: args.count }, (_, index) => (
                <EncryptedChatServiceMessage
                  key={index}
                  kind={args.status === "action-required" ? "key_request" : "key_announced"}
                  title={t(
                    args.status === "action-required"
                      ? "e2ee.serviceRequestOwnDevice"
                      : "e2ee.serviceAnnounced",
                    { device: "Test laptop" },
                  )}
                  description={args.status === "waiting" ? t("e2ee.serviceWait") : undefined}
                  actions={
                    args.status === "action-required"
                      ? [{ label: t("e2ee.serviceTransferKey"), onClick: fn() }]
                      : undefined
                  }
                />
              ))
            : null}
        </WorkspaceServiceMessageGroup>
      </div>
    );
  },
} satisfies Meta<typeof WorkspaceServiceMessageGroup>;
export default meta;
type Story = StoryObj<typeof meta>;

export const History: Story = {};
export const SingleEvent: Story = { args: { count: 1 } };
export const ActionRequired: Story = { args: { status: "action-required" } };
export const Waiting: Story = { args: { status: "waiting" } };
export const StatusUnavailable: Story = { args: { status: "unavailable" } };
export const Expanded: Story = { args: { expanded: true, status: "action-required" } };

function previewMessage(index: number, payload: MessengerMessage["payload"]): MessengerMessage {
  return {
    uuid: `preview-message-${index}`,
    conversationId: "topic:preview-stream:preview-topic",
    projectId: "preview-project",
    streamUuid: "preview-stream",
    topicUuid: "preview-topic",
    authorUuid: "preview-peer",
    userUuid: "preview-peer",
    payload,
    read: true,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: {},
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: new Date(Date.parse("2026-10-20T09:00:00Z") + index * 60_000).toISOString(),
    updatedAt: "2026-10-20T09:00:00Z",
  };
}

function ConversationPreview() {
  const [completed, setCompleted] = useState(false);
  const messages = [
    previewMessage(0, { kind: "markdown", content: t("chat.generalChat") }),
    previewMessage(1, {
      kind: "key_request",
      keyUuid: "preview-key",
      deviceId: "preview-laptop",
      deviceName: "Test laptop",
      publicKey: "synthetic-public-key",
    }),
    ...Array.from({ length: 4 }, (_, index) =>
      previewMessage(index + 2, { kind: "key_announced", keyUuid: "preview-key" }),
    ),
    previewMessage(6, { kind: "markdown", content: t("e2ee.serviceKeyAvailableHere") }),
  ];
  return (
    <div className="bg-bg-primary flex h-[420px] w-full max-w-2xl flex-col">
      <WorkspaceMessageList
        messages={messages}
        currentUserUuid="preview-manager"
        conversationId="topic:preview-stream:preview-topic"
        resolveAuthorLabel={() => "Alex"}
        actions={{
          getKeyServiceState: () => ({
            deviceId: "preview-manager-device",
            canManageKeys: true,
            hasKey: true,
            requestStatus: completed ? "granted" : "pending",
          }),
          getKeyRequestActions: (message) =>
            message.payload.kind === "key_request" && !completed
              ? [{ label: t("e2ee.serviceTransferKey"), onClick: () => setCompleted(true) }]
              : [],
        }}
      />
    </div>
  );
}

export const Conversation: Story = { render: () => <ConversationPreview /> };

function AutomaticCollapsePreview() {
  const [messages, setMessages] = useState(() => [
    previewMessage(0, { kind: "markdown", content: t("chat.generalChat") }),
  ]);
  const [completed, setCompleted] = useState<ReadonlySet<string>>(new Set());
  const addChain = () =>
    setMessages((previous) => {
      const index = previous.length;
      return [
        ...previous,
        previewMessage(index, {
          kind: "key_request",
          keyUuid: "preview-key",
          deviceId: `preview-device-${index}`,
          deviceName: "Test laptop",
          publicKey: "synthetic-public-key",
        }),
        ...Array.from({ length: 2 }, (_, offset) =>
          previewMessage(index + offset + 1, { kind: "key_announced", keyUuid: "preview-key" }),
        ),
      ];
    });
  const continueConversation = () =>
    setMessages((previous) => [
      ...previous,
      ...Array.from({ length: 12 }, (_, offset) =>
        previewMessage(previous.length + offset, {
          kind: "markdown",
          content: `${t("chat.generalChat")} · ${previous.length + offset}`,
        }),
      ),
    ]);
  return (
    <div className="bg-bg-primary flex h-[480px] w-full max-w-2xl flex-col">
      <div className="flex shrink-0 flex-wrap gap-2 border-b border-border-subtle p-2">
        <Button size="sm" variant="neutral" onClick={addChain}>
          {t("chat.serviceEventsDemoNewChain")}
        </Button>
        <Button size="sm" variant="neutral" onClick={continueConversation}>
          {t("chat.serviceEventsDemoContinue")}
        </Button>
      </div>
      <WorkspaceMessageList
        messages={messages}
        currentUserUuid="preview-manager"
        conversationId="topic:preview-stream:preview-topic"
        resolveAuthorLabel={() => "Alex"}
        actions={{
          getKeyServiceState: (message) => ({
            deviceId: "preview-manager-device",
            canManageKeys: true,
            hasKey: true,
            requestStatus: completed.has(message.uuid) ? "granted" : "pending",
          }),
          getKeyRequestActions: (message) =>
            message.payload.kind === "key_request" && !completed.has(message.uuid)
              ? [
                  {
                    label: t("e2ee.serviceTransferKey"),
                    onClick: () => setCompleted((previous) => new Set([...previous, message.uuid])),
                  },
                ]
              : [],
        }}
      />
    </div>
  );
}

export const AutomaticCollapse: Story = { render: () => <AutomaticCollapsePreview /> };

export const SilentUserReferences: Story = {
  render: () => {
    const userUuid = "11111111-1111-4111-8111-111111111111";
    const content = `[Alex Example](urn:user:${userUuid} "silent") · [Alex Example](urn:user:${userUuid})`;
    const forwardUrn = buildWorkspaceForwardUrn("22222222-2222-4222-8222-222222222222", content, {
      sourceLabel: t("chat.generalChat"),
    });
    return (
      <div className="bg-bg-primary flex h-[420px] w-full max-w-2xl flex-col">
        <WorkspaceMessageList
          messages={[
            previewMessage(0, { kind: "markdown", content }),
            previewMessage(1, { kind: "markdown", content: `[Sam Lee](${forwardUrn})` }),
          ]}
          currentUserUuid="preview-manager"
          conversationId="topic:preview-stream:preview-topic"
          resolveAuthorLabel={() => "Sam Lee"}
          actions={{ onOpenMentionUser: fn(), onOpenMessageInChat: fn() }}
        />
      </div>
    );
  },
};

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageComposerProps } from "~/widgets/message-composer/message-composer.types";
import { ChatPageComposerSection } from "./chat-page-composer-section.ui";
import type { ChatPageComposerSectionProps } from "./chat-page-composer-section.types";

const captured = vi.hoisted(() => ({
  composerProps: null as MessageComposerProps | null,
}));

vi.mock("~/widgets/message-composer/message-composer.ui", () => ({
  MessageComposer: (props: MessageComposerProps) => {
    captured.composerProps = props;
    return <div data-testid="message-composer" />;
  },
}));

const createProps = (
  overrides: Partial<ChatPageComposerSectionProps> = {},
): ChatPageComposerSectionProps => ({
  isDmView: false,
  activeDmUserIds: null,
  activeStream: "General",
  showTopicPrompt: false,
  streamSlug: undefined,
  onExpandStreamTopics: vi.fn(),
  uploadProgress: null,
  onSend: vi.fn(),
  onCreateCallLink: undefined,
  onCancelUpload: vi.fn(),
  activeTopic: null,
  replyQuote: null,
  onClearReply: vi.fn(),
  draftInitialValue: undefined,
  onComposerValueChange: vi.fn(),
  onEditLastMessage: vi.fn(),
  editSession: null,
  onSubmitEdit: vi.fn(),
  onCancelEdit: vi.fn(),
  aiMessagesContext: [],
  aiChatContext: undefined,
  ...overrides,
});

describe("ChatPageComposerSection joined appearance", () => {
  beforeEach(() => {
    captured.composerProps = null;
  });

  it("passes the joined top appearance to the regular composer", () => {
    render(<ChatPageComposerSection {...createProps({ joinedTop: true })} />);

    expect(screen.getByTestId("message-composer")).toBeInTheDocument();
    expect(captured.composerProps?.joinedTop).toBe(true);
  });

  it("passes the joined top appearance to the read-only composer", () => {
    render(
      <ChatPageComposerSection
        {...createProps({ joinedTop: true, readOnlyReason: "Read only" })}
      />,
    );

    expect(captured.composerProps?.joinedTop).toBe(true);
    expect(captured.composerProps?.disabled).toBe(true);
  });

  it("keeps the topic prompt instead of rendering a composer", () => {
    render(
      <ChatPageComposerSection {...createProps({ joinedTop: true, showTopicPrompt: true })} />,
    );

    expect(screen.getByRole("button", { name: /select a topic/i })).toBeInTheDocument();
    expect(screen.queryByTestId("message-composer")).not.toBeInTheDocument();
  });
});

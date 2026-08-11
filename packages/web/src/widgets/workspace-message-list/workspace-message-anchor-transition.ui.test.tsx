// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import { setLocale, t } from "~/i18n/i18n";
import { createUser } from "~/test/factories";
import { WorkspaceMessageAnchorTransition } from "./workspace-message-anchor-transition.ui";
import { WorkspaceMessageBubble } from "./workspace-message-bubble.ui";
import { createWorkspaceMessageListServerItem } from "./workspace-message-list-grouping.lib";

const MESSAGE_UUID = "11111111-1111-4111-8111-111111111111";

function createMessage(markdown = "Immediate preview body"): MessengerMessage {
  return {
    uuid: MESSAGE_UUID,
    conversationId:
      "topic:22222222-2222-4222-8222-222222222222:33333333-3333-4333-8333-333333333333",
    projectId: "project-a",
    streamUuid: "22222222-2222-4222-8222-222222222222",
    topicUuid: "33333333-3333-4333-8333-333333333333",
    authorUuid: "44444444-4444-4444-8444-444444444444",
    userUuid: "44444444-4444-4444-8444-444444444444",
    payload: { kind: "markdown", content: markdown },
    read: false,
    pinned: false,
    starred: false,
    isOwn: false,
    reactions: { smile: 1 },
    reactionUserUuidsByEmojiName: {},
    ownReactionUuidsByEmojiName: {},
    createdAt: "2026-08-10T10:00:00.000Z",
    updatedAt: "2026-08-10T10:00:00.000Z",
  };
}

function setReducedMotion(matches: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
}

describe("WorkspaceMessageAnchorTransition", () => {
  beforeEach(() => {
    setLocale("en");
    setReducedMotion(false);
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("orders delayed symmetric context skeletons around the preview", () => {
    const { container, rerender } = render(
      <WorkspaceMessageAnchorTransition
        presentation={{
          intentId: 1,
          messageUuid: MESSAGE_UUID,
          phase: "staged",
          previewMessage: null,
        }}
        currentUserUuid="current-user"
        usersById={{}}
        onRetry={vi.fn()}
      />,
    );

    const transition = container.querySelector("[data-message-anchor-transition='true']");
    expect(transition).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent(t("chat.loadingMessageContext"));
    expect(container.querySelectorAll("[data-message-bubble-skeleton='true']")).toHaveLength(0);
    expect(container.querySelector("[data-message-preview-placeholder='true']")).not.toBeNull();
    expect(
      Array.from(transition?.children ?? [])
        .slice(1, 4)
        .map(
          (node) =>
            node.getAttribute("data-skeleton-area") ??
            node.getAttribute("data-message-preview-uuid"),
        ),
    ).toEqual(["top", MESSAGE_UUID, "bottom"]);

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(container.querySelector("[data-skeleton-area='top']")?.children).toHaveLength(2);
    expect(container.querySelector("[data-skeleton-area='bottom']")?.children).toHaveLength(2);
    expect(container.querySelectorAll("[data-message-bubble-skeleton='true']")).toHaveLength(5);

    rerender(
      <WorkspaceMessageAnchorTransition
        presentation={{
          intentId: 2,
          messageUuid: MESSAGE_UUID,
          phase: "staged",
          previewMessage: createMessage(),
        }}
        currentUserUuid="current-user"
        usersById={{}}
        onRetry={vi.fn()}
      />,
    );
    expect(container.querySelector("[data-skeleton-area='top']")?.children).toHaveLength(0);
  });

  it("stacks the failed alert above the explicit tail control", () => {
    const { container } = render(
      <WorkspaceMessageAnchorTransition
        presentation={{
          intentId: 3,
          messageUuid: MESSAGE_UUID,
          phase: "failed",
          previewMessage: createMessage(),
        }}
        currentUserUuid="current-user"
        usersById={{}}
        errorDetail="Unavailable"
        onRetry={vi.fn()}
        onTailNavigationRequested={vi.fn()}
      />,
    );

    const alert = screen.getByRole("alert");
    const actions = container.querySelector("[data-message-anchor-failed-actions='true']");
    const bottomButton = screen.getByRole("button", { name: t("a11y.scrollToBottom") });
    expect(actions).toContainElement(alert);
    expect(actions).toContainElement(bottomButton);
    expect(alert).not.toHaveClass("absolute");
    expect(screen.getByRole("button", { name: t("chat.retryMessageNavigation") })).toBeVisible();
    expect(bottomButton).toBeVisible();
    expect(container.querySelectorAll("[role='alert']")).toHaveLength(1);
  });

  it("resets the skeleton delay for a superseding intent", () => {
    const { container, rerender } = render(
      <WorkspaceMessageAnchorTransition
        presentation={{
          intentId: 1,
          messageUuid: MESSAGE_UUID,
          phase: "staged",
          previewMessage: null,
        }}
        currentUserUuid="current-user"
        usersById={{}}
        onRetry={vi.fn()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(99);
    });
    rerender(
      <WorkspaceMessageAnchorTransition
        presentation={{
          intentId: 2,
          messageUuid: "55555555-5555-4555-8555-555555555555",
          phase: "staged",
          previewMessage: null,
        }}
        currentUserUuid="current-user"
        usersById={{}}
        onRetry={vi.fn()}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelectorAll("[data-message-bubble-skeleton='true']")).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(98);
    });
    expect(container.querySelectorAll("[data-message-bubble-skeleton='true']")).toHaveLength(0);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelectorAll("[data-message-bubble-skeleton='true']")).toHaveLength(5);
  });

  it("renders an accessible read-only preview without canonical list markers", () => {
    const { container } = render(
      <WorkspaceMessageAnchorTransition
        presentation={{
          intentId: 1,
          messageUuid: MESSAGE_UUID,
          phase: "loading-window",
          previewMessage: createMessage("Text with `code` and https://example.com"),
        }}
        currentUserUuid="current-user"
        usersById={{}}
        resolveAuthorLabel={() => "Alice"}
        onRetry={vi.fn()}
      />,
    );

    const article = screen.getByRole("article");
    expect(article).toHaveTextContent("Alice");
    expect(screen.getByText(/Text with/)).toBeInTheDocument();
    expect(document.getElementById(`message-${MESSAGE_UUID}`)).toBeNull();
    expect(container.querySelector("[data-message-uuid]")).toBeNull();
    expect(container.querySelector("[data-message-read-boundary]")).toBeNull();
    expect(container.querySelector("[data-code-copy-button]")).toBeNull();
    expect(container.querySelector("[data-workspace-message-bubble]")).not.toHaveAttribute("inert");
    expect(container.querySelectorAll("button:not(:disabled)")).toHaveLength(0);
    expect(container.querySelector("[data-workspace-message-reaction-chip]")).toBeDisabled();
  });

  it("reveals preview spoilers without interactive semantics or Workspace actions", () => {
    const actions = {
      onOpenMessageInChat: vi.fn(),
      onOpenWorkspaceReference: vi.fn(),
      onOpenMentionUser: vi.fn(),
      onDownloadFile: vi.fn(),
      onLoadWorkspaceFilePreview: vi.fn(),
      onOpenWorkspaceMedia: vi.fn(),
      onToggleMessageReaction: vi.fn(),
    };
    const message = createMessage(
      ["Before ||inline secret|| after", "", "```spoiler Hidden", "block secret", "```"].join("\n"),
    );
    const { container } = render(
      <WorkspaceMessageBubble
        message={createWorkspaceMessageListServerItem(message)}
        currentUserUuid="current-user"
        usersById={{}}
        isFirstInGroup
        isLastInGroup
        presentationMode="preview"
        actions={actions}
      />,
    );

    const inlineSpoiler = container.querySelector<HTMLElement>(".inline-spoiler");
    const spoilerBlock = container.querySelector<HTMLElement>(".spoiler-block");
    const spoilerHeader = container.querySelector<HTMLElement>(".spoiler-header");
    expect(inlineSpoiler).toHaveClass("open");
    expect(inlineSpoiler).toHaveTextContent("inline secret");
    expect(spoilerBlock).toHaveClass("open");
    expect(spoilerBlock).toHaveTextContent("block secret");
    expect(spoilerHeader).not.toHaveAttribute("role");
    expect(spoilerHeader).not.toHaveAttribute("tabindex");

    fireEvent.click(inlineSpoiler as HTMLElement);
    fireEvent.click(spoilerHeader as HTMLElement);
    fireEvent.keyDown(spoilerHeader as HTMLElement, { key: "Enter" });
    fireEvent.keyDown(spoilerHeader as HTMLElement, { key: " " });
    expect(inlineSpoiler).toHaveClass("open");
    expect(spoilerBlock).toHaveClass("open");
    for (const callback of Object.values(actions)) {
      expect(callback).not.toHaveBeenCalled();
    }
  });

  it("aligns peer and own previews to their message owner", () => {
    const { container, rerender } = render(
      <WorkspaceMessageAnchorTransition
        presentation={{
          intentId: 1,
          messageUuid: MESSAGE_UUID,
          phase: "loading-window",
          previewMessage: createMessage(),
        }}
        currentUserUuid="current-user"
        usersById={{}}
        onRetry={vi.fn()}
      />,
    );
    expect(container.querySelector("[data-preview-alignment]")).toHaveAttribute(
      "data-preview-alignment",
      "peer",
    );

    rerender(
      <WorkspaceMessageAnchorTransition
        presentation={{
          intentId: 1,
          messageUuid: MESSAGE_UUID,
          phase: "loading-window",
          previewMessage: createMessage(),
        }}
        currentUserUuid="44444444-4444-4444-8444-444444444444"
        usersById={{}}
        onRetry={vi.fn()}
      />,
    );
    expect(container.querySelector("[data-preview-alignment]")).toHaveAttribute(
      "data-preview-alignment",
      "own",
    );
  });

  it("reserves the canonical peer avatar slot in preview without adding it to own messages", () => {
    const author = createUser({
      uuid: "44444444-4444-4444-8444-444444444444",
      full_name: "Alice Stone",
      avatar_url: "urn:url:https://cdn.example/preview-avatar.png",
    });
    const { container, rerender } = render(
      <WorkspaceMessageAnchorTransition
        presentation={{
          intentId: 1,
          messageUuid: MESSAGE_UUID,
          phase: "loading-window",
          previewMessage: createMessage(),
        }}
        currentUserUuid="current-user"
        usersById={{ [author.uuid]: author }}
        onRetry={vi.fn()}
      />,
    );

    const peerAvatar = container.querySelector<HTMLElement>("[data-workspace-peer-avatar='true']");
    expect(peerAvatar).toBeInTheDocument();
    expect(peerAvatar).toHaveClass("w-12", "flex-shrink-0", "justify-end", "pb-2");
    expect(peerAvatar?.nextElementSibling).toHaveClass(
      "min-w-0",
      "flex-1",
      "flex-col",
      "items-start",
    );
    expect(peerAvatar?.querySelector("img")).toHaveAttribute(
      "src",
      "https://cdn.example/preview-avatar.png",
    );

    rerender(
      <WorkspaceMessageAnchorTransition
        presentation={{
          intentId: 2,
          messageUuid: MESSAGE_UUID,
          phase: "loading-window",
          previewMessage: createMessage(),
        }}
        currentUserUuid={author.uuid}
        usersById={{ [author.uuid]: author }}
        onRetry={vi.fn()}
      />,
    );

    expect(container.querySelector("[data-workspace-peer-avatar='true']")).toBeNull();
  });

  it("removes animation classes when reduced motion is requested", () => {
    setReducedMotion(true);
    const { container } = render(
      <WorkspaceMessageAnchorTransition
        presentation={{
          intentId: 1,
          messageUuid: MESSAGE_UUID,
          phase: "staged",
          previewMessage: null,
        }}
        currentUserUuid="current-user"
        usersById={{}}
        onRetry={vi.fn()}
      />,
    );
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    expect(container.querySelectorAll("[data-message-bubble-skeleton='true']")).toHaveLength(5);
  });

  it("keeps a known body beside a retryable failure and never leaks it to an unknown target", () => {
    const onRetry = vi.fn();
    const { rerender } = render(
      <div className="flex h-32" data-testid="small-transition-host">
        <WorkspaceMessageAnchorTransition
          presentation={{
            intentId: 1,
            messageUuid: MESSAGE_UUID,
            phase: "failed",
            previewMessage: createMessage(
              `Immediate preview body\n\n${"Long preview context ".repeat(80)}`,
            ),
          }}
          currentUserUuid="current-user"
          usersById={{}}
          errorDetail="Offline"
          onRetry={onRetry}
        />
      </div>,
    );

    expect(screen.getByText("Immediate preview body")).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Offline");
    expect(alert).toHaveAttribute("data-message-anchor-error-overlay", "true");
    expect(alert.closest("[data-message-anchor-transition='true']")).not.toBeNull();
    screen.getByRole("button", { name: t("chat.retryMessageNavigation") }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);

    rerender(
      <div className="flex h-32" data-testid="small-transition-host">
        <WorkspaceMessageAnchorTransition
          presentation={{
            intentId: 2,
            messageUuid: "55555555-5555-4555-8555-555555555555",
            phase: "failed",
            previewMessage: null,
          }}
          currentUserUuid="current-user"
          usersById={{}}
          errorDetail="Missing"
          onRetry={onRetry}
        />
      </div>,
    );
    expect(screen.queryByText("Immediate preview body")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Missing");
  });
});

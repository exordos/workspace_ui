import { parseWorkspaceMessageBody } from "./workspace-message-render/workspace-message-parse.lib";
import type {
  WorkspaceMessengerStreamNotificationMode,
  WorkspaceMessengerTopicNotificationMode,
} from "../api/messenger.types";
import type {
  WorkspaceMessageBlock,
  WorkspaceMessageInline,
  WorkspaceMessageMentionResolver,
} from "./workspace-message-render/workspace-message-document.types";

export type WorkspaceNotificationMessageTrigger =
  | "dm"
  | "wildcard_mention"
  | "mention"
  | "followed_topic"
  | "stream";

export interface WorkspaceDesktopNotificationMessageContext {
  kind: "dm" | "stream";
  markdown?: string;
  isOwn: boolean;
  read: boolean;
  isMuted?: boolean;
  currentUserUuid?: string | null;
  resolveMention?: WorkspaceMessageMentionResolver;
  hasCurrentUserMention?: boolean;
  hasWildcardMention?: boolean;
  streamNotificationMode?: WorkspaceMessengerStreamNotificationMode | null;
  topicNotificationMode?: WorkspaceMessengerTopicNotificationMode | null;
}

export interface WorkspaceDesktopNotificationViewportContext {
  windowFocused: boolean;
  isMessageOnScreen: boolean;
}

export interface ShouldWorkspaceDesktopNotifyInput {
  message: WorkspaceDesktopNotificationMessageContext;
  viewport: WorkspaceDesktopNotificationViewportContext;
}

export interface ShouldWorkspaceDesktopNotifyResult {
  notify: boolean;
  trigger: WorkspaceNotificationMessageTrigger;
}

const WORKSPACE_WILDCARD_MENTION_PATTERN = /(^|[\s([{"'.,!?;:])@(all|everyone|channel)\b/iu;

function normalizeOptionalUuid(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized == null || normalized.length === 0 ? null : normalized;
}

function normalizeOptionalMarkdown(markdown: string | null | undefined): string | null {
  return typeof markdown === "string" ? markdown : null;
}

function hasMentionForCurrentUserInInlines(
  children: readonly WorkspaceMessageInline[],
  currentUserUuid: string,
): boolean {
  for (const child of children) {
    switch (child.kind) {
      case "mention":
        if (child.userUuid?.trim() === currentUserUuid) {
          return true;
        }
        break;
      case "emphasis":
      case "strong":
      case "spoiler":
      case "link":
        if (hasMentionForCurrentUserInInlines(child.children, currentUserUuid)) {
          return true;
        }
        break;
      default:
        break;
    }
  }

  return false;
}

function hasMentionForCurrentUserInBlocks(
  blocks: readonly WorkspaceMessageBlock[],
  currentUserUuid: string,
): boolean {
  for (const block of blocks) {
    switch (block.kind) {
      case "paragraph":
        if (hasMentionForCurrentUserInInlines(block.children, currentUserUuid)) {
          return true;
        }
        break;
      case "quote":
      case "spoiler":
        if (hasMentionForCurrentUserInBlocks(block.blocks, currentUserUuid)) {
          return true;
        }
        break;
      case "list":
        if (
          block.items.some((item) => hasMentionForCurrentUserInBlocks(item.blocks, currentUserUuid))
        ) {
          return true;
        }
        break;
      default:
        break;
    }
  }

  return false;
}

export function hasWorkspaceMentionForCurrentUser(
  message: WorkspaceDesktopNotificationMessageContext,
): boolean {
  const currentUserUuid = normalizeOptionalUuid(message.currentUserUuid);
  if (currentUserUuid == null) {
    // Без UUID текущего пользователя не угадываем mention по display name:
    // иначе можно показать ложное уведомление не тому человеку.
    return false;
  }

  const markdown = normalizeOptionalMarkdown(message.markdown);
  if (markdown == null) {
    return false;
  }

  const document = parseWorkspaceMessageBody(markdown, {
    resolveMention: message.resolveMention,
  });
  return hasMentionForCurrentUserInBlocks(document.blocks, currentUserUuid);
}

export function hasWorkspaceWildcardMention(markdown: string | null | undefined): boolean {
  const normalizedMarkdown = normalizeOptionalMarkdown(markdown);
  if (normalizedMarkdown == null) {
    return false;
  }

  return WORKSPACE_WILDCARD_MENTION_PATTERN.test(normalizedMarkdown);
}

function resolveWorkspaceMentionSignals(message: WorkspaceDesktopNotificationMessageContext): {
  hasCurrentUserMention: boolean;
  hasWildcardMention: boolean;
} {
  // Если projection уже посчитал признаки, policy не должен заново разбирать markdown.
  const hasCurrentUserMention =
    message.hasCurrentUserMention ?? hasWorkspaceMentionForCurrentUser(message);
  const hasWildcardMention =
    message.hasWildcardMention ?? hasWorkspaceWildcardMention(message.markdown);

  return {
    hasCurrentUserMention,
    hasWildcardMention,
  };
}

export function isWorkspaceDesktopNotificationMuted(
  message: WorkspaceDesktopNotificationMessageContext,
): boolean {
  if (message.isMuted === true) {
    return true;
  }
  if (message.streamNotificationMode === "muted") {
    return true;
  }
  return message.topicNotificationMode === "mute";
}

export function isWorkspaceDesktopNotificationEnabledForTrigger(
  trigger: WorkspaceNotificationMessageTrigger,
  message: WorkspaceDesktopNotificationMessageContext,
): boolean {
  switch (trigger) {
    case "dm":
    case "mention":
    case "wildcard_mention":
      return true;
    case "followed_topic":
      return message.topicNotificationMode === "follow";
    case "stream":
      return (
        message.streamNotificationMode === "all_messages" ||
        message.topicNotificationMode === "unmute"
      );
    default:
      return false;
  }
}

export function classifyWorkspaceNotificationTrigger(
  message: WorkspaceDesktopNotificationMessageContext,
): WorkspaceNotificationMessageTrigger {
  if (message.kind === "dm") {
    return "dm";
  }

  const mentionSignals = resolveWorkspaceMentionSignals(message);

  if (mentionSignals.hasWildcardMention) {
    return "wildcard_mention";
  }

  if (mentionSignals.hasCurrentUserMention) {
    return "mention";
  }

  if (message.topicNotificationMode === "follow") {
    return "followed_topic";
  }

  return "stream";
}

export function shouldWorkspaceDesktopNotify(
  input: ShouldWorkspaceDesktopNotifyInput,
): ShouldWorkspaceDesktopNotifyResult {
  const trigger = classifyWorkspaceNotificationTrigger(input.message);
  const blocked =
    input.message.isOwn ||
    input.message.read ||
    isWorkspaceDesktopNotificationMuted(input.message) ||
    (input.viewport.windowFocused && input.viewport.isMessageOnScreen) ||
    !isWorkspaceDesktopNotificationEnabledForTrigger(trigger, input.message);

  return {
    notify: !blocked,
    trigger,
  };
}

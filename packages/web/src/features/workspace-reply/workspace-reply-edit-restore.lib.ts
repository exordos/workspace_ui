import {
  selectWorkspaceMessageById,
  useWorkspaceMessageStore,
} from "~/entities/message/message.model";
import {
  loadMessengerQuoteMessage,
  type LoadMessengerQuoteMessageOptions,
  type MessengerQuoteMessageLoadResult,
} from "~/entities/messenger/messenger-quote-loader.lib";
import type { MessengerMessage, MessengerUuid } from "~/entities/messenger/messenger.types";
import { selectUserDisplayName } from "~/entities/user/user-selectors.lib";
import { useUsersStore } from "~/entities/user/user.model";
import { useWorkspaceAuthStore } from "~/entities/workspace-auth/workspace-auth.model";
import {
  captureWorkspaceRuntimeRequestContext,
  isWorkspaceRuntimeRequestInvalidated,
} from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContextGetter } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import {
  restoreWorkspaceReplySessionFromMarkdown,
  type RestoredWorkspaceReplySession,
} from "./workspace-reply-restore.lib";
import type { WorkspaceReplyTabIdentity } from "./workspace-reply.types";

interface WorkspaceReplyEditRestoreAuthor {
  senderUuid: string;
  senderName: string;
}

export interface WorkspaceReplyEditRestoreDependencies {
  getMessage: (messageUuid: MessengerUuid) => MessengerMessage | null;
  loadMessage: (
    options: LoadMessengerQuoteMessageOptions,
  ) => Promise<MessengerQuoteMessageLoadResult>;
  resolveAuthor: (message: MessengerMessage) => WorkspaceReplyEditRestoreAuthor | null;
  getRuntimeContext: WorkspaceRuntimeContextGetter;
}

export interface WorkspaceReplyEditRestoreOptions {
  markdown: string;
  runtimeContext: WorkspaceRuntimeContext | null;
  createIdentity: (index: number) => WorkspaceReplyTabIdentity;
}

export type WorkspaceReplyEditRestoreResult =
  | {
      status: "ready";
      restored: RestoredWorkspaceReplySession | null;
    }
  | {
      status: "stale";
    };

export interface WorkspaceReplyEditRestoreController {
  restore: (options: WorkspaceReplyEditRestoreOptions) => Promise<WorkspaceReplyEditRestoreResult>;
  cancel: () => void;
}

function collectStructuralQuoteMessageUuids(markdown: string): MessengerUuid[] {
  return [
    ...new Set(
      parseWorkspaceMessageBody(markdown).blocks.flatMap((block) =>
        block.kind === "quote-reference" ? [block.reference.messageUuid] : [],
      ),
    ),
  ];
}

function defaultDependencies(): WorkspaceReplyEditRestoreDependencies {
  return {
    getMessage: (messageUuid) =>
      selectWorkspaceMessageById(useWorkspaceMessageStore.getState(), messageUuid) ?? null,
    loadMessage: loadMessengerQuoteMessage,
    resolveAuthor: (message) => {
      const author = useUsersStore.getState().usersById[message.authorUuid];
      if (author == null) return null;
      const senderName = selectUserDisplayName(author, "").trim();
      return senderName.length === 0
        ? null
        : {
            senderUuid: message.authorUuid,
            senderName,
          };
    },
    getRuntimeContext: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
  };
}

export function createWorkspaceReplyEditRestoreController(
  dependencies: WorkspaceReplyEditRestoreDependencies = defaultDependencies(),
): WorkspaceReplyEditRestoreController {
  let activeController: AbortController | null = null;
  let activeSequence = 0;

  const cancel = () => {
    activeSequence += 1;
    activeController?.abort();
    activeController = null;
  };

  const restore = async ({
    markdown,
    runtimeContext,
    createIdentity,
  }: WorkspaceReplyEditRestoreOptions): Promise<WorkspaceReplyEditRestoreResult> => {
    cancel();
    const sequence = activeSequence;
    const controller = new AbortController();
    activeController = controller;
    const requestContext =
      runtimeContext == null ? null : captureWorkspaceRuntimeRequestContext(() => runtimeContext);
    const isStale = () =>
      sequence !== activeSequence ||
      controller.signal.aborted ||
      (runtimeContext != null &&
        isWorkspaceRuntimeRequestInvalidated(
          requestContext,
          dependencies.getRuntimeContext,
          controller.signal,
        ));

    try {
      const quoteMessageUuids = collectStructuralQuoteMessageUuids(markdown);
      if (quoteMessageUuids.length === 0) {
        return {
          status: "ready",
          restored: restoreWorkspaceReplySessionFromMarkdown(markdown, createIdentity),
        };
      }
      if (runtimeContext == null) {
        return { status: "ready", restored: null };
      }

      const resolvedMessagesByUuid = new Map<MessengerUuid, MessengerMessage>();
      for (const messageUuid of quoteMessageUuids) {
        const storedMessage = dependencies.getMessage(messageUuid);
        if (storedMessage != null) {
          resolvedMessagesByUuid.set(messageUuid, storedMessage);
          continue;
        }

        const result = await dependencies.loadMessage({
          runtimeContext,
          getRuntimeContext: dependencies.getRuntimeContext,
          messageUuid,
          signal: controller.signal,
        });
        if (isStale() || result.status === "stale") {
          return { status: "stale" };
        }
        if (result.status === "unavailable") {
          return { status: "ready", restored: null };
        }
        resolvedMessagesByUuid.set(messageUuid, result.message);
      }

      if (isStale()) {
        return { status: "stale" };
      }
      const restored = restoreWorkspaceReplySessionFromMarkdown(
        markdown,
        createIdentity,
        (messageUuid) => {
          const message = resolvedMessagesByUuid.get(messageUuid);
          if (message == null) return null;
          const author = dependencies.resolveAuthor(message);
          if (author == null) return null;
          return {
            ...author,
            quotedContent: message.payload.content,
          };
        },
      );
      return isStale() ? { status: "stale" } : { status: "ready", restored };
    } catch {
      return isStale() ? { status: "stale" } : { status: "ready", restored: null };
    } finally {
      if (sequence === activeSequence) {
        activeController = null;
      }
    }
  };

  return { restore, cancel };
}

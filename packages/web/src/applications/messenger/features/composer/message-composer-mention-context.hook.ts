import { useMemo } from "react";
import { readActiveChats } from "~/applications/messenger/model/chats/chats";
import { readActiveMessageIndex } from "~/applications/messenger/model/messages/messages-consumers";
/**
 * Snapshots the mention ranking context when the "@" dropdown opens.
 *
 * A snapshot instead of a live subscription: the composer must not re-render on
 * every incoming message, and the order only has to be right when the list appears.
 */

import { loadMentionFrecency } from "~/features/mention-suggest/mention-frecency.lib";
import type { MentionRankingContext } from "~/features/mention-suggest/mention-suggest.types";
import { buildWorkspaceMentionContext } from "./message-composer-mention-context.lib";
import type { ComposerMentionContextInput } from "./message-composer.types";

export function useComposerMentionContext(
  input: ComposerMentionContextInput | undefined,
  active: boolean,
): MentionRankingContext | undefined {
  const hasInput = input != null;
  const streamUuid = input?.streamUuid ?? null;
  const conversationId = input?.conversationId ?? null;
  const selfUserUuid = input?.selfUserUuid ?? null;

  return useMemo(() => {
    if (!active || !hasInput) return undefined;

    return buildWorkspaceMentionContext({
      streamUuid,
      conversationId,
      selfUserUuid,
      messenger: readActiveChats(),
      messages: readActiveMessageIndex(),
      frecencyByUserUuid: loadMentionFrecency(),
    });
  }, [active, hasInput, streamUuid, conversationId, selfUserUuid]);
}

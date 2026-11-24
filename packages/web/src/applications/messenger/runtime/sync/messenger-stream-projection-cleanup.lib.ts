import { removeWorkspaceComposerDraftsForStream } from "~/applications/messenger/model/drafts/composer-draft.model";
import { getWorkspaceMessageStoreForOwner } from "~/applications/messenger/model/messages/message.model";
import {
  deleteMessengerSearchResultsForOwner,
  deleteWorkspaceComposerDraftRecordsForStream,
} from "~/shared/lib/workspace-messenger-cache-db";
import {
  getMessengerStoreForOwner,
  isMessengerStreamRemoved,
  markMessengerStreamRemoved,
} from "../../model/chats/messenger.model";
import {
  deleteMessengerStreamCache,
  markMessengerStreamCacheRemoved,
} from "../../model/messenger-cache.lib";
import { useMessengerBackgroundProjectionStore } from "./messenger-background-projection.model";
import type { MessengerUuid } from "../../model/messenger.types";

// Removes a deleted stream from this owner's memory and durable projection.
interface RemoveMessengerStreamProjectionOptions {
  ownerKey: string;
  streamUuid: MessengerUuid;
  isOwnerCurrent?: () => boolean;
  deleteCachedStream?: (
    ownerKey: string,
    streamUuid: MessengerUuid,
    isCurrent?: () => boolean,
  ) => Promise<void> | void;
}

export async function removeMessengerStreamProjection({
  ownerKey,
  streamUuid,
  isOwnerCurrent = () => true,
  deleteCachedStream,
}: RemoveMessengerStreamProjectionOptions): Promise<void> {
  if (!isOwnerCurrent()) return;

  markMessengerStreamRemoved(ownerKey, streamUuid);
  markMessengerStreamCacheRemoved(ownerKey, streamUuid);
  useMessengerBackgroundProjectionStore.getState().removeStreamProjection(ownerKey, streamUuid);
  const isRemovalCurrent = () => isOwnerCurrent() && isMessengerStreamRemoved(ownerKey, streamUuid);
  let cacheDeletion: Promise<void>;
  try {
    cacheDeletion = Promise.resolve(
      deleteCachedStream == null
        ? deleteMessengerStreamCache(ownerKey, streamUuid, isRemovalCurrent)
        : deleteCachedStream(ownerKey, streamUuid, isRemovalCurrent),
    ).catch(() => undefined);
  } catch {
    cacheDeletion = Promise.resolve();
  }

  const draftCleanup = removeWorkspaceComposerDraftsForStream(ownerKey, streamUuid);

  const catalog = getMessengerStoreForOwner(ownerKey);
  if (catalog?.getState().ownerKey === ownerKey) {
    catalog.getState().removeStream(ownerKey, { uuid: streamUuid });
    getWorkspaceMessageStoreForOwner(ownerKey)?.getState().removeMessagesForStream(streamUuid);
  }

  await draftCleanup;
  if (!isRemovalCurrent()) return;
  await Promise.all([
    cacheDeletion,
    deleteWorkspaceComposerDraftRecordsForStream(ownerKey, streamUuid, isRemovalCurrent),
    deleteMessengerSearchResultsForOwner(ownerKey, isRemovalCurrent),
  ]);
}

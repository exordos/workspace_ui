import { removeWorkspaceComposerDraftsForStream } from "~/entities/composer-draft/composer-draft.model";
import { useWorkspaceMessageStore } from "~/entities/message/message.model";
import {
  deleteMessengerSearchResultsForOwner,
  deleteWorkspaceComposerDraftRecordsForStream,
} from "~/shared/lib/workspace-messenger-cache-db";
import { useMessengerBackgroundProjectionStore } from "./messenger-background-projection.model";
import { deleteMessengerStreamCache, markMessengerStreamCacheRemoved } from "./messenger-cache.lib";
import { markMessengerStreamRemoved, useMessengerStore } from "./messenger.model";
import type { MessengerUuid } from "./messenger.types";

export interface RemoveMessengerStreamProjectionOptions {
  ownerKey: string;
  streamUuid: MessengerUuid;
  removeActiveProjection: boolean;
  isOwnerCurrent?: () => boolean;
  deleteCachedStream?: (ownerKey: string, streamUuid: MessengerUuid) => Promise<void> | void;
  clearOwnerSearchCache?: boolean;
}

export async function removeMessengerStreamProjection({
  ownerKey,
  streamUuid,
  removeActiveProjection,
  isOwnerCurrent = () => true,
  deleteCachedStream = deleteMessengerStreamCache,
  clearOwnerSearchCache = true,
}: RemoveMessengerStreamProjectionOptions): Promise<void> {
  if (!isOwnerCurrent()) return;

  markMessengerStreamRemoved(ownerKey, streamUuid);
  markMessengerStreamCacheRemoved(ownerKey, streamUuid);
  useMessengerBackgroundProjectionStore.getState().removeStreamProjection(ownerKey, streamUuid);
  let cacheDeletion: Promise<void>;
  try {
    cacheDeletion = Promise.resolve(deleteCachedStream(ownerKey, streamUuid)).catch(
      () => undefined,
    );
  } catch {
    cacheDeletion = Promise.resolve();
  }

  const draftCleanup = removeWorkspaceComposerDraftsForStream(ownerKey, streamUuid);

  if (removeActiveProjection && useMessengerStore.getState().ownerKey === ownerKey) {
    useMessengerStore.getState().removeStream(ownerKey, { uuid: streamUuid });
    useWorkspaceMessageStore.getState().removeMessagesForStream(streamUuid);
  }

  await draftCleanup;
  await Promise.all([
    cacheDeletion,
    deleteWorkspaceComposerDraftRecordsForStream(ownerKey, streamUuid),
    clearOwnerSearchCache ? deleteMessengerSearchResultsForOwner(ownerKey) : Promise.resolve(),
  ]);
}

export async function removeMessengerStreamProjections(
  options: Omit<RemoveMessengerStreamProjectionOptions, "streamUuid" | "clearOwnerSearchCache"> & {
    streamUuids: readonly MessengerUuid[];
  },
): Promise<void> {
  if (!(options.isOwnerCurrent?.() ?? true)) return;
  const streamUuids = [...new Set(options.streamUuids)];
  await Promise.all(
    streamUuids.map((streamUuid) =>
      removeMessengerStreamProjection({
        ...options,
        streamUuid,
        clearOwnerSearchCache: false,
      }),
    ),
  );
  if (streamUuids.length > 0) {
    await deleteMessengerSearchResultsForOwner(options.ownerKey);
  }
}

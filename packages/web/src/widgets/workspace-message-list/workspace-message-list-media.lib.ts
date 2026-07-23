import { collectWorkspaceMessageFileReferences } from "~/entities/messenger/messenger-workspace-message-body-files.lib";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import type {
  WorkspaceMessageFileReference,
  WorkspaceMessageMentionResolver,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import type { WorkspaceMessageMediaGalleryItem } from "./workspace-message-list.types";

export interface WorkspaceMessageMediaGallery {
  items: readonly WorkspaceMessageMediaGalleryItem[];
  indexByFileUuid: ReadonlyMap<string, number>;
}

const EMPTY_WORKSPACE_MESSAGE_MEDIA_GALLERY: WorkspaceMessageMediaGallery = {
  items: [],
  indexByFileUuid: new Map<string, number>(),
};

function isWorkspaceMediaFileReference(
  reference: WorkspaceMessageFileReference,
): reference is WorkspaceMessageFileReference & {
  kind: "media";
  mediaKind: "image" | "video";
} {
  return (
    reference.kind === "media" &&
    (reference.mediaKind === "image" || reference.mediaKind === "video") &&
    reference.fileUuid.trim().length > 0
  );
}

export function collectWorkspaceMessageMediaGallery(
  messages: readonly MessengerMessage[],
  options: { resolveMention?: WorkspaceMessageMentionResolver } = {},
): WorkspaceMessageMediaGallery {
  if (messages.length === 0) {
    return EMPTY_WORKSPACE_MESSAGE_MEDIA_GALLERY;
  }

  const items: WorkspaceMessageMediaGalleryItem[] = [];
  const indexByFileUuid = new Map<string, number>();

  for (const message of messages) {
    const document = parseWorkspaceMessageBody(message.payload.content, {
      resolveMention: options.resolveMention,
    });
    const fileReferences = collectWorkspaceMessageFileReferences(document);

    for (const file of fileReferences) {
      if (!isWorkspaceMediaFileReference(file)) {
        continue;
      }

      const fileUuid = file.fileUuid.trim();
      if (indexByFileUuid.has(fileUuid)) {
        continue;
      }

      indexByFileUuid.set(fileUuid, items.length);
      items.push({
        messageUuid: message.uuid,
        file,
      });
    }
  }

  if (items.length === 0) {
    return EMPTY_WORKSPACE_MESSAGE_MEDIA_GALLERY;
  }

  return {
    items,
    indexByFileUuid,
  };
}

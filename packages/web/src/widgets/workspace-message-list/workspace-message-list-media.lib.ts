import { collectWorkspaceMessageFileReferences } from "~/entities/messenger/messenger-workspace-message-body-files.lib";
import type { MessengerMessage } from "~/entities/messenger/messenger.types";
import type {
  WorkspaceMessageFileReference,
  WorkspaceMessageMentionResolver,
} from "~/shared/lib/workspace-message-render/workspace-message-document.types";
import { parseWorkspaceMessageBody } from "~/shared/lib/workspace-message-render/workspace-message-parse.lib";
import type { WorkspaceMessageMediaGalleryItem } from "./workspace-message-list.types";

export interface WorkspaceMessageImageGallery {
  items: readonly WorkspaceMessageMediaGalleryItem[];
  indexByFileUuid: ReadonlyMap<string, number>;
}

const EMPTY_WORKSPACE_MESSAGE_IMAGE_GALLERY: WorkspaceMessageImageGallery = {
  items: [],
  indexByFileUuid: new Map<string, number>(),
};

function isWorkspaceImageFileReference(
  reference: WorkspaceMessageFileReference,
): reference is WorkspaceMessageFileReference & { kind: "media"; mediaKind: "image" } {
  return (
    reference.kind === "media" &&
    reference.mediaKind === "image" &&
    reference.fileUuid.trim().length > 0
  );
}

export function collectWorkspaceMessageImageGallery(
  messages: readonly MessengerMessage[],
  options: { resolveMention?: WorkspaceMessageMentionResolver } = {},
): WorkspaceMessageImageGallery {
  if (messages.length === 0) {
    return EMPTY_WORKSPACE_MESSAGE_IMAGE_GALLERY;
  }

  const items: WorkspaceMessageMediaGalleryItem[] = [];
  const indexByFileUuid = new Map<string, number>();

  for (const message of messages) {
    const document = parseWorkspaceMessageBody(message.payload.content, {
      resolveMention: options.resolveMention,
    });
    const fileReferences = collectWorkspaceMessageFileReferences(document);

    for (const file of fileReferences) {
      if (!isWorkspaceImageFileReference(file)) {
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
    return EMPTY_WORKSPACE_MESSAGE_IMAGE_GALLERY;
  }

  return {
    items,
    indexByFileUuid,
  };
}

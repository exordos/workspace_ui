/**
 * Pin/unpin type definitions.
 *
 * Pins are managed via the Workspace API (not Zulip).
 * A pin belongs to a folder item and has an order index.
 */

export interface PinnedChat {
  folderItemUuid: string;
  folderUuid: string;
  chatId: string;
  orderIndex: number;
  pinnedAt: string;
}

/**
 * Default Workspace REST JSON bodies for Playwright E2E route mocking.
 */

const E2E_STREAM_UUID = "33333333-3333-4333-8333-333333333333";

function defaultFolderItem(folderUuid: string) {
  return {
    uuid: `e2e-folder-item-${folderUuid}`,
    folder_uuid: folderUuid,
    stream_uuid: E2E_STREAM_UUID,
    chat_type: "stream",
    unread_count: 0,
    order_index: 0,
    pinned_at: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

export function foldersSuccess() {
  return [
    {
      uuid: "e2e-folder-all",
      title: "All",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      background_color_value: 0,
      system_type: "all",
      unread_messages: [],
      items: [],
      folder_items: [defaultFolderItem("e2e-folder-all")],
    },
    {
      uuid: "e2e-folder-created",
      title: "Personal",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      background_color_value: 0,
      system_type: "created",
      unread_messages: [],
      items: [],
      folder_items: [],
    },
  ];
}

export function folderItemsSuccess(folderUuid = "e2e-folder-all") {
  return folderUuid === "e2e-folder-all" ? [defaultFolderItem(folderUuid)] : [];
}

export function servicesSuccess() {
  return [];
}

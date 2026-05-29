/**
 * Default Workspace REST JSON bodies for Playwright E2E route mocking.
 */

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
    },
  ];
}

export function folderItemsSuccess() {
  return [];
}

export function servicesSuccess() {
  return [];
}

/** Shared flex layout for sidebar DM/stream chat rows (normal density). */

export function sidebarChatRowLinkClass(compact: boolean, groupName?: string): string {
  const group = groupName != null ? `group/${groupName} ` : "";
  return compact
    ? `${group}flex items-start gap-2 rounded-md px-2 py-1.5 transition-colors`
    : `${group}flex items-stretch gap-3 rounded-lg px-2.5 py-2.5 transition-colors`;
}

export function sidebarChatRowBodyClass(compact: boolean): string {
  return compact ? "min-w-0 flex-1" : "flex min-w-0 flex-1 flex-col justify-between";
}

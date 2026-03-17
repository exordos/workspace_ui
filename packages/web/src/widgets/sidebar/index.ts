export { Sidebar } from "./sidebar.ui";
export { useSidebarConfigStore } from "./sidebar-config.model";
export type {
  SidebarProps,
  SidebarChat,
  TopicWithLast,
  StreamWithLast,
  StreamEntryInternal,
  DmEntryInternal,
} from "./sidebar.types";
export {
  buildSidebarFromMessages,
  getStreamChats,
  getDmById,
  slugForStream,
  parseStreamSlug,
  parseDmSlugToUserIds,
  dmConversationKey,
  chatToWorkspaceChatId,
  messageToStreamEntry,
  messageToDmEntry,
  isUnread,
  TOPIC_BAR_COLORS,
  MOCK_DMS,
  MOCK_GROUPS,
  MY_ACTIVITY,
} from "./sidebar.lib";

import type { RightDrawerMode } from "~/widgets/right-panel/right-drawer.model";
import type { SidebarChat, StreamWithLast } from "~/widgets/sidebar/sidebar.types";

export interface LayoutRightDrawerContext {
  title: string;
  rightDrawerTargetUserId: number | undefined;
  partnerUserId: number | undefined;
  dmChat: Extract<SidebarChat, { type: "dm" }> | undefined;
  dmParticipantIds: number[];
  activeStreamId: number | null;
  activeStreamName: string | null;
}

export interface UseLayoutRightDrawerContextOptions {
  streams: StreamWithLast[];
  dms: SidebarChat[];
  streamsMap: Map<number, { name: string }>;
  activeStreamSlug: string | undefined;
  activeTopic: string | null;
  dmIdParam: string | undefined;
  currentUserId: number | null;
  rightDrawerMode: RightDrawerMode;
  rightDrawerUserIdOverride: number | null;
  rightDrawerOverrideUserName: string | undefined;
  rightDrawerOpen: boolean;
}

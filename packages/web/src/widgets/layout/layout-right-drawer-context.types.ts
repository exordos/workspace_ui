import type { UserId } from "~/shared/lib/user-id.lib";
import type { RightDrawerMode } from "~/widgets/right-panel/right-drawer.model";
import type { SidebarChat, StreamWithLast } from "~/widgets/sidebar/sidebar.types";

export interface LayoutRightDrawerContext {
  title: string;
  rightDrawerTargetUserId: UserId | undefined;
  partnerUserId: UserId | undefined;
  dmChat: Extract<SidebarChat, { type: "dm" }> | undefined;
  dmParticipantIds: UserId[];
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
  currentUserId: UserId | null;
  rightDrawerMode: RightDrawerMode;
  rightDrawerUserIdOverride: UserId | null;
  rightDrawerOverrideUserName: string | undefined;
  rightDrawerOpen: boolean;
}

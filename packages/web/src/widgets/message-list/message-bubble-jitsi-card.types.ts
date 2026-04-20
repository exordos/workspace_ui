import type { MockMessage } from "~/shared/api/zulip.types";
import type { JitsiLinkOptions } from "~/shared/lib/jitsi";
import type { MessageBubbleCallbacks } from "./message-bubble.types";
import type { ReactNode } from "react";

export interface MessageBubbleJitsiCardProps {
  message: MockMessage;
  jitsiUrl: string;
  jitsiLinkOptions?: JitsiLinkOptions;
  isOwn: boolean;
  time: string;
  ownDeliveryIndicator: ReactNode;
  bubbleSurfaceClass: string;
  ownBubbleTailClass: string;
  peerBubbleTailClass: string;
  callbacks?: MessageBubbleCallbacks;
}

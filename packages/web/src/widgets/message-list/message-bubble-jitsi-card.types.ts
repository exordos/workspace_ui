import type { ReactNode } from "react";
import type { MockMessage } from "~/shared/api/zulip.types";
import type { MessageBubbleCallbacks } from "./message-bubble.types";

export interface MessageBubbleJitsiCardProps {
  message: MockMessage;
  jitsiUrl: string;
  isOwn: boolean;
  time: string;
  ownDeliveryIndicator: ReactNode;
  bubbleSurfaceClass: string;
  ownBubbleTailClass: string;
  peerBubbleTailClass: string;
  callbacks?: MessageBubbleCallbacks;
}

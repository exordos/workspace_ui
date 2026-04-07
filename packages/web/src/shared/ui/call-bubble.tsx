import React from "react";
import { t } from "~/i18n/i18n";
import { Avatar } from "./avatar";
import { Icon } from "./icon";
import type { CallBubbleProps } from "./call-bubble.types";

export const CallBubble: React.FC<CallBubbleProps> = ({
  callName = "",
  topic = "",
  duration = "0:47",
}) => {
  return (
    <div className="hover:bg-bg-elevated/30 flex gap-2 px-4 py-2">
      <Avatar size="sm" className="bg-bg-elevated text-call-green">
        <Icon name="phone" size={18} className="text-current" />
      </Avatar>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-text-primary">
            {t("call.call")} {callName} | #{topic}
          </p>
          <p className="mt-0.5 text-[11px] text-text-muted">{duration}</p>
        </div>
        <div className="flex flex-shrink-0 -space-x-1.5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-bg bg-bg-elevated text-[10px] text-text-muted"
            />
          ))}
        </div>
      </div>
    </div>
  );
};

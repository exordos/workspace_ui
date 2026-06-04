/**
 * Facade: routes Zulip realtime events to domain-specific dispatch modules.
 */
import type { ZulipEvent } from "~/shared/api/zulip.types";
import { getElectronAPI } from "~/shared/lib/electron";
import { safeCatch } from "~/shared/lib/guards";
import {
  applyMessageCacheIndexedDb,
  handleDeleteMessage,
  handleIncomingMessage,
  handleReaction,
  handleUpdateMessage,
  handleUpdateMessageFlags,
} from "./layout-zulip-event-dispatch-message.lib";
import {
  handlePresence,
  handleTyping,
  handleUserSettings,
  handleUserStatus,
} from "./layout-zulip-event-dispatch-presence.lib";
import {
  handleStream,
  handleSubscription,
  handleUserTopic,
} from "./layout-zulip-event-dispatch-subscription.lib";
import type {
  LayoutNotificationsActions,
  LayoutZulipEventDispatchContext,
} from "./layout-zulip-event-dispatch.types";

function runDispatchHandler(label: string, handler: () => void): void {
  safeCatch(handler, label)();
}

export function dispatchZulipEvent(event: ZulipEvent, ctx: LayoutZulipEventDispatchContext): void {
  applyMessageCacheIndexedDb(event, ctx);

  if (event.type === "message" && event.message) {
    runDispatchHandler("dispatch:message", () => handleIncomingMessage(event, ctx));
    return;
  }

  if (event.type === "update_message_flags") {
    runDispatchHandler("dispatch:update_message_flags", () => handleUpdateMessageFlags(event, ctx));
    return;
  }

  if (event.type === "reaction") {
    runDispatchHandler("dispatch:reaction", () => handleReaction(event, ctx));
    return;
  }

  if (event.type === "delete_message") {
    runDispatchHandler("dispatch:delete_message", () => handleDeleteMessage(event, ctx));
    return;
  }

  if (event.type === "typing") {
    runDispatchHandler("dispatch:typing", () => handleTyping(event, ctx));
    return;
  }

  if (event.type === "update_message") {
    runDispatchHandler("dispatch:update_message", () => handleUpdateMessage(event, ctx));
    return;
  }

  if (event.type === "presence") {
    runDispatchHandler("dispatch:presence", () => handlePresence(event, ctx));
    return;
  }

  if (event.type === "user_status") {
    runDispatchHandler("dispatch:user_status", () => handleUserStatus(event, ctx));
    return;
  }

  if (event.type === "subscription") {
    runDispatchHandler("dispatch:subscription", () => handleSubscription(event, ctx));
    return;
  }

  if (event.type === "stream") {
    runDispatchHandler("dispatch:stream", () => handleStream(event, ctx));
    return;
  }

  if (event.type === "user_topic") {
    runDispatchHandler("dispatch:user_topic", () => handleUserTopic(event, ctx));
    return;
  }

  if (event.type === "user_settings") {
    runDispatchHandler("dispatch:user_settings", () => handleUserSettings(event));
  }
}

export function buildLayoutNotificationsActions(options: {
  show: LayoutNotificationsActions["show"];
  closeByTag: LayoutNotificationsActions["closeByTag"];
  playSound: (preset?: string) => void;
  getSoundPreset: () => string;
}): LayoutNotificationsActions {
  return {
    show: options.show,
    closeByTag: options.closeByTag,
    playSound: options.playSound,
    getSoundPreset: options.getSoundPreset,
    requestAttentionIfNotFocused: () => {
      if (typeof document !== "undefined" && !document.hasFocus()) {
        getElectronAPI()?.os?.requestAttention?.();
      }
    },
  };
}

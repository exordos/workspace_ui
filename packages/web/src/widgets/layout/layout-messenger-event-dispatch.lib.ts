/**
 * Facade: routes Workspace realtime events to domain-specific dispatch modules.
 */
import type { MessengerEvent } from "~/shared/api/messenger.types";
import { getElectronAPI } from "~/shared/lib/electron";
import { safeCatch } from "~/shared/lib/guards";
import { handleFolder, handleFolderItem } from "./layout-messenger-event-dispatch-folder.lib";
import {
  applyMessageCacheIndexedDb,
  handleDeleteMessage,
  handleIncomingMessage,
  handleMessageUpdated,
  handleReaction,
  handleUpdateMessage,
  handleUpdateMessageFlags,
} from "./layout-messenger-event-dispatch-message.lib";
import { handleTyping, handleUserSettings } from "./layout-messenger-event-dispatch-presence.lib";
import { handleRealm } from "./layout-messenger-event-dispatch-realm.lib";
import {
  handleStream,
  handleStreamBinding,
  handleSubscription,
  handleTopic,
} from "./layout-messenger-event-dispatch-subscription.lib";
import type {
  LayoutNotificationsActions,
  LayoutMessengerEventDispatchContext,
} from "./layout-messenger-event-dispatch.types";

function runDispatchHandler(label: string, handler: () => void): void {
  safeCatch(handler, label)();
}

export function dispatchMessengerEvent(
  event: MessengerEvent,
  ctx: LayoutMessengerEventDispatchContext,
): void {
  applyMessageCacheIndexedDb(event, ctx);

  if (event.type === "message" && event.message) {
    if (event.kind === "message.updated") {
      runDispatchHandler("dispatch:message.updated", () => handleMessageUpdated(event, ctx));
      return;
    }
    if (event.kind === "message.deleted") {
      runDispatchHandler("dispatch:message.deleted", () => handleDeleteMessage(event, ctx));
      return;
    }
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

  if (event.type === "subscription") {
    runDispatchHandler("dispatch:subscription", () => handleSubscription(event, ctx));
    return;
  }

  if (event.type === "stream") {
    runDispatchHandler("dispatch:stream", () => handleStream(event, ctx));
    return;
  }

  if (event.type === "stream_binding") {
    runDispatchHandler("dispatch:stream_binding", () => handleStreamBinding(event, ctx));
    return;
  }

  if (event.type === "topic") {
    runDispatchHandler("dispatch:topic", () => handleTopic(event, ctx));
    return;
  }

  if (event.type === "folder") {
    runDispatchHandler("dispatch:folder", () => handleFolder(event, ctx));
    return;
  }

  if (event.type === "folder_item") {
    runDispatchHandler("dispatch:folder_item", () => handleFolderItem(event, ctx));
    return;
  }

  if (event.type === "user_settings") {
    runDispatchHandler("dispatch:user_settings", () => handleUserSettings(event));
    return;
  }

  if (event.type === "realm") {
    runDispatchHandler("dispatch:realm", () => handleRealm(event));
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

import { sendMessengerMessage } from "./messenger-message-actions.lib";
import type {
  MessengerMessageActionResult,
  SendMessengerMessageOptions,
} from "./messenger-message-actions.lib";

/** Explicit local test send; generic send/forward paths still reject encrypted streams. */
export function sendDevEncryptedMessengerMessage(
  options: Omit<SendMessengerMessageOptions, "cryptoMode">,
): Promise<MessengerMessageActionResult> {
  return sendMessengerMessage({ ...options, cryptoMode: "development-fixture" });
}

import type { MessageId } from "~/shared/lib/message-id.lib";

export function appendForwardIntentQuery(route: string, messageId: MessageId): string {
  return `${route}${route.includes("?") ? "&" : "?"}forward=${messageId}`;
}

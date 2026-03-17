import type { MockMessage } from "~/shared/api/zulip";

export function resolveJitsiLocationName(message: MockMessage): string {
  if (message.stream_id != null) {
    if (typeof message.display_recipient === "string") {
      const streamName = message.display_recipient.trim();
      if (streamName.length > 0) return streamName;
    }
    const channelName = message.channel?.trim();
    if (channelName != null && channelName.length > 0) return channelName;
    return "";
  }

  if (!Array.isArray(message.display_recipient)) {
    return "";
  }

  const names = message.display_recipient
    .map((recipient) => recipient.full_name.trim())
    .filter((name) => name.length > 0);
  return names.join(", ");
}

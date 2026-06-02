/**
 * Activity page helpers — route building and message context labels.
 */

export function buildMessageNavigateRoute(route: string, messageId: number, mode: string): string {
  if (mode !== "forward") {
    return route;
  }
  const separator = route.includes("?") ? "&" : "?";
  return `${route}${separator}forward=${messageId}`;
}

export function formatStreamTopicLabel(topic: string | null, generalChatLabel: string): string {
  if ((topic?.length ?? 0) > 0) {
    return topic!;
  }
  return generalChatLabel;
}

export function formatActivityMessageContext(options: {
  isStream: boolean;
  streamName: string | null;
  topic: string | null;
  dmName: string | null;
  generalChatLabel: string;
  privateLabel: string;
}): string {
  if (options.isStream) {
    const topicLabel = formatStreamTopicLabel(options.topic, options.generalChatLabel);
    return `#${options.streamName} · ${topicLabel}`;
  }
  if (options.dmName != null) {
    return `${options.privateLabel} · ${options.dmName}`;
  }
  return options.privateLabel;
}

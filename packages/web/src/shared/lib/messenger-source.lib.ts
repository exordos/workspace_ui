import type { MessengerSourceName } from "~/shared/api/messenger.types";

type ExternalMessengerSourceName = Exclude<MessengerSourceName, "native">;

const EXTERNAL_MESSENGER_SOURCE_LABEL: Record<ExternalMessengerSourceName, string> = {
  zulip: "Zulip",
};

export function isExternalMessengerSourceName(
  sourceName: MessengerSourceName | undefined,
): sourceName is ExternalMessengerSourceName {
  return sourceName != null && sourceName !== "native";
}

export function getExternalMessengerSourceLabel(
  sourceName: MessengerSourceName | undefined,
): string | null {
  if (!isExternalMessengerSourceName(sourceName)) return null;
  return EXTERNAL_MESSENGER_SOURCE_LABEL[sourceName];
}

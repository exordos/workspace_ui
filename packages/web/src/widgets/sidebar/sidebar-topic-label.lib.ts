import { t } from "~/i18n/i18n";
import { normalizeTopicForIdentity } from "~/shared/lib/topic-identity.lib";

export function resolveSidebarTopicLabel(topic: string): string {
  const normalized = normalizeTopicForIdentity(topic);
  return normalized.length > 0 ? normalized : t("channel.emptyTopic");
}

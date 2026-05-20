import { withCurrentOrgRoute } from "~/shared/lib/org-route";
import { encodeTopicForRoute } from "~/shared/lib/topic-identity.lib";

export function sidebarDmRoute(dmSlug: string): string {
  return withCurrentOrgRoute(`/dm/${dmSlug}`);
}

export function sidebarStreamRoute(streamSlug: string): string {
  return withCurrentOrgRoute(`/stream/${streamSlug}`);
}

export function sidebarStreamTopicRoute(streamSlug: string, topicSubject: string): string {
  return withCurrentOrgRoute(
    `/stream/${streamSlug}/topic/${encodeURIComponent(encodeTopicForRoute(topicSubject))}`,
  );
}

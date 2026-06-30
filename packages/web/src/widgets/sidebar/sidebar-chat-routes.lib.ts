import { withCurrentOrgRoute } from "~/shared/lib/org-route";

export function sidebarDmRoute(_dmSlug: string): string {
  return withCurrentOrgRoute("/inbox");
}

export function sidebarStreamRoute(_streamSlug: string): string {
  return withCurrentOrgRoute("/inbox");
}

export function sidebarStreamTopicRoute(_streamSlug: string, _topicSubject: string): string {
  return withCurrentOrgRoute("/inbox");
}

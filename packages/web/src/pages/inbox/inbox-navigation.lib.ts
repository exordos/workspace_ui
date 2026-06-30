import type { InboxEntry } from "~/entities/inbox/inbox.types";
import { withCurrentOrgRoute } from "~/shared/lib/org-route";

export function buildInboxEntryRoute(entry: InboxEntry): string | null {
  if (entry.streamId != null || entry.dmSlug != null || entry.senderId != null) {
    return withCurrentOrgRoute("/inbox");
  }

  return null;
}

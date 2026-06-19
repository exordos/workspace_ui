import type { ActivityFilter } from "~/shared/api/messenger.types";

/** Activity area tab: standard Workspace filters plus drafts. */
export type ActivityPageExtendedFilter = ActivityFilter | "drafts";

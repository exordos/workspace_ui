import type { ActivityFilter } from "~/shared/api/zulip.types";

/** Activity area tab: standard Zulip filters plus drafts. */
export type ActivityPageExtendedFilter = ActivityFilter | "drafts";

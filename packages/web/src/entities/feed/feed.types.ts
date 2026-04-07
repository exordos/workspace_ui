/**
 * Feed types — chronological all-messages view.
 *
 * Reuses MockMessage from `~/shared/api/zulip.types` as the message shape.
 * The feed store adds pagination metadata for infinite scroll.
 */

export type { MockMessage as FeedMessage } from "~/shared/api/zulip.types";

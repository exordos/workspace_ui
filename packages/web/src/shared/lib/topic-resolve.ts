/**
 * Topic resolution display helpers.
 *
 * The new backend owns topic done state in `is_done`; the checkmark is visual only.
 */

export const TOPIC_RESOLVED_MARKER = "\u2714";

function normalizeTopicName(topic: string): string {
  return topic.trim();
}

export function formatTopicDoneLabel(label: string, isDone: boolean): string {
  const normalized = normalizeTopicName(label);
  if (!isDone || normalized.length === 0) {
    return label;
  }
  return `${TOPIC_RESOLVED_MARKER} ${normalized}`;
}

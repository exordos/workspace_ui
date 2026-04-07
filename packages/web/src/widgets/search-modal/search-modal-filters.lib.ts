import type { UserRecord } from "~/entities/user/user.model";
import type { MockMessage } from "~/shared/api/zulip.types";

export function filterSearchMessages(
  results: MockMessage[],
  users: Map<number, UserRecord>,
  streamFilter: string,
  senderFilter: string,
  dateFilter: string,
): MockMessage[] {
  const normalizedStreamFilter = streamFilter.trim().toLowerCase();
  const normalizedSenderFilter = senderFilter.trim().toLowerCase();
  const normalizedDateFilter = dateFilter.trim();
  return results.filter((msg) => {
    const channelName = (msg.channel ?? "").toLowerCase();
    const messageSender = (msg.sender_full_name ?? "").toLowerCase();
    const senderFromStore = (users.get(msg.sender_id)?.full_name ?? "").toLowerCase();
    const matchesStream =
      normalizedStreamFilter.length === 0 || channelName.includes(normalizedStreamFilter);
    const matchesSender =
      normalizedSenderFilter.length === 0 ||
      messageSender.includes(normalizedSenderFilter) ||
      senderFromStore.includes(normalizedSenderFilter);
    const messageDate = new Date(msg.timestamp * 1000).toISOString().slice(0, 10);
    const matchesDate = normalizedDateFilter.length === 0 || messageDate === normalizedDateFilter;
    return matchesStream && matchesSender && matchesDate;
  });
}

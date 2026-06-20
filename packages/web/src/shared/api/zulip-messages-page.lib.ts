import type { MessagesPageResult, MockMessage, RawMessageToMockInput } from "./zulip.types";

export interface ZulipMessagesPageApiData {
  result?: string;
  messages?: RawMessageToMockInput[];
  found_oldest?: boolean;
  foundOldest?: boolean;
  found_newest?: boolean;
  foundNewest?: boolean;
}

const EMPTY_PAGE: MessagesPageResult = {
  messages: [],
  foundOldest: false,
  foundNewest: false,
};

export function mapMessagesPageFromApiData(
  data: ZulipMessagesPageApiData,
  mapMessage: (message: RawMessageToMockInput) => MockMessage,
): MessagesPageResult {
  if (data.result === "error") {
    return EMPTY_PAGE;
  }
  return {
    messages: (data.messages ?? []).map(mapMessage),
    foundOldest: data.found_oldest ?? data.foundOldest ?? false,
    foundNewest: data.found_newest ?? data.foundNewest ?? false,
  };
}

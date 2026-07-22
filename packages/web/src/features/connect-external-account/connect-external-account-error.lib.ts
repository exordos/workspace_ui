import { MessengerApiError } from "~/shared/api/messenger-transport.internal";
import type { ConnectExternalAccountError } from "./connect-external-account.types";

export function connectExternalAccountRequestError(error: unknown): ConnectExternalAccountError {
  if (!(error instanceof MessengerApiError)) return "connect";
  if (error.status === 409) return "duplicate";
  if (error.status === 400 || error.status === 401) return "invalid";
  if (error.status === 403) return "forbidden";
  if (error.status === 502 || error.status === 503) return "unavailable";
  return "connect";
}

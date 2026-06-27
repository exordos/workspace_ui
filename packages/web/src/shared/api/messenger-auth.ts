// REST calls use the normal Authorization header.
export function getMessengerBearerAuthValue(accessToken: string | null | undefined): string | null {
  const token = accessToken?.trim();
  if (!token) return null;
  return `Bearer ${token}`;
}

export function buildMessengerBearerAuthHeader(
  accessToken: string | null | undefined,
): Record<string, string> {
  const value = getMessengerBearerAuthValue(accessToken);
  if (value == null) return {};
  return { Authorization: value };
}

// WebSocket auth goes through the subprotocol list, not through the URL.
export function getMessengerWebSocketBearerProtocol(
  accessToken: string | null | undefined,
): string | null {
  const token = accessToken?.trim();
  if (!token) return null;
  return `bearer.${token}`;
}

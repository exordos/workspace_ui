// REST-запросы могут нести токен обычным Authorization header.
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

// WebSocket нельзя авторизовать тем же header из браузера.
// Поэтому сервер ждёт Bearer-токен в списке subprotocol, а не в URL.
export function getMessengerWebSocketBearerProtocol(
  accessToken: string | null | undefined,
): string | null {
  const token = accessToken?.trim();
  if (!token) return null;
  return `bearer.${token}`;
}

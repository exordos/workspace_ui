export function appendForwardIntentQuery(route: string, messageId: number): string {
  return `${route}${route.includes("?") ? "&" : "?"}forward=${messageId}`;
}

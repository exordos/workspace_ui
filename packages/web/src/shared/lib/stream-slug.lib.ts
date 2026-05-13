/**
 * Строит сегмент пути `/stream/:streamSlug` в формате Zulip-клиента: `{id}-{нормализованное-имя}`.
 * Используется сайдбаром, роутингом и ссылками на канал.
 */
export function buildStreamSlug(streamId: number, streamName: string): string {
  const lower = streamName.trim().toLowerCase();
  const safe = lower.replace(/[^\p{L}\p{N}-]/gu, "-").replace(/-+/g, "-");
  const slug = safe.replace(/^-|-$/g, "") || "chat";
  return `${streamId}-${slug}`;
}

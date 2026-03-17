export function closeReadMessageNotifications(
  closeByTag: (tag: string) => void | Promise<void>,
  messageIds: number[],
): void {
  const uniqueValidIds = new Set<number>();
  for (const messageId of messageIds) {
    if (!Number.isInteger(messageId) || messageId <= 0) continue;
    if (uniqueValidIds.has(messageId)) continue;
    uniqueValidIds.add(messageId);
    const closeResult = closeByTag(`msg-${messageId}`);
    if (closeResult instanceof Promise) {
      void closeResult.catch(() => {});
    }
  }
}

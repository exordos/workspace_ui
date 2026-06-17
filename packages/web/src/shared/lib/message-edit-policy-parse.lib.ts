export function parseMessageEditPolicyBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function parseMessageContentEditLimitSeconds(value: unknown): number | null | undefined {
  if (value === null || value === 0) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return undefined;
  }
  return value;
}

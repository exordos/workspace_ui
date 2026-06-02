function normalizeStreamName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : null;
}

export interface ResolveCanonicalStreamNameInput {
  streamId: number | null | undefined;
  streamMapName?: string | null;
  metadataName?: string | null;
}

export function resolveCanonicalStreamName(input: ResolveCanonicalStreamNameInput): string | null {
  const streamMapName = normalizeStreamName(input.streamMapName);
  const metadataName = normalizeStreamName(input.metadataName);

  if (input.streamId != null) {
    return streamMapName ?? metadataName ?? null;
  }

  return null;
}

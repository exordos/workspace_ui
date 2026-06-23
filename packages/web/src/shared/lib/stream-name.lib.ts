function normalizeStreamName(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed != null && trimmed.length > 0 ? trimmed : null;
}

export interface ResolvedStreamByDisplayName {
  streamId: number;
  streamName: string;
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

export function resolveStreamByDisplayName(
  streamName: string,
  streamsMap: Map<number, { name: string }>,
): ResolvedStreamByDisplayName | null {
  const normalizedName = normalizeStreamName(streamName);
  if (normalizedName == null) {
    return null;
  }

  for (const [streamId, stream] of streamsMap.entries()) {
    if (normalizeStreamName(stream.name) === normalizedName) {
      return { streamId, streamName: stream.name };
    }
  }

  return null;
}

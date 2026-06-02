export function resolveReactionTitle(options: {
  reactionAuthors: string;
  reactionPrefix: string;
  count: number;
}): string | undefined {
  if (options.reactionAuthors.length > 0) {
    return `${options.reactionPrefix} ${options.count} - ${options.reactionAuthors}`;
  }
  if (options.count > 0) {
    return `${options.reactionPrefix} ${options.count}`;
  }
  return undefined;
}

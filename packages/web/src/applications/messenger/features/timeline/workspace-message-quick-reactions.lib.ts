import {
  normalizeEmojiShortcodeName,
  resolveShortcodeToUnicode,
} from "~/shared/lib/emoji-shortcodes.lib";
import {
  getWorkspaceMessageQuickReactionUsageCounts,
  getWorkspaceMessageQuickReactionUsageRevision,
} from "./workspace-message-quick-reaction-history.lib";

export const WORKSPACE_MESSAGE_QUICK_REACTIONS = [
  { emojiName: "heart", labelKey: "a11y.like", glyph: "❤️" },
  { emojiName: "thumbs_up", labelKey: "a11y.thumbsUp", glyph: "👍" },
  { emojiName: "joy", labelKey: "a11y.joy", glyph: "😂" },
  { emojiName: "open_mouth", labelKey: "a11y.surprised", glyph: "😮" },
  { emojiName: "cry", labelKey: "a11y.crying", glyph: "😢" },
  { emojiName: "clap", labelKey: "a11y.clap", glyph: "👏" },
] as const;

export const WORKSPACE_MESSAGE_POPULAR_REACTION_LIMIT = 5;

export type WorkspaceMessageQuickReaction =
  | (typeof WORKSPACE_MESSAGE_QUICK_REACTIONS)[number]
  | { emojiName: string; labelKey: "a11y.quickReaction"; glyph: string };

interface ResolvedQuickReactionEmoji {
  identity: string;
  glyph: string;
}

function resolveQuickReactionEmoji(emojiName: string): ResolvedQuickReactionEmoji {
  const shortcode = normalizeEmojiShortcodeName(emojiName);
  if (shortcode.length === 0) return { identity: emojiName, glyph: emojiName };

  const glyph = resolveShortcodeToUnicode(shortcode);
  if (glyph == null) return { identity: shortcode, glyph: `:${shortcode}:` };

  return { identity: glyph, glyph };
}

export function resolveWorkspaceReactionDisplayChar(emojiName: string): string {
  return resolveQuickReactionEmoji(emojiName).glyph;
}

const WORKSPACE_MESSAGE_QUICK_REACTIONS_SERVER_SNAPSHOT: WorkspaceMessageQuickReaction[] = [
  ...WORKSPACE_MESSAGE_QUICK_REACTIONS,
];

let cachedPopularLimit = -1;
let cachedUsageRevision = -1;
let cachedUsageDateKey = "";
let cachedReactions: WorkspaceMessageQuickReaction[] | null = null;

export function getWorkspaceMessageQuickReactionsServerSnapshot(): WorkspaceMessageQuickReaction[] {
  return WORKSPACE_MESSAGE_QUICK_REACTIONS_SERVER_SNAPSHOT;
}

export function getWorkspaceMessageQuickReactions(
  popularLimit = WORKSPACE_MESSAGE_POPULAR_REACTION_LIMIT,
): WorkspaceMessageQuickReaction[] {
  const normalizedPopularLimit = Math.max(0, Math.floor(popularLimit));
  const usageRevision = getWorkspaceMessageQuickReactionUsageRevision();
  const usageDateKey = new Date().toISOString().slice(0, 10);
  if (cachedReactions != null && cachedPopularLimit === normalizedPopularLimit) {
    if (cachedUsageRevision === usageRevision && cachedUsageDateKey === usageDateKey) {
      return cachedReactions;
    }
  }

  const usageCounts = new Map<string, number>();
  for (const [emojiName, count] of Object.entries(getWorkspaceMessageQuickReactionUsageCounts())) {
    const { identity } = resolveQuickReactionEmoji(emojiName);
    usageCounts.set(identity, (usageCounts.get(identity) ?? 0) + count);
  }

  const baseReactionNames: ReadonlySet<string> = new Set(
    WORKSPACE_MESSAGE_QUICK_REACTIONS.map(({ glyph }) => resolveQuickReactionEmoji(glyph).identity),
  );
  const popularReactions = [...usageCounts.entries()]
    .filter(([identity, count]) => count > 0 && !baseReactionNames.has(identity))
    .sort(([leftName, leftCount], [rightName, rightCount]) => {
      const usageDifference = rightCount - leftCount;
      return usageDifference !== 0 ? usageDifference : leftName.localeCompare(rightName);
    })
    .slice(0, normalizedPopularLimit)
    .map(([identity]) => {
      const resolved = resolveQuickReactionEmoji(identity);
      return {
        emojiName: resolved.identity,
        labelKey: "a11y.quickReaction" as const,
        glyph: resolved.glyph,
      };
    });

  const reactions: WorkspaceMessageQuickReaction[] = [
    ...WORKSPACE_MESSAGE_QUICK_REACTIONS,
    ...popularReactions,
  ];
  const stableOrder = new Map(reactions.map((reaction, index) => [reaction.emojiName, index]));

  const sortedReactions = reactions.sort((left, right) => {
    const rightIdentity = resolveQuickReactionEmoji(right.emojiName).identity;
    const leftIdentity = resolveQuickReactionEmoji(left.emojiName).identity;
    const usageDifference =
      (usageCounts.get(rightIdentity) ?? 0) - (usageCounts.get(leftIdentity) ?? 0);
    return usageDifference !== 0
      ? usageDifference
      : (stableOrder.get(left.emojiName) ?? 0) - (stableOrder.get(right.emojiName) ?? 0);
  });

  if (
    cachedReactions != null &&
    cachedPopularLimit === normalizedPopularLimit &&
    cachedReactions.length === sortedReactions.length &&
    cachedReactions.every(
      (reaction, index) => reaction.emojiName === sortedReactions[index]?.emojiName,
    )
  ) {
    cachedUsageRevision = usageRevision;
    cachedUsageDateKey = usageDateKey;
    return cachedReactions;
  }

  cachedPopularLimit = normalizedPopularLimit;
  cachedUsageRevision = usageRevision;
  cachedUsageDateKey = usageDateKey;
  cachedReactions = sortedReactions;
  return sortedReactions;
}

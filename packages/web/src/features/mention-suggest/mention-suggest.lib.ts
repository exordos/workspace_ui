/**
 * Mention suggestion ranking — pure functions for ordering users behind "@".
 *
 * Two keys decide the order, in this priority:
 *  1. match quality — exact, then prefix, then word prefix, then substring,
 *     with name matches always ahead of email and UUID matches;
 *  2. conversation context — who just wrote here, who belongs to this channel,
 *     who you write to directly, and who you mention often.
 * Name length and locale-aware alphabetical order break the remaining ties.
 */

import type { MentionRankingContext, MentionSuggestion } from "./mention-suggest.types";

/** Zulip-sized dropdown: more than this is a list to read, not a list to pick from. */
export const MENTION_SUGGESTION_LIMIT = 8;

/** A short query hits UUID fragments by accident, so UUIDs only match deliberate ones. */
const UUID_MIN_QUERY_LENGTH = 4;

const MATCH_TIER_EXACT = 0;
const MATCH_TIER_PREFIX = 1;
const MATCH_TIER_WORD_PREFIX = 2;
const MATCH_TIER_SUBSTRING = 3;
const MATCH_TIER_EMAIL = 4;
const MATCH_TIER_UUID = 5;
const MATCH_TIER_NONE = Number.POSITIVE_INFINITY;

const RECENT_AUTHOR_BASE_SCORE = 4000;
const RECENT_AUTHOR_STEP = 100;
const RECENT_AUTHOR_DEPTH = 20;
const CHANNEL_MEMBER_SCORE = 1500;
const DM_PARTNER_BASE_SCORE = 1200;
const DM_PARTNER_STEP = 40;
const DM_PARTNER_DEPTH = 20;
const FRECENCY_SCORE_CAP = 10;
const FRECENCY_SCORE_WEIGHT = 60;
const SELF_PENALTY = 5000;

const WORD_SEPARATOR = /[\s._\-|/\\,()[\]<>@]+/u;
const COMBINING_MARKS = /\p{M}+/gu;

interface PreparedCandidate {
  suggestion: MentionSuggestion;
  displayName: string;
  username: string;
  email: string;
  emailLocalPart: string;
  userUuid: string;
  words: string[];
}

const preparedCache = new WeakMap<readonly MentionSuggestion[], PreparedCandidate[]>();

/**
 * Folds case, diacritics and Cyrillic "ё" into one comparable form, so that
 * "Ё"/"Е" and "é"/"e" are typed interchangeably.
 */
function normalizeMentionText(value: string): string {
  return value.normalize("NFD").replace(COMBINING_MARKS, "").toLowerCase().trim();
}

function splitWords(value: string): string[] {
  return value.split(WORD_SEPARATOR).filter((word) => word.length > 0);
}

function prepareCandidates(users: readonly MentionSuggestion[]): PreparedCandidate[] {
  const cached = preparedCache.get(users);
  if (cached != null) return cached;

  const prepared = users.map((suggestion) => {
    const displayName = normalizeMentionText(suggestion.displayName);
    const username = normalizeMentionText(suggestion.username);
    const email = normalizeMentionText(suggestion.email);
    const atIndex = email.indexOf("@");
    return {
      suggestion,
      displayName,
      username,
      email,
      emailLocalPart: atIndex > 0 ? email.slice(0, atIndex) : email,
      userUuid: suggestion.userUuid.toLowerCase(),
      words: [...splitWords(displayName), ...splitWords(username)],
    };
  });

  preparedCache.set(users, prepared);
  return prepared;
}

/** Every query token must open a word of its own, so "iv pe" finds "Ivan Petrov". */
function matchesAllTokens(tokens: readonly string[], words: readonly string[]): boolean {
  const taken = new Set<number>();
  return tokens.every((token) => {
    const wordIndex = words.findIndex((word, index) => !taken.has(index) && word.startsWith(token));
    if (wordIndex < 0) return false;
    taken.add(wordIndex);
    return true;
  });
}

function resolveMatchTier(
  query: string,
  tokens: readonly string[],
  candidate: PreparedCandidate,
): number {
  if (candidate.username === query || candidate.displayName === query) {
    return MATCH_TIER_EXACT;
  }
  if (candidate.username.startsWith(query) || candidate.displayName.startsWith(query)) {
    return MATCH_TIER_PREFIX;
  }
  if (
    candidate.words.some((word) => word.startsWith(query)) ||
    candidate.emailLocalPart.startsWith(query)
  ) {
    return MATCH_TIER_WORD_PREFIX;
  }
  if (tokens.length > 1 && matchesAllTokens(tokens, candidate.words)) {
    return MATCH_TIER_WORD_PREFIX;
  }
  if (candidate.username.includes(query) || candidate.displayName.includes(query)) {
    return MATCH_TIER_SUBSTRING;
  }
  if (candidate.email.includes(query)) {
    return MATCH_TIER_EMAIL;
  }
  if (query.length >= UUID_MIN_QUERY_LENGTH && candidate.userUuid.includes(query)) {
    return MATCH_TIER_UUID;
  }
  return MATCH_TIER_NONE;
}

function resolveContextScore(userUuid: string, context: MentionRankingContext): number {
  let score = 0;

  const recentIndex = context.recentAuthorUuids?.indexOf(userUuid) ?? -1;
  if (recentIndex >= 0 && recentIndex < RECENT_AUTHOR_DEPTH) {
    score += RECENT_AUTHOR_BASE_SCORE - recentIndex * RECENT_AUTHOR_STEP;
  }

  if (context.channelMemberUuids?.has(userUuid) === true) {
    score += CHANNEL_MEMBER_SCORE;
  }

  const dmIndex = context.dmPartnerUuids?.indexOf(userUuid) ?? -1;
  if (dmIndex >= 0 && dmIndex < DM_PARTNER_DEPTH) {
    score += DM_PARTNER_BASE_SCORE - dmIndex * DM_PARTNER_STEP;
  }

  const frecency = context.frecencyByUserUuid?.[userUuid] ?? 0;
  if (frecency > 0) {
    score += Math.min(frecency, FRECENCY_SCORE_CAP) * FRECENCY_SCORE_WEIGHT;
  }

  if (context.selfUserUuid != null && context.selfUserUuid === userUuid) {
    score -= SELF_PENALTY;
  }

  return score;
}

function applyChannelMembership(
  suggestion: MentionSuggestion,
  channelMemberUuids: ReadonlySet<string> | null | undefined,
): MentionSuggestion {
  if (channelMemberUuids == null) return suggestion;
  return { ...suggestion, outsideChannel: !channelMemberUuids.has(suggestion.userUuid) };
}

/**
 * Orders mention candidates for a query, dropping the ones that do not match at all.
 * An empty query keeps everyone and orders them by conversation context alone.
 */
export function rankMentionSuggestions(
  query: string,
  users: readonly MentionSuggestion[],
  options: { context?: MentionRankingContext; maxResults?: number } = {},
): MentionSuggestion[] {
  const { context = {}, maxResults } = options;
  const normalizedQuery = normalizeMentionText(query);
  const tokens = splitWords(normalizedQuery);
  const candidates = prepareCandidates(users);

  const scored: { candidate: PreparedCandidate; tier: number; score: number }[] = [];
  for (const candidate of candidates) {
    const tier =
      normalizedQuery.length === 0
        ? MATCH_TIER_EXACT
        : resolveMatchTier(normalizedQuery, tokens, candidate);
    if (tier === MATCH_TIER_NONE) continue;
    scored.push({
      candidate,
      tier,
      score: resolveContextScore(candidate.suggestion.userUuid, context),
    });
  }

  scored.sort((left, right) => {
    if (left.tier !== right.tier) return left.tier - right.tier;
    if (left.score !== right.score) return right.score - left.score;
    // A shorter name is the closer answer to a typed query; with no query it means nothing.
    if (normalizedQuery.length > 0) {
      const nameLengthDelta =
        left.candidate.suggestion.displayName.length -
        right.candidate.suggestion.displayName.length;
      if (nameLengthDelta !== 0) return nameLengthDelta;
    }
    const nameDelta = left.candidate.suggestion.displayName.localeCompare(
      right.candidate.suggestion.displayName,
    );
    if (nameDelta !== 0) return nameDelta;
    return left.candidate.suggestion.userUuid.localeCompare(right.candidate.suggestion.userUuid);
  });

  const limited = maxResults == null ? scored : scored.slice(0, Math.max(0, maxResults));
  return limited.map(({ candidate }) =>
    applyChannelMembership(candidate.suggestion, context.channelMemberUuids),
  );
}

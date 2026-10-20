import { useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import {
  compareMessagesByCreatedAtThenKey,
  isWorkspaceServiceMessage,
} from "./workspace-message-list-grouping.lib";
import { findWorkspaceMessageNode } from "./workspace-message-list-scroll-anchor.lib";
import { getWorkspaceServiceGroupStatus } from "./workspace-service-message-group.lib";
import type {
  WorkspaceMessageAuthorGroup,
  WorkspaceMessageDayGroup,
} from "./workspace-message-list-grouping.lib";
import type {
  WorkspaceMessageListItem,
  WorkspaceMessageListProps,
} from "./workspace-message-list.types";
import type { RefObject } from "react";

interface Preference {
  expanded: boolean;
  source: "manual" | "auto";
  revision: number;
}

interface ExpansionSession {
  scope: string;
  ready: boolean;
  seen: ReadonlySet<string>;
  latest: WorkspaceMessageListItem | null;
  preferences: ReadonlyMap<string, Preference>;
  revision: number;
  focusKey: string;
}

interface ExpansionOptions {
  dayGroups: readonly WorkspaceMessageDayGroup[];
  items: readonly WorkspaceMessageListItem[];
  scope: string;
  ready: boolean;
  liveEnabled: boolean;
  collapseEnabled: boolean;
  selectionMode: boolean;
  focusedMessageTarget: WorkspaceMessageListProps["focusedMessageTarget"];
  currentUserUuid: string;
  actions: WorkspaceMessageListProps["actions"];
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  preserveMessageLayout: () => boolean;
}

function initialSession(scope: string): ExpansionSession {
  return {
    scope,
    ready: false,
    seen: new Set(),
    latest: null,
    preferences: new Map(),
    revision: 0,
    focusKey: "",
  };
}

function preferenceFor(
  group: WorkspaceMessageAuthorGroup,
  preferences: ReadonlyMap<string, Preference>,
): Preference | undefined {
  let result: Preference | undefined;
  for (const item of group.messages) {
    const candidate = preferences.get(item.key);
    if (candidate == null) continue;
    if (
      result == null ||
      (candidate.source === "manual" && result.source !== "manual") ||
      (candidate.source === result.source && candidate.revision > result.revision)
    )
      result = candidate;
  }
  return result;
}

function applyPreference(
  session: ExpansionSession,
  groups: readonly WorkspaceMessageAuthorGroup[],
  source: Preference["source"],
  expanded: boolean,
): ExpansionSession {
  const preference = { source, expanded, revision: session.revision + 1 };
  const preferences = new Map(session.preferences);
  for (const group of groups)
    for (const item of group.messages) preferences.set(item.key, preference);
  return { ...session, preferences, revision: preference.revision };
}

function reconcileGroup(
  session: ExpansionSession,
  options: ExpansionOptions,
  group: WorkspaceMessageAuthorGroup,
  focusKey: string,
): ExpansionSession {
  let next = session;
  const first = group.messages[0];
  if (first == null) return next;
  let preference = preferenceFor(group, next.preferences);
  const focused =
    next.focusKey !== focusKey &&
    group.messages.some((item) => item.key === options.focusedMessageTarget?.messageUuid);
  if (focused) {
    next = applyPreference(next, [group], "manual", true);
    next = { ...next, focusKey };
    preference = preferenceFor(group, next.preferences);
  } else if (
    preference == null &&
    next.ready &&
    options.liveEnabled &&
    group.messages.every((item) => !next.seen.has(item.key)) &&
    (next.latest == null || compareMessagesByCreatedAtThenKey(first, next.latest) > 0)
  ) {
    next = applyPreference(next, [group], "auto", true);
    preference = preferenceFor(group, next.preferences);
  }
  // Every new member inherits the same choice, including after pagination or a split.
  if (
    preference != null &&
    group.messages.some((item) => next.preferences.get(item.key) !== preference)
  ) {
    const preferences = new Map(next.preferences);
    for (const item of group.messages) preferences.set(item.key, preference);
    next = { ...next, preferences };
  }
  return next;
}

function reconcileSession(
  session: ExpansionSession,
  options: ExpansionOptions,
  serviceGroups: readonly WorkspaceMessageAuthorGroup[],
  items: readonly WorkspaceMessageListItem[],
): ExpansionSession {
  let next = session.scope === options.scope ? session : initialSession(options.scope);
  const focusKey =
    options.focusedMessageTarget == null
      ? ""
      : `${options.focusedMessageTarget.intentId}:${options.focusedMessageTarget.messageUuid}:${options.focusedMessageTarget.focusAttempt}`;
  for (const group of serviceGroups) next = reconcileGroup(next, options, group, focusKey);
  const unseen = items.filter((item) => !next.seen.has(item.key));
  if (unseen.length > 0)
    next = { ...next, seen: new Set([...next.seen, ...unseen.map((item) => item.key)]) };
  const latest = items.at(-1);
  if (
    latest != null &&
    (next.latest == null || compareMessagesByCreatedAtThenKey(latest, next.latest) > 0)
  )
    next = { ...next, latest };
  if (options.ready && !next.ready) next = { ...next, ready: true };
  return next;
}

function hasInteraction(node: HTMLElement): boolean {
  if (node.contains(document.activeElement)) return true;
  const selection = window.getSelection();
  if (selection == null || selection.isCollapsed) return false;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    if (selection.getRangeAt(index).intersectsNode(node)) return true;
  }
  return false;
}

function collapsibleGroups(
  groups: readonly WorkspaceMessageAuthorGroup[],
  preferences: ReadonlyMap<string, Preference>,
  items: readonly WorkspaceMessageListItem[],
  currentUserUuid: string,
  actions: ExpansionOptions["actions"],
): WorkspaceMessageAuthorGroup[] {
  return groups.filter((group) => {
    const preference = preferenceFor(group, preferences);
    if (
      preference?.source !== "auto" ||
      !preference.expanded ||
      getWorkspaceServiceGroupStatus(group.messages, currentUserUuid, actions) != null
    )
      return false;
    const last = group.messages.at(-1);
    return (
      last != null &&
      items.some(
        (item) =>
          item.kind === "server" &&
          !isWorkspaceServiceMessage(item) &&
          compareMessagesByCreatedAtThenKey(item, last) > 0,
      )
    );
  });
}

function collapseAutomatic(
  session: ExpansionSession,
  scope: string,
  candidates: readonly WorkspaceMessageAuthorGroup[],
): ExpansionSession {
  if (session.scope !== scope) return session;
  const automatic = candidates.filter((group) => {
    const preference = preferenceFor(group, session.preferences);
    return preference?.source === "auto" && preference.expanded;
  });
  return automatic.length === 0 ? session : applyPreference(session, automatic, "auto", false);
}

export function useServiceMessageExpansion(options: ExpansionOptions) {
  const {
    dayGroups,
    items,
    scope,
    ready,
    collapseEnabled,
    selectionMode,
    scrollContainerRef,
    preserveMessageLayout,
    currentUserUuid,
    actions,
  } = options;
  const serviceGroups = useMemo(
    () =>
      dayGroups
        .flatMap((day) => day.authorGroups)
        .filter(
          (group) => group.messages[0] != null && isWorkspaceServiceMessage(group.messages[0]),
        ),
    [dayGroups],
  );
  const [session, setSession] = useState(() => initialSession(scope));
  const current = reconcileSession(session, options, serviceGroups, items);
  // Settle navigation and live arrivals before the scroll controller measures their DOM.
  if (current !== session) setSession(current);
  const eligibleGroups = useMemo(
    () => collapsibleGroups(serviceGroups, current.preferences, items, currentUserUuid, actions),
    [actions, current.preferences, currentUserUuid, items, serviceGroups],
  );

  const toggle = useCallback(
    (group: WorkspaceMessageAuthorGroup) => {
      setSession((previous) => {
        if (previous.scope !== scope) return previous;
        return applyPreference(
          previous,
          [group],
          "manual",
          !preferenceFor(group, previous.preferences)?.expanded,
        );
      });
    },
    [scope],
  );
  useEffect(() => {
    const root = scrollContainerRef.current;
    if (root == null || !ready || !collapseEnabled || selectionMode || eligibleGroups.length === 0)
      return;
    let frame: number | null = null;
    const inspect = () => {
      frame = null;
      const rootRect = root.getBoundingClientRect();
      if (rootRect.height <= 0) return;
      const candidates = eligibleGroups.filter((group) => {
        const first = group.messages[0];
        const node =
          first == null
            ? null
            : findWorkspaceMessageNode(root, first.key)?.closest<HTMLElement>(
                "[data-service-message-group]",
              );
        return (
          node != null &&
          node.getBoundingClientRect().bottom <= rootRect.top &&
          !hasInteraction(node)
        );
      });
      if (candidates.length === 0) return;
      if (!preserveMessageLayout()) return;
      // A queued inspection must never override a newer explicit choice.
      const applyCollapse = (previous: ExpansionSession) =>
        collapseAutomatic(previous, scope, candidates);
      // Commit the height change and its scroll compensation in the same frame.
      flushSync(() => setSession(applyCollapse));
    };
    const schedule = () => {
      frame ??= requestAnimationFrame(inspect);
    };
    root.addEventListener("scroll", schedule, { passive: true });
    root.addEventListener("focusout", schedule);
    document.addEventListener("selectionchange", schedule);
    window.addEventListener("resize", schedule);
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    resizeObserver?.observe(root);
    schedule();
    return () => {
      if (frame != null) cancelAnimationFrame(frame);
      root.removeEventListener("scroll", schedule);
      root.removeEventListener("focusout", schedule);
      document.removeEventListener("selectionchange", schedule);
      window.removeEventListener("resize", schedule);
      resizeObserver?.disconnect();
    };
  }, [
    collapseEnabled,
    eligibleGroups,
    preserveMessageLayout,
    ready,
    scrollContainerRef,
    scope,
    selectionMode,
  ]);

  return {
    layoutKey: current.preferences,
    isExpanded: (group: WorkspaceMessageAuthorGroup) =>
      selectionMode || preferenceFor(group, current.preferences)?.expanded === true,
    toggle,
  };
}

import { normalizeWorkspaceRestEvent as defaultNormalizeWorkspaceRestEvent } from "~/shared/api/messenger-realtime.api";
import type {
  WorkspaceMessengerEpochDto,
  WorkspaceMessengerEpochVersion,
  WorkspaceMessengerRealtimeEventDto,
  WorkspaceRealtimeEvent,
} from "~/shared/api/messenger.types";
import type {
  GetWorkspaceEventsQuery,
  WorkspaceClientOptions,
  WorkspaceCollectionPage,
} from "~/shared/api/workspace-client";
import {
  getEpoch as defaultGetEpoch,
  getEventsPage as defaultGetEventsPage,
} from "~/shared/api/workspace-client";
import type {
  WorkspaceRealtimeCursorOwner,
  WorkspaceRealtimeCursor,
  WorkspaceRealtimeDurableCursorStorage,
} from "./workspace-realtime-cursor.lib";

export type WorkspaceRealtimeCatchUpSurface = "active" | "background";

export type WorkspaceRealtimeCatchUpSkipReason =
  | "duplicate_epoch"
  | "unsupported_event"
  | "stale_owner";

export interface WorkspaceRealtimeCatchUpOwner extends WorkspaceRealtimeCursorOwner {
  runtimeGeneration: number;
}

export interface WorkspaceRealtimeCatchUpContext {
  owner: WorkspaceRealtimeCatchUpOwner;
  ownerKey: string;
  surface: WorkspaceRealtimeCatchUpSurface;
  source: "catch_up";
  signal?: AbortSignal;
}

export interface WorkspaceRealtimeCatchUpSkippedEvent {
  epoch_version: WorkspaceMessengerEpochVersion;
}

export interface WorkspaceRealtimeCatchUpApplier {
  applyEvent(event: WorkspaceRealtimeEvent, context: WorkspaceRealtimeCatchUpContext): unknown;
  skipEvent(
    event: WorkspaceRealtimeEvent | WorkspaceRealtimeCatchUpSkippedEvent,
    reason: WorkspaceRealtimeCatchUpSkipReason,
    context: WorkspaceRealtimeCatchUpContext,
  ): unknown;
}

export interface WorkspaceRealtimeCatchUpResult {
  startedFrom: WorkspaceRealtimeCursor;
  lastCursor: WorkspaceRealtimeCursor;
  appliedCount: number;
  skippedCount: number;
  isStale: boolean;
}

export interface WorkspaceRealtimeCatchUpOptions {
  owner: WorkspaceRealtimeCatchUpOwner;
  ownerKey: string;
  surface: WorkspaceRealtimeCatchUpSurface;
  clientOptions: WorkspaceClientOptions;
  cursorStorage: WorkspaceRealtimeDurableCursorStorage;
  applier: WorkspaceRealtimeCatchUpApplier;
  isOwnerCurrent?: (owner: WorkspaceRealtimeCatchUpOwner) => boolean;
  pageLimit?: number;
  getEpoch?: (options: WorkspaceClientOptions) => Promise<WorkspaceMessengerEpochDto>;
  getEventsPage?: (
    options: WorkspaceClientOptions,
    query: GetWorkspaceEventsQuery,
  ) => Promise<WorkspaceCollectionPage<WorkspaceMessengerRealtimeEventDto>>;
  normalizeRestEvent?: (event: WorkspaceMessengerRealtimeEventDto) => WorkspaceRealtimeEvent | null;
}

const DEFAULT_CATCH_UP_PAGE_LIMIT = 100;

function compareEventsByEpochVersion(
  left: WorkspaceMessengerRealtimeEventDto,
  right: WorkspaceMessengerRealtimeEventDto,
): number {
  return left.epoch_version - right.epoch_version;
}

function isSignalAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function isCatchUpOwnerCurrent(options: WorkspaceRealtimeCatchUpOptions): boolean {
  // Догонка может завершиться уже после смены проекта/поколения runtime.
  // Перед каждой записью проверяем owner, чтобы старый запрос не кормил новый store.
  if (isSignalAborted(options.clientOptions.signal)) return false;
  return options.isOwnerCurrent?.(options.owner) ?? true;
}

async function resolveStartCursor(
  options: WorkspaceRealtimeCatchUpOptions,
): Promise<WorkspaceRealtimeCursor> {
  const storedCursor = options.cursorStorage.read(options.owner);
  if (storedCursor != null) {
    return storedCursor;
  }

  // Если cursor ещё не создан, фиксируем актуальную пару с сервера.
  // Браузер не создаёт старый числовой cursor и не пытается угадать generation.
  const getEpoch = options.getEpoch ?? defaultGetEpoch;
  const epoch = await getEpoch(options.clientOptions);
  const cursor = {
    epochGeneration: epoch.epoch_generation,
    epochVersion: epoch.epoch_version,
  };
  options.cursorStorage.write(options.owner, cursor);
  return cursor;
}

function advanceCursor(
  options: WorkspaceRealtimeCatchUpOptions,
  cursor: WorkspaceRealtimeCursor,
): WorkspaceRealtimeCursor {
  options.cursorStorage.write(options.owner, cursor);
  return options.cursorStorage.read(options.owner) ?? cursor;
}

export async function catchUpWorkspaceRealtime(
  options: WorkspaceRealtimeCatchUpOptions,
): Promise<WorkspaceRealtimeCatchUpResult> {
  const getEventsPage = options.getEventsPage ?? defaultGetEventsPage;
  const normalizeRestEvent = options.normalizeRestEvent ?? defaultNormalizeWorkspaceRestEvent;
  const context: WorkspaceRealtimeCatchUpContext = {
    owner: options.owner,
    ownerKey: options.ownerKey,
    surface: options.surface,
    source: "catch_up",
    signal: options.clientOptions.signal,
  };

  const startCursor = await resolveStartCursor(options);
  let lastCursor = startCursor;
  let pageMarker: string | number | undefined;
  let appliedCount = 0;
  let skippedCount = 0;

  do {
    if (!isCatchUpOwnerCurrent(options)) {
      // Устаревший owner не двигает state и durable cursor: это уже другой project-runtime.
      return {
        startedFrom: startCursor,
        lastCursor,
        appliedCount,
        skippedCount,
        isStale: true,
      };
    }

    const page = await getEventsPage(options.clientOptions, {
      afterEpochVersion: lastCursor.epochVersion,
      epochGeneration: startCursor.epochGeneration,
      pageLimit: options.pageLimit ?? DEFAULT_CATCH_UP_PAGE_LIMIT,
      pageMarker,
    });

    for (const eventDto of [...page.items].sort(compareEventsByEpochVersion)) {
      // Сервер может вернуть страницу не в нужном порядке, а cursor должен двигаться строго вперёд.
      if (!isCatchUpOwnerCurrent(options)) {
        return {
          startedFrom: startCursor,
          lastCursor,
          appliedCount,
          skippedCount,
          isStale: true,
        };
      }

      if (eventDto.epoch_version <= lastCursor.epochVersion) {
        const skippedEvent = normalizeRestEvent(eventDto) ?? {
          epoch_version: eventDto.epoch_version,
        };
        await options.applier.skipEvent(skippedEvent, "duplicate_epoch", context);
        skippedCount += 1;
        continue;
      }

      const event = normalizeRestEvent(eventDto);
      if (event == null) {
        // Неизвестный тип события не должен блокировать realtime навсегда.
        // Cursor двигаем, а доменный слой получает skip для диагностики.
        await options.applier.skipEvent(
          { epoch_version: eventDto.epoch_version },
          "unsupported_event",
          context,
        );
        skippedCount += 1;
        lastCursor = advanceCursor(options, {
          epochGeneration: startCursor.epochGeneration,
          epochVersion: eventDto.epoch_version,
        });
        continue;
      }

      await options.applier.applyEvent(event, context);
      appliedCount += 1;
      lastCursor = advanceCursor(options, {
        epochGeneration: startCursor.epochGeneration,
        epochVersion: event.epoch_version,
      });
    }

    pageMarker = page.nextPageMarker ?? undefined;
  } while (pageMarker != null);

  return {
    startedFrom: startCursor,
    lastCursor,
    appliedCount,
    skippedCount,
    isStale: false,
  };
}

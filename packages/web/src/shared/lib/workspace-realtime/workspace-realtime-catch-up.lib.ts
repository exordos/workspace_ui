import {
  getEpoch as defaultGetEpoch,
  getEventsPage as defaultGetEventsPage,
  normalizeWorkspaceRestEvent as defaultNormalizeWorkspaceRestEvent,
} from "~/shared/api/messenger-realtime.api";
import type {
  MessengerClientOptions,
  MessengerCollectionPage,
  GetEventsQuery,
} from "~/shared/api/messenger-realtime.api";
import type {
  WorkspaceMessengerEpochDto,
  WorkspaceMessengerEpochVersion,
  WorkspaceMessengerEventDto,
  WorkspaceRealtimeEvent,
} from "~/shared/api/messenger.types";
import type {
  WorkspaceRealtimeCursorOwner,
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
  startedFrom: WorkspaceMessengerEpochVersion;
  lastEpochVersion: WorkspaceMessengerEpochVersion;
  appliedCount: number;
  skippedCount: number;
  isStale: boolean;
}

export interface WorkspaceRealtimeCatchUpOptions {
  owner: WorkspaceRealtimeCatchUpOwner;
  ownerKey: string;
  surface: WorkspaceRealtimeCatchUpSurface;
  clientOptions: MessengerClientOptions;
  cursorStorage: WorkspaceRealtimeDurableCursorStorage;
  applier: WorkspaceRealtimeCatchUpApplier;
  isOwnerCurrent?: (owner: WorkspaceRealtimeCatchUpOwner) => boolean;
  pageLimit?: number;
  getEpoch?: (options: MessengerClientOptions) => Promise<WorkspaceMessengerEpochDto>;
  getEventsPage?: (
    options: MessengerClientOptions,
    query: GetEventsQuery,
  ) => Promise<MessengerCollectionPage<WorkspaceMessengerEventDto>>;
  normalizeRestEvent?: (event: WorkspaceMessengerEventDto) => WorkspaceRealtimeEvent | null;
}

const DEFAULT_CATCH_UP_PAGE_LIMIT = 100;

function compareEventsByEpochVersion(
  left: WorkspaceMessengerEventDto,
  right: WorkspaceMessengerEventDto,
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
): Promise<WorkspaceMessengerEpochVersion> {
  const storedCursor = options.cursorStorage.read(options.owner);
  if (storedCursor != null) {
    return storedCursor;
  }

  // Если cursor ещё не создан, начинаем с текущей epoch сервера.
  // Это не загружает всю историю проекта, а только фиксирует точку старта live-событий.
  const getEpoch = options.getEpoch ?? defaultGetEpoch;
  const epoch = await getEpoch(options.clientOptions);
  options.cursorStorage.write(options.owner, epoch.epoch_version);
  return epoch.epoch_version;
}

function advanceCursor(
  options: WorkspaceRealtimeCatchUpOptions,
  epochVersion: WorkspaceMessengerEpochVersion,
): WorkspaceMessengerEpochVersion {
  options.cursorStorage.write(options.owner, epochVersion);
  return options.cursorStorage.read(options.owner) ?? epochVersion;
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
  let lastEpochVersion = startCursor;
  let pageMarker: string | number | undefined;
  let appliedCount = 0;
  let skippedCount = 0;

  do {
    if (!isCatchUpOwnerCurrent(options)) {
      // Устаревший owner не двигает state и durable cursor: это уже другой project-runtime.
      return {
        startedFrom: startCursor,
        lastEpochVersion,
        appliedCount,
        skippedCount,
        isStale: true,
      };
    }

    const page = await getEventsPage(options.clientOptions, {
      afterEpochVersion: startCursor,
      pageLimit: options.pageLimit ?? DEFAULT_CATCH_UP_PAGE_LIMIT,
      pageMarker,
    });

    for (const eventDto of [...page.items].sort(compareEventsByEpochVersion)) {
      // Сервер может вернуть страницу не в нужном порядке, а cursor должен двигаться строго вперёд.
      if (!isCatchUpOwnerCurrent(options)) {
        return {
          startedFrom: startCursor,
          lastEpochVersion,
          appliedCount,
          skippedCount,
          isStale: true,
        };
      }

      if (eventDto.epoch_version <= lastEpochVersion) {
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
        lastEpochVersion = advanceCursor(options, eventDto.epoch_version);
        continue;
      }

      await options.applier.applyEvent(event, context);
      appliedCount += 1;
      lastEpochVersion = advanceCursor(options, event.epoch_version);
    }

    pageMarker = page.nextPageMarker ?? undefined;
  } while (pageMarker != null);

  return {
    startedFrom: startCursor,
    lastEpochVersion,
    appliedCount,
    skippedCount,
    isStale: false,
  };
}

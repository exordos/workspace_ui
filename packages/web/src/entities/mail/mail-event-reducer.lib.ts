import { parseProviderDeliveryMeta } from "~/shared/lib/provider-delivery.lib";
import type { WorkspaceEvent } from "~/shared/types/workspace-event";
import {
  mapWorkspaceMailFolder,
  mapWorkspaceMailMessage,
  type WorkspaceMailFolder,
  type WorkspaceMailMessage,
} from "./mail.api";
import type { MailFolder, MailMessageDetail, MailMessageSummary } from "./mail.types";

export interface MailEventState {
  folders: MailFolder[];
  messages: MailMessageSummary[];
  selectedFolder: string;
  selectedUid: string | null;
  selectedMessage: MailMessageDetail | null;
}

export interface MailEventReduction {
  complete: boolean;
  patch: Partial<MailEventState>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function isNullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isFullFolder(
  value: Record<string, unknown>,
): value is Record<string, unknown> & WorkspaceMailFolder {
  return (
    typeof value.uuid === "string" &&
    typeof value.path === "string" &&
    typeof value.name === "string" &&
    typeof value.delimiter === "string" &&
    parseProviderDeliveryMeta(value) !== undefined
  );
}

function isFullMessage(
  value: Record<string, unknown>,
): value is Record<string, unknown> & WorkspaceMailMessage {
  return (
    typeof value.uuid === "string" &&
    typeof value.folder_uuid === "string" &&
    typeof value.from_address === "string" &&
    isStringArray(value.to_addresses) &&
    isStringArray(value.cc_addresses) &&
    typeof value.subject === "string" &&
    typeof value.snippet === "string" &&
    isNullableString(value.body_html) &&
    isNullableString(value.body_text) &&
    isNullableString(value.message_id) &&
    isNullableString(value.reply_to) &&
    isNullableString(value.references) &&
    typeof value.sent_at === "string" &&
    typeof value.seen === "boolean" &&
    typeof value.flagged === "boolean" &&
    parseProviderDeliveryMeta(value) !== undefined
  );
}

function upsertByUuid(folders: MailFolder[], folder: MailFolder): MailFolder[] {
  const index = folders.findIndex((item) => item.uuid === folder.uuid);
  if (index < 0) return [...folders, folder];
  return folders.map((item, itemIndex) => (itemIndex === index ? folder : item));
}

function upsertMessage(
  messages: MailMessageSummary[],
  message: MailMessageDetail,
): MailMessageSummary[] {
  const index = messages.findIndex((item) => item.uid === message.uid);
  if (index < 0) return [message, ...messages];
  return messages.map((item, itemIndex) => (itemIndex === index ? message : item));
}

function objectTypeMatchesMailKind(event: WorkspaceEvent): boolean {
  if (event.payload.kind.startsWith("mail.folder.")) {
    return event.object_type === "mail_folder";
  }
  if (event.payload.kind.startsWith("mail.message.")) {
    return event.object_type === "mail_message";
  }
  return false;
}

export function reduceMailWorkspaceEvent(
  state: MailEventState,
  event: WorkspaceEvent,
): MailEventReduction {
  if (!isRecord(event.payload) || !objectTypeMatchesMailKind(event)) {
    return { complete: false, patch: {} };
  }
  const resource = event.payload;

  switch (event.payload.kind) {
    case "mail.folder.created":
    case "mail.folder.updated": {
      if (!isFullFolder(resource)) return { complete: false, patch: {} };
      const previous = state.folders.find((folder) => folder.uuid === resource.uuid);
      const folder = mapWorkspaceMailFolder(resource);
      return {
        complete: true,
        patch: {
          folders: upsertByUuid(state.folders, folder),
          ...(previous?.path === state.selectedFolder ? { selectedFolder: folder.path } : {}),
        },
      };
    }
    case "mail.folder.deleted": {
      if (typeof resource.uuid !== "string") return { complete: false, patch: {} };
      const deleted = state.folders.find((folder) => folder.uuid === resource.uuid);
      return {
        complete: true,
        patch: {
          folders: state.folders.filter((folder) => folder.uuid !== resource.uuid),
          ...(deleted?.path === state.selectedFolder
            ? {
                selectedFolder: "INBOX",
                messages: [],
                selectedUid: null,
                selectedMessage: null,
              }
            : {}),
        },
      };
    }
    case "mail.message.created":
    case "mail.message.updated": {
      if (!isFullMessage(resource)) return { complete: false, patch: {} };
      const selectedFolderUuid = state.folders.find(
        (folder) => folder.path === state.selectedFolder,
      )?.uuid;
      if (selectedFolderUuid == null) return { complete: false, patch: {} };
      const message = mapWorkspaceMailMessage(resource);
      if (resource.folder_uuid !== selectedFolderUuid) {
        return {
          complete: true,
          patch: {
            messages: state.messages.filter((item) => item.uid !== message.uid),
            ...(state.selectedUid === message.uid
              ? { selectedUid: null, selectedMessage: null }
              : {}),
          },
        };
      }
      return {
        complete: true,
        patch: {
          messages: upsertMessage(state.messages, message),
          ...(state.selectedUid === message.uid ? { selectedMessage: message } : {}),
        },
      };
    }
    case "mail.message.deleted": {
      if (typeof resource.uuid !== "string") return { complete: false, patch: {} };
      return {
        complete: true,
        patch: {
          messages: state.messages.filter((message) => message.uid !== resource.uuid),
          ...(state.selectedUid === resource.uuid
            ? { selectedUid: null, selectedMessage: null }
            : {}),
        },
      };
    }
    default:
      return { complete: false, patch: {} };
  }
}

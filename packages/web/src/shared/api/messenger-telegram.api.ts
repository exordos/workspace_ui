import { messengerRequestJsonResult, parseDto } from "./messenger-transport.internal";
import type { MessengerClientOptions } from "./messenger-transport.internal";

export interface TelegramDialog {
  peer_key: string;
  title: string;
  peer_kind: "user" | "chat" | "channel";
  can_send: boolean;
  forum: boolean;
  selected: boolean;
  history_done: boolean;
  imported_messages: number;
  imported_files: number;
  imported_bytes: number;
}

export interface TelegramAuthSnapshot {
  history_enabled?: boolean;
  state:
    | "disconnected"
    | "starting"
    | "qr_pending"
    | "password_required"
    | "authorized"
    | "expired";
  generation: string | null;
  qr_url?: string;
  expires_at?: string;
  error_code?: string | null;
  dialogs: TelegramDialog[];
}

export interface TelegramAuthRequest {
  operation: "start" | "status" | "password" | "cancel";
  generation?: string;
  password?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDialog(value: unknown): value is TelegramDialog {
  return (
    isRecord(value) &&
    typeof value.peer_key === "string" &&
    typeof value.title === "string" &&
    ["user", "chat", "channel"].includes(String(value.peer_kind)) &&
    ["can_send", "forum", "selected", "history_done"].every(
      (key) => typeof value[key] === "boolean",
    ) &&
    ["imported_messages", "imported_files", "imported_bytes"].every(
      (key) => typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0,
    )
  );
}

function isAuthSnapshot(value: unknown): value is TelegramAuthSnapshot {
  return (
    isRecord(value) &&
    [
      "disconnected",
      "starting",
      "qr_pending",
      "password_required",
      "authorized",
      "expired",
    ].includes(String(value.state)) &&
    (value.generation === null || typeof value.generation === "string") &&
    (value.qr_url === undefined ||
      (typeof value.qr_url === "string" && value.qr_url.startsWith("tg://login?token="))) &&
    (value.history_enabled === undefined || typeof value.history_enabled === "boolean") &&
    Array.isArray(value.dialogs) &&
    value.dialogs.every(isDialog)
  );
}

export async function telegramAuth(
  options: MessengerClientOptions,
  accountUuid: string,
  body: TelegramAuthRequest,
): Promise<TelegramAuthSnapshot> {
  const { data } = await messengerRequestJsonResult(
    "POST",
    `/external_accounts/${accountUuid}/actions/telegram_auth/invoke`,
    options,
    {},
    body,
  );
  return parseDto(data, isAuthSnapshot, "Telegram connection status");
}

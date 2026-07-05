/**
 * Current user's external messenger account API.
 */

import {
  getMessengerGatewayApiBaseForCurrentInstance,
  messengerApi,
  type ApiResponse,
} from "~/shared/api/client";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import type {
  SaveExternalAccountErrorKind,
  SaveZulipExternalAccountInput,
  SaveZulipExternalAccountResult,
  UnlinkZulipExternalAccountResult,
  ZulipExternalAccount,
} from "./external-accounts.types";

const log = createLogger("external-accounts:api");
const EXTERNAL_ACCOUNTS_PATH = "/external_accounts/";
const ZULIP_ACCOUNT_TYPE = "zulip";

interface RawExternalAccount {
  uuid?: unknown;
  external_user_id?: unknown;
  server_url?: unknown;
  account_type?: unknown;
  status?: unknown;
  account_settings?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function readRows(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (!isRecord(data)) {
    return [];
  }
  if (Array.isArray(data.results)) {
    return data.results;
  }
  if (Array.isArray(data.items)) {
    return data.items;
  }
  return [];
}

function readString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function mapExternalAccount(raw: unknown): ZulipExternalAccount | null {
  if (!isRecord(raw)) {
    return null;
  }
  const row = raw as RawExternalAccount;
  const uuid = readString(row.uuid);
  const externalUserId = readString(row.external_user_id);
  const accountType = readString(row.account_type) ?? ZULIP_ACCOUNT_TYPE;
  const status = readString(row.status);
  const settings = isRecord(row.account_settings) ? row.account_settings : null;
  const credentials = isRecord(settings?.credentials) ? settings.credentials : settings;
  const userInfoRaw = isRecord(settings?.user_info) ? settings.user_info : null;
  const kind = readString(settings?.kind) ?? ZULIP_ACCOUNT_TYPE;
  const credentialsKind = readString(credentials?.kind) ?? ZULIP_ACCOUNT_TYPE;
  const login = readString(credentials?.login) ?? readString(userInfoRaw?.email);
  const serverUrl = readString(row.server_url) ?? readString(credentials?.server_url) ?? "";
  const userInfoKind = readString(userInfoRaw?.kind) ?? ZULIP_ACCOUNT_TYPE;
  const userId = readNumber(userInfoRaw?.user_id);
  const role = readNumber(userInfoRaw?.role) ?? null;
  if (
    uuid == null ||
    accountType !== ZULIP_ACCOUNT_TYPE ||
    kind !== ZULIP_ACCOUNT_TYPE ||
    credentialsKind !== ZULIP_ACCOUNT_TYPE ||
    login == null
  ) {
    return null;
  }
  const createdAt = readString(row.created_at);
  const updatedAt = readString(row.updated_at);
  return {
    uuid,
    accountType,
    accountSettings: {
      kind: ZULIP_ACCOUNT_TYPE,
      login,
      serverUrl,
      ...(userInfoRaw != null && userId != null && userInfoKind === ZULIP_ACCOUNT_TYPE
        ? {
            userInfo: {
              kind: ZULIP_ACCOUNT_TYPE,
              userId,
              role,
            },
          }
        : {}),
    },
    ...(externalUserId != null ? { externalUserId } : {}),
    ...(status === "new" || status === "active" ? { status } : {}),
    ...(createdAt != null ? { createdAt } : {}),
    ...(updatedAt != null ? { updatedAt } : {}),
  };
}

function externalAccountPath(uuid: string): string {
  return `${EXTERNAL_ACCOUNTS_PATH}${encodeURIComponent(uuid)}`;
}

function mapMutationError(status: number): SaveExternalAccountErrorKind {
  if (status === 403) return "forbidden";
  if (status === 409) return "conflict";
  if (status === 400 || status === 422) return "invalid";
  return "transient";
}

function buildZulipPayload(input: SaveZulipExternalAccountInput): {
  account_type: "zulip";
  server_url: string;
  account_settings: {
    kind: "zulip";
    credentials: {
      kind: "zulip";
      login: string;
      token: string;
    };
  };
} {
  return {
    account_type: ZULIP_ACCOUNT_TYPE,
    server_url: guard.nonEmpty(input.serverUrl, "zulip server url").trim(),
    account_settings: {
      kind: ZULIP_ACCOUNT_TYPE,
      credentials: {
        kind: ZULIP_ACCOUNT_TYPE,
        login: guard.nonEmpty(input.login, "zulip login").trim(),
        token: guard.nonEmpty(input.token, "zulip token").trim(),
      },
    },
  };
}

function assertOkResponse(response: ApiResponse): response is ApiResponse & { ok: true } {
  return response.ok;
}

export async function fetchZulipExternalAccount(options?: {
  signal?: AbortSignal;
}): Promise<ZulipExternalAccount | null> {
  try {
    const response = await messengerApi.getWithBase(
      getMessengerGatewayApiBaseForCurrentInstance(),
      EXTERNAL_ACCOUNTS_PATH,
      { account_type: ZULIP_ACCOUNT_TYPE },
      options?.signal,
    );
    if (!response.ok) {
      log.warn("Failed to fetch external accounts", { status: response.status });
      return null;
    }
    for (const row of readRows(response.data)) {
      const account = mapExternalAccount(row);
      if (account != null) {
        return account;
      }
    }
    return null;
  } catch (error) {
    if (options?.signal?.aborted) {
      throw error;
    }
    log.warn("External account fetch error", { error: String(error) });
    return null;
  }
}

export async function saveZulipExternalAccount(
  input: SaveZulipExternalAccountInput,
): Promise<SaveZulipExternalAccountResult> {
  const payload = buildZulipPayload(input);
  try {
    const response =
      input.uuid == null
        ? await messengerApi.postJsonWithBase(
            getMessengerGatewayApiBaseForCurrentInstance(),
            EXTERNAL_ACCOUNTS_PATH,
            payload,
          )
        : await messengerApi.putJsonWithBase(
            getMessengerGatewayApiBaseForCurrentInstance(),
            externalAccountPath(input.uuid),
            payload,
          );
    if (!assertOkResponse(response)) {
      log.warn("Failed to save external account", { status: response.status });
      return { ok: false, kind: mapMutationError(response.status) };
    }
    const account = mapExternalAccount(response.data);
    if (account == null) {
      log.warn("External account save returned invalid payload", {});
      return { ok: false, kind: "transient" };
    }
    log.info("External account saved", { accountType: account.accountType, uuid: account.uuid });
    return { ok: true, account };
  } catch (error) {
    log.warn("External account save error", { error: String(error) });
    return { ok: false, kind: "transient" };
  }
}

export async function unlinkZulipExternalAccount(
  uuid: string,
): Promise<UnlinkZulipExternalAccountResult> {
  const accountUuid = guard.nonEmpty(uuid, "external account uuid").trim();
  try {
    const response = await messengerApi.deleteWithBase(
      getMessengerGatewayApiBaseForCurrentInstance(),
      externalAccountPath(accountUuid),
    );
    if (!assertOkResponse(response)) {
      log.warn("Failed to unlink external account", { status: response.status });
      return { ok: false, kind: mapMutationError(response.status) };
    }
    log.info("External account unlinked", { uuid: accountUuid });
    return { ok: true };
  } catch (error) {
    log.warn("External account unlink error", { error: String(error) });
    return { ok: false, kind: "transient" };
  }
}

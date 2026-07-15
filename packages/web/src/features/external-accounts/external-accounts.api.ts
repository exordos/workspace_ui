/**
 * Current user's external messenger account API.
 */

import {
  getWorkspaceCommonApiBaseForCurrentInstance,
  messengerApi,
  type ApiResponse,
} from "~/shared/api/client";
import { guard } from "~/shared/lib/guards";
import { createLogger } from "~/shared/lib/logger";
import type {
  SaveExternalAccountErrorKind,
  CalendarExternalAccount,
  MailExternalAccount,
  SaveCalendarExternalAccountInput,
  SaveGroupwareExternalAccountResult,
  SaveMailExternalAccountInput,
  SaveZulipExternalAccountInput,
  SaveZulipExternalAccountResult,
  UnlinkZulipExternalAccountResult,
  ZulipExternalAccount,
  WorkspaceProvider,
} from "./external-accounts.types";

const log = createLogger("external-accounts:api");
const EXTERNAL_ACCOUNTS_PATH = "/external_users/";
const ZULIP_ACCOUNT_TYPE = "zulip";
const PROVIDERS_PATH = "/providers/";

interface RawExternalAccount {
  uuid?: unknown;
  external_user_id?: unknown;
  server_url?: unknown;
  account_type?: unknown;
  status?: unknown;
  account_settings?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  access_status?: unknown;
  access_last_error?: unknown;
  provider_uuid?: unknown;
}

interface RawWorkspaceProvider {
  uuid?: unknown;
  name?: unknown;
  supported_kinds?: unknown;
  version?: unknown;
  enabled?: unknown;
}

function readPort(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 65535
    ? value
    : fallback;
}

function readSecurity(value: unknown, fallback: "tls" | "starttls" | "plain") {
  return value === "tls" || value === "starttls" || value === "plain" ? value : fallback;
}

function readAccessStatus(value: unknown) {
  if (
    value === "pending" ||
    value === "missing_credentials" ||
    value === "confirmed" ||
    value === "invalid_credentials" ||
    value === "unavailable"
  ) {
    return value;
  }
  return "pending" as const;
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
  const providerUuid = readString(row.provider_uuid);
  const externalUserId = readString(row.external_user_id);
  const accountType = readString(row.account_type) ?? ZULIP_ACCOUNT_TYPE;
  const status = readString(row.status);
  const settings = isRecord(row.account_settings) ? row.account_settings : null;
  const credentials = isRecord(settings?.credentials) ? settings.credentials : null;
  const userInfoRaw = isRecord(settings?.user_info) ? settings.user_info : null;
  const kind = readString(settings?.kind) ?? ZULIP_ACCOUNT_TYPE;
  const credentialsKind =
    credentials == null ? ZULIP_ACCOUNT_TYPE : (readString(credentials.kind) ?? ZULIP_ACCOUNT_TYPE);
  const credentialsLogin = readString(credentials?.login);
  const login = credentialsLogin ?? readString(userInfoRaw?.email) ?? "";
  const accessStatus = readAccessStatus(row.access_status);
  const hasCredentials =
    (credentials != null && credentialsLogin != null) || accessStatus !== "missing_credentials";
  const serverUrl =
    readString(row.server_url) ??
    readString(credentials?.server_url) ??
    readString(settings?.server_url) ??
    "";
  const userInfoKind = readString(userInfoRaw?.kind) ?? ZULIP_ACCOUNT_TYPE;
  const userId = readNumber(userInfoRaw?.user_id);
  const role = readNumber(userInfoRaw?.role) ?? null;
  if (
    uuid == null ||
    providerUuid == null ||
    accountType !== ZULIP_ACCOUNT_TYPE ||
    kind !== ZULIP_ACCOUNT_TYPE ||
    credentialsKind !== ZULIP_ACCOUNT_TYPE
  ) {
    return null;
  }
  const createdAt = readString(row.created_at);
  const updatedAt = readString(row.updated_at);
  return {
    uuid,
    providerUuid,
    accountType,
    hasCredentials,
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

function mapMailExternalAccount(raw: unknown): MailExternalAccount | null {
  if (!isRecord(raw)) return null;
  const row = raw as RawExternalAccount;
  const settings = isRecord(row.account_settings) ? row.account_settings : null;
  const uuid = readString(row.uuid);
  const providerUuid = readString(row.provider_uuid);
  if (
    uuid == null ||
    providerUuid == null ||
    row.account_type !== "mail" ||
    settings?.kind !== "mail"
  )
    return null;
  return {
    uuid,
    providerUuid,
    accountType: "mail",
    serverUrl: readString(row.server_url) ?? "",
    email: readString(settings.email) ?? "",
    imapHost: readString(settings.imap_host) ?? "",
    imapPort: readPort(settings.imap_port, 993),
    imapSecurity: readSecurity(settings.imap_security, "tls"),
    smtpHost: readString(settings.smtp_host) ?? "",
    smtpPort: readPort(settings.smtp_port, 465),
    smtpSecurity: readSecurity(settings.smtp_security, "tls"),
    accessStatus: readAccessStatus(row.access_status),
    ...(readString(row.access_last_error) != null
      ? { accessLastError: readString(row.access_last_error) }
      : {}),
    ...(row.status === "new" || row.status === "active" ? { status: row.status } : {}),
  };
}

function mapCalendarExternalAccount(raw: unknown): CalendarExternalAccount | null {
  if (!isRecord(raw)) return null;
  const row = raw as RawExternalAccount;
  const settings = isRecord(row.account_settings) ? row.account_settings : null;
  const uuid = readString(row.uuid);
  const providerUuid = readString(row.provider_uuid);
  if (
    uuid == null ||
    providerUuid == null ||
    row.account_type !== "calendar" ||
    settings?.kind !== "calendar"
  )
    return null;
  return {
    uuid,
    providerUuid,
    accountType: "calendar",
    serverUrl: readString(row.server_url) ?? "",
    accessStatus: readAccessStatus(row.access_status),
    ...(readString(row.access_last_error) != null
      ? { accessLastError: readString(row.access_last_error) }
      : {}),
    ...(row.status === "new" || row.status === "active" ? { status: row.status } : {}),
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
  provider_uuid: string;
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
    provider_uuid: guard.nonEmpty(input.providerUuid, "zulip provider uuid").trim(),
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

function mapWorkspaceProvider(raw: unknown): WorkspaceProvider | null {
  if (!isRecord(raw)) return null;
  const row = raw as RawWorkspaceProvider;
  const uuid = readString(row.uuid);
  const name = readString(row.name);
  if (
    uuid == null ||
    name == null ||
    row.enabled === false ||
    !Array.isArray(row.supported_kinds)
  ) {
    return null;
  }
  const supportedKinds = row.supported_kinds.filter(
    (kind): kind is "zulip" | "mail" | "calendar" =>
      kind === "zulip" || kind === "mail" || kind === "calendar",
  );
  if (supportedKinds.length === 0) return null;
  return {
    uuid,
    name,
    supportedKinds,
    version: readString(row.version) ?? null,
  };
}

export async function fetchWorkspaceProviders(signal?: AbortSignal): Promise<WorkspaceProvider[]> {
  const response = await messengerApi.getWithBase(
    getWorkspaceCommonApiBaseForCurrentInstance(),
    PROVIDERS_PATH,
    undefined,
    signal,
  );
  if (!response.ok) {
    throw new Error(`Provider catalog request failed (${response.status})`);
  }
  return readRows(response.data)
    .map(mapWorkspaceProvider)
    .filter((provider): provider is WorkspaceProvider => provider != null);
}

function assertOkResponse(response: ApiResponse): response is ApiResponse & { ok: true } {
  return response.ok;
}

export async function fetchZulipExternalAccount(options?: {
  signal?: AbortSignal;
}): Promise<ZulipExternalAccount | null> {
  try {
    const response = await messengerApi.getWithBase(
      getWorkspaceCommonApiBaseForCurrentInstance(),
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
            getWorkspaceCommonApiBaseForCurrentInstance(),
            EXTERNAL_ACCOUNTS_PATH,
            payload,
          )
        : await messengerApi.putJsonWithBase(
            getWorkspaceCommonApiBaseForCurrentInstance(),
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
      getWorkspaceCommonApiBaseForCurrentInstance(),
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

async function fetchGroupwareAccount<T>(
  accountType: "mail" | "calendar",
  mapper: (raw: unknown) => T | null,
  signal?: AbortSignal,
): Promise<T | null> {
  try {
    const response = await messengerApi.getWithBase(
      getWorkspaceCommonApiBaseForCurrentInstance(),
      EXTERNAL_ACCOUNTS_PATH,
      { account_type: accountType },
      signal,
    );
    if (!response.ok) return null;
    for (const row of readRows(response.data)) {
      const account = mapper(row);
      if (account != null) return account;
    }
    return null;
  } catch (error) {
    if (signal?.aborted) return null;
    log.warn("Groupware external account fetch error", {
      accountType,
      error: String(error),
    });
    return null;
  }
}

async function saveGroupwareAccount<T>(
  uuid: string | undefined,
  payload: unknown,
  mapper: (raw: unknown) => T | null,
): Promise<SaveGroupwareExternalAccountResult<T>> {
  try {
    const response =
      uuid == null
        ? await messengerApi.postJsonWithBase(
            getWorkspaceCommonApiBaseForCurrentInstance(),
            EXTERNAL_ACCOUNTS_PATH,
            payload,
          )
        : await messengerApi.putJsonWithBase(
            getWorkspaceCommonApiBaseForCurrentInstance(),
            externalAccountPath(uuid),
            payload,
          );
    if (!response.ok) return { ok: false, kind: mapMutationError(response.status) };
    const account = mapper(response.data);
    return account == null ? { ok: false, kind: "transient" } : { ok: true, account };
  } catch {
    return { ok: false, kind: "transient" };
  }
}

export function fetchMailExternalAccount(
  signal?: AbortSignal,
): Promise<MailExternalAccount | null> {
  return fetchGroupwareAccount("mail", mapMailExternalAccount, signal);
}

export function fetchCalendarExternalAccount(
  signal?: AbortSignal,
): Promise<CalendarExternalAccount | null> {
  return fetchGroupwareAccount("calendar", mapCalendarExternalAccount, signal);
}

export function saveMailExternalAccount(
  input: SaveMailExternalAccountInput,
): Promise<SaveGroupwareExternalAccountResult<MailExternalAccount>> {
  const imapHost = guard.nonEmpty(input.imapHost, "IMAP host").trim();
  return saveGroupwareAccount(
    input.uuid,
    {
      provider_uuid: guard.nonEmpty(input.providerUuid, "mail provider uuid").trim(),
      server_url: `https://${imapHost}`,
      account_settings: {
        kind: "mail",
        credentials: {
          kind: "mail",
          username: guard.nonEmpty(input.username, "mail username").trim(),
          password: guard.nonEmpty(input.password, "mail password"),
        },
        email: guard.nonEmpty(input.email, "mail email").trim(),
        imap_host: imapHost,
        imap_port: input.imapPort,
        imap_security: input.imapSecurity,
        smtp_host: guard.nonEmpty(input.smtpHost, "SMTP host").trim(),
        smtp_port: input.smtpPort,
        smtp_security: input.smtpSecurity,
      },
    },
    mapMailExternalAccount,
  );
}

export function saveCalendarExternalAccount(
  input: SaveCalendarExternalAccountInput,
): Promise<SaveGroupwareExternalAccountResult<CalendarExternalAccount>> {
  return saveGroupwareAccount(
    input.uuid,
    {
      provider_uuid: guard.nonEmpty(input.providerUuid, "calendar provider uuid").trim(),
      server_url: guard.nonEmpty(input.serverUrl, "CalDAV URL").trim(),
      account_settings: {
        kind: "calendar",
        credentials: {
          kind: "calendar",
          username: guard.nonEmpty(input.username, "calendar username").trim(),
          password: guard.nonEmpty(input.password, "calendar password"),
        },
      },
    },
    mapCalendarExternalAccount,
  );
}

export async function unlinkGroupwareExternalAccount(
  uuid: string,
): Promise<UnlinkZulipExternalAccountResult> {
  return unlinkZulipExternalAccount(uuid);
}

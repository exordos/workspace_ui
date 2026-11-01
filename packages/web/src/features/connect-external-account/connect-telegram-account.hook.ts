import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { refreshExternalAccounts } from "~/entities/external-account/external-account-sync.lib";
import type { ExternalAccount } from "~/entities/external-account/external-account.types";
import { buildMessengerRequestOptions } from "~/entities/messenger/messenger-request-options.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  createExternalAccount,
  getExternalAccount,
  getExternalAccounts,
} from "~/shared/api/messenger-external-accounts.api";
import { telegramAuth, type TelegramAuthSnapshot } from "~/shared/api/messenger-telegram.api";

export function useConnectTelegramAccount(
  runtime: WorkspaceRuntimeContext | null,
  account: ExternalAccount | null,
) {
  const [accountUuid, setAccountUuid] = useState<string | null>(account?.uuid ?? null);
  const [snapshot, setSnapshot] = useState<TelegramAuthSnapshot | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const attempt = useRef(account?.uuid ?? crypto.randomUUID());
  const controller = useRef<AbortController | null>(null);
  const latest = useRef({ runtime, accountUuid, snapshot });
  latest.current = { runtime, accountUuid, snapshot };
  const options = useMemo(
    () => (runtime == null ? null : buildMessengerRequestOptions(runtime)),
    [runtime],
  );

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    return () => {
      abort.abort();
      const current = latest.current;
      if (
        current.accountUuid != null &&
        current.runtime != null &&
        current.snapshot?.generation != null &&
        current.snapshot.state !== "authorized"
      ) {
        const request = buildMessengerRequestOptions(current.runtime);
        void telegramAuth(request, current.accountUuid, {
          operation: "cancel",
          generation: current.snapshot.generation,
        }).catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (options == null || accountUuid == null) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const value = await telegramAuth({ ...options, signal: abort.signal }, accountUuid, {
          operation: "status",
        });
        if (!abort.signal.aborted) {
          setSnapshot(value);
          setError(false);
        }
      } catch {
        if (!abort.signal.aborted) setError(true);
      }
      if (!abort.signal.aborted) timer = setTimeout(() => void poll(), 1000);
    };
    void poll();
    return () => {
      abort.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [accountUuid, options]);

  const connect = useCallback(async () => {
    if (options == null || busy) return;
    setBusy(true);
    setError(false);
    const signal = controller.current?.signal;
    const request = { ...options, signal };
    try {
      let identifier = accountUuid;
      if (identifier == null) {
        const accounts = await getExternalAccounts(request);
        const existing = accounts.find(
          (item) => "provider" in item && item.provider === "telegram",
        );
        if (signal?.aborted) return;
        if (existing != null) {
          identifier = existing.uuid;
        } else {
          try {
            await createExternalAccount(request, {
              uuid: attempt.current,
              provider: "telegram",
              settings: {},
            });
          } catch (failure) {
            await getExternalAccount(request, attempt.current).catch(() => {
              throw failure;
            });
          }
          identifier = attempt.current;
        }
        if (signal?.aborted) return;
        setAccountUuid(identifier);
        if (runtime != null) await refreshExternalAccounts({ runtimeContext: runtime, signal });
      }
      const value = await telegramAuth(request, identifier, { operation: "start" });
      if (!signal?.aborted) setSnapshot(value);
    } catch {
      if (!signal?.aborted) setError(true);
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, [options, busy, accountUuid, runtime]);

  const submitPassword = useCallback(async () => {
    if (
      options == null ||
      accountUuid == null ||
      snapshot?.generation == null ||
      busy ||
      password.length === 0
    )
      return;
    const value = password;
    setPassword("");
    setBusy(true);
    setError(false);
    const signal = controller.current?.signal;
    try {
      const result = await telegramAuth({ ...options, signal }, accountUuid, {
        operation: "password",
        generation: snapshot.generation,
        password: value,
      });
      if (!signal?.aborted) setSnapshot(result);
    } catch {
      if (!signal?.aborted) setError(true);
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, [options, accountUuid, snapshot?.generation, password, busy]);

  return {
    snapshot,
    password,
    setPassword,
    busy,
    error,
    connect,
    submitPassword,
  };
}

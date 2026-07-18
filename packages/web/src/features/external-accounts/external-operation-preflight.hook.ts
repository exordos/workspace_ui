import { useCallback, useEffect, useRef, useState } from "react";
import type { ProviderSummary } from "~/shared/types/provider-delivery";
import { preflightExternalOperation } from "./external-accounts.api";
import {
  isExternalCapabilityAvailable,
  type ExternalCapabilityName,
} from "./external-capabilities.lib";

interface ExternalOperationTarget {
  type: string;
  uuid?: string | null;
}

interface RunExternalOperationPreflightInput {
  provider: ProviderSummary | null | undefined;
  action: ExternalCapabilityName;
  target: ExternalOperationTarget;
  execute: () => void | Promise<void>;
}

interface PendingExecution {
  execute: () => void | Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
}

interface ExternalOperationPreflightState {
  error: boolean;
  losses: string[] | null;
}

const EMPTY_PREFLIGHT_STATE: ExternalOperationPreflightState = {
  error: false,
  losses: null,
};

function settleExecution(
  execute: () => void | Promise<void>,
  resolve: () => void,
  reject: (error: Error) => void,
): void {
  void Promise.resolve().then(execute).then(resolve, reject);
}

function formatLosses(losses: Record<string, unknown>[]): string[] {
  return losses.map((loss) => (typeof loss.message === "string" ? loss.message : ""));
}

/** Capability-gated preflight shared by provider-projected Messenger mutations. */
export function useExternalOperationPreflight() {
  const [state, setState] = useState<ExternalOperationPreflightState>(EMPTY_PREFLIGHT_STATE);
  const [pending, setPending] = useState(false);
  const pendingExecutionRef = useRef<PendingExecution | null>(null);
  const requestVersionRef = useRef(0);

  useEffect(
    () => () => {
      requestVersionRef.current += 1;
      pendingExecutionRef.current?.reject(new Error("External operation preflight was cancelled"));
      pendingExecutionRef.current = null;
    },
    [],
  );

  const dismiss = useCallback(() => {
    requestVersionRef.current += 1;
    pendingExecutionRef.current?.reject(new Error("External operation preflight was cancelled"));
    pendingExecutionRef.current = null;
    setPending(false);
    setState(EMPTY_PREFLIGHT_STATE);
  }, []);

  const confirm = useCallback(() => {
    const pendingExecution = pendingExecutionRef.current;
    pendingExecutionRef.current = null;
    setState(EMPTY_PREFLIGHT_STATE);
    if (pendingExecution == null) return;
    settleExecution(pendingExecution.execute, pendingExecution.resolve, pendingExecution.reject);
  }, []);

  const runAwaitable = useCallback(
    (input: RunExternalOperationPreflightInput): Promise<void> =>
      new Promise((resolve, reject) => {
        if (input.provider == null) {
          settleExecution(input.execute, resolve, reject);
          return;
        }
        if (!isExternalCapabilityAvailable(input.provider.capabilities, input.action)) {
          setState({ error: true, losses: null });
          reject(new Error("External operation capability is unavailable"));
          return;
        }

        const requestVersion = requestVersionRef.current + 1;
        requestVersionRef.current = requestVersion;
        pendingExecutionRef.current?.reject(
          new Error("External operation preflight was superseded"),
        );
        pendingExecutionRef.current = null;
        setPending(true);
        setState(EMPTY_PREFLIGHT_STATE);
        void preflightExternalOperation({
          externalAccountUuid: input.provider.accountUuid,
          action: input.action,
          target: input.target,
        })
          .then((result) => {
            if (requestVersionRef.current !== requestVersion) {
              reject(new Error("External operation preflight was superseded"));
              return;
            }
            setPending(false);
            if (!result.ok || !result.value.allowed) {
              setState({ error: true, losses: null });
              reject(new Error("External operation preflight was rejected"));
              return;
            }
            if (!result.value.requiresConfirmation) {
              settleExecution(input.execute, resolve, reject);
              return;
            }
            pendingExecutionRef.current = { execute: input.execute, resolve, reject };
            setState({
              error: false,
              losses: formatLosses(result.value.losses),
            });
          })
          .catch(() => {
            if (requestVersionRef.current !== requestVersion) return;
            setPending(false);
            setState({ error: true, losses: null });
            reject(new Error("External operation preflight failed"));
          });
      }),
    [],
  );

  const run = useCallback(
    (input: RunExternalOperationPreflightInput) => {
      void runAwaitable(input).catch(() => {
        // The visible dialog reports fail-closed and cancellation outcomes to non-awaiting actions.
      });
    },
    [runAwaitable],
  );

  return {
    run,
    runAwaitable,
    pending,
    error: state.error,
    losses: state.losses,
    confirm,
    dismiss,
  };
}

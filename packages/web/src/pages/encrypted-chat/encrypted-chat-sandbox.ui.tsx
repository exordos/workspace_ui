import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  selectCurrentWorkspaceRuntimeContext,
  useWorkspaceAuthStore,
} from "~/entities/workspace-auth/workspace-auth.model";
import { workspaceRuntimeOwnerKey } from "~/entities/workspace-runtime/workspace-runtime.lib";
import type { WorkspaceRuntimeContext } from "~/entities/workspace-runtime/workspace-runtime.types";
import {
  createDevChatE2eeSandbox,
  isE2eeSandboxRuntimeAllowed,
} from "~/features/chat-e2ee-dev-sandbox/chat-e2ee-dev-sandbox.lib";
import type {
  DevChatE2eeSandbox,
  E2eeSandboxSnapshot,
} from "~/features/chat-e2ee-dev-sandbox/chat-e2ee-dev-sandbox.lib";
import { useTranslation } from "~/i18n/i18n";
import { Button } from "~/shared/ui/button";

export function EncryptedChatSandbox(): React.ReactElement {
  const { t } = useTranslation();
  const sessions = useWorkspaceAuthStore((state) => state.sessions);
  const currentAccountId = useWorkspaceAuthStore((state) => state.currentAccountId);
  const runtime = useMemo(
    () => selectCurrentWorkspaceRuntimeContext({ sessions, currentAccountId }),
    [sessions, currentAccountId],
  );
  if (!isE2eeSandboxRuntimeAllowed(runtime) || runtime === null) {
    return (
      <main id="main-content" tabIndex={-1} className="p-4">
        <h1>{t("e2eeSandbox.title")}</h1>
        <p role="note">{t("e2eeSandbox.warning")}</p>
        <p role="status">{t("e2eeSandbox.unavailable")}</p>
      </main>
    );
  }
  return (
    <RuntimeSandbox
      key={`${workspaceRuntimeOwnerKey(runtime)}:${runtime.runtimeGeneration}:${runtime.organizationOrigin}`}
      runtime={runtime}
    />
  );
}

function RuntimeSandbox({
  runtime,
}: {
  readonly runtime: WorkspaceRuntimeContext;
}): React.ReactElement {
  const { t } = useTranslation();
  // Token refresh does not discard local fixture keys; owner/generation changes remount this page.
  const [captured] = useState(runtime);
  const sandboxRef = useRef<DevChatE2eeSandbox | null>(null);
  const [snapshot, setSnapshot] = useState<E2eeSandboxSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = isE2eeSandboxRuntimeAllowed(captured);

  useEffect(() => {
    const sandbox = createDevChatE2eeSandbox({
      runtime: captured,
      getCurrentRuntime: () => useWorkspaceAuthStore.getState().getCurrentRuntimeContext(),
    });
    sandboxRef.current = sandbox;
    return () => {
      sandbox.dispose();
      if (sandboxRef.current === sandbox) sandboxRef.current = null;
    };
  }, [captured]);

  async function run(action: (sandbox: DevChatE2eeSandbox) => Promise<void>): Promise<void> {
    const sandbox = sandboxRef.current;
    if (sandbox === null || pending) return;
    setPending(true);
    setError(null);
    try {
      await action(sandbox);
    } catch (caught) {
      if (sandboxRef.current === sandbox && sandbox.isCurrent())
        setError(caught instanceof Error ? caught.message : "unavailable");
    } finally {
      if (sandboxRef.current === sandbox && sandbox.isCurrent()) {
        setSnapshot(sandbox.getSnapshot());
        setPending(false);
      }
    }
  }

  const ready = snapshot?.streamUuid != null;
  const issuer = snapshot?.device === "issuer";
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="h-full overflow-auto bg-bg p-4 text-text-primary"
    >
      <div className="mx-auto max-w-screen-md space-y-4">
        <h1 className="text-xl font-semibold">{t("e2eeSandbox.title")}</h1>
        <p role="note" className="border-danger/30 rounded-lg border p-4 text-sm text-danger">
          {t("e2eeSandbox.warning")}
        </p>
        {!allowed ? (
          <p role="status">{t("e2eeSandbox.unavailable")}</p>
        ) : (
          <>
            <p className="text-sm text-text-muted">{t("e2eeSandbox.description")}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={pending || ready}
                onClick={() => {
                  void run((sandbox) => sandbox.initialize());
                }}
              >
                {t("e2eeSandbox.create")}
              </Button>
              <Button
                appearance="outline"
                disabled={pending || !ready}
                onClick={() => {
                  void run((sandbox) => sandbox.switchDevice(issuer ? "recipient" : "issuer"));
                }}
              >
                {t("e2eeSandbox.switchDevice")}
              </Button>
              <Button
                appearance="outline"
                disabled={pending || !ready || issuer}
                onClick={() => {
                  void run((sandbox) => sandbox.requestKey());
                }}
              >
                {t("e2ee.requestAccess")}
              </Button>
              <Button
                appearance="outline"
                disabled={pending || !ready || !issuer}
                onClick={() => {
                  void run((sandbox) => sandbox.respondToRequest(false));
                }}
              >
                {t("e2ee.grantAccess")}
              </Button>
              <Button
                variant="danger"
                appearance="outline"
                disabled={pending || !ready || !issuer}
                onClick={() => {
                  void run((sandbox) => sandbox.respondToRequest(true));
                }}
              >
                {t("e2ee.rejectAccess")}
              </Button>
              <Button
                appearance="outline"
                disabled={pending || !ready}
                onClick={() => {
                  void run((sandbox) => sandbox.sendFixture());
                }}
              >
                {t("e2eeSandbox.send")}
              </Button>
              <Button
                appearance="outline"
                disabled={pending || !ready}
                onClick={() => {
                  void run((sandbox) => sandbox.reload());
                }}
              >
                {t("e2eeSandbox.reload")}
              </Button>
            </div>
            {snapshot ? (
              <p role="status" className="text-sm">
                {t("e2eeSandbox.state", {
                  device: snapshot.device,
                  access: snapshot.state?.access ?? "missing",
                  count: snapshot.messages.length,
                })}
              </p>
            ) : null}
            {pending ? <p role="status">{t("e2ee.loading")}</p> : null}
            {error ? (
              <p role="alert" className="text-danger">
                {t("e2eeSandbox.failed", { reason: error })}
              </p>
            ) : null}
            {snapshot ? (
              <ul className="space-y-2">
                {snapshot.messages.map((message) => (
                  <li
                    key={message.uuid}
                    className="rounded-lg border border-border-subtle p-3 text-sm"
                  >
                    <span>{message.kind}</span>
                    {message.kind === "e2ee" ? (
                      <p className="mt-1 text-text-muted">
                        {message.plaintext ?? t("e2ee.lockedTitle")}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </main>
  );
}

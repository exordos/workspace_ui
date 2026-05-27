/**
 * Temporary dev-only controls for manual notification testing.
 * Remove before release or gate behind a feature flag.
 */

import React, { useCallback, useState } from "react";
import { useNotificationSettingsStore } from "~/entities/notification-settings/notification-settings.model";
import { useSettingsStore } from "~/features/settings/settings.model";
import {
  attachNotificationAudioUnlock,
  playNotificationSound,
  unlockNotificationAudio,
} from "~/shared/lib/notification-sound";
import { resolveNotificationSoundPreset } from "~/shared/lib/notification-sound-preset.lib";
import { notificationService } from "~/shared/lib/notifications";
import { pushService, usePushState } from "~/shared/lib/push/push.service";
import { Button } from "~/shared/ui/button";

const DEV_TEST_TAG = "dev-notification-test";

export const TopBarNotificationDev: React.FC = () => {
  const [status, setStatus] = useState<string>("");
  const pushState = usePushState();
  const serverSettings = useNotificationSettingsStore((s) => s.settings);
  const settingsHydrated = useNotificationSettingsStore((s) => s.hydrated);

  const setStatusMessage = useCallback((message: string) => {
    setStatus(message);
  }, []);

  const handleRequestPermission = useCallback(() => {
    void notificationService.requestPermission().then((perm) => {
      setStatusMessage(`permission: ${perm}`);
    });
  }, [setStatusMessage]);

  const handleOsNotification = useCallback(() => {
    void notificationService
      .show({
        title: "Test notification",
        body: "OS toast (dev toolbar)",
        tag: DEV_TEST_TAG,
        silent: false,
      })
      .then(() => setStatusMessage("OS toast shown"))
      .catch(() => setStatusMessage("OS toast failed"));
  }, [setStatusMessage]);

  const handleOsPlusSound = useCallback(() => {
    const server = useNotificationSettingsStore.getState().settings;
    const local = useSettingsStore.getState().notificationSound;
    const preset = resolveNotificationSoundPreset(server.notificationSound, local);
    unlockNotificationAudio();
    void notificationService
      .show({
        title: "Test DM",
        body: "Silent OS + app sound (like production)",
        tag: `${DEV_TEST_TAG}-sound`,
        silent: true,
      })
      .then(() => {
        if (preset !== "none") {
          playNotificationSound(preset);
        }
        setStatusMessage(`toast + sound (${preset})`);
      })
      .catch(() => setStatusMessage("toast+sound failed"));
  }, [setStatusMessage]);

  const handlePlaySound = useCallback(() => {
    attachNotificationAudioUnlock();
    unlockNotificationAudio();
    const server = useNotificationSettingsStore.getState().settings;
    const local = useSettingsStore.getState().notificationSound;
    const preset = resolveNotificationSoundPreset(server.notificationSound, local);
    playNotificationSound(preset);
    setStatusMessage(`sound: ${preset}`);
  }, [setStatusMessage]);

  const handlePushRegister = useCallback(() => {
    void pushService
      .requestPermission()
      .then((perm) => {
        if (perm !== "granted") {
          setStatusMessage(`push permission: ${perm}`);
          return;
        }
        return pushService.register();
      })
      .then((registered) => {
        if (registered === undefined) return;
        setStatusMessage(registered ? "push registered" : "push register failed");
      })
      .catch(() => setStatusMessage("push error"));
  }, [setStatusMessage]);

  const handleCloseTest = useCallback(() => {
    void notificationService.closeByTag(DEV_TEST_TAG);
    void notificationService.closeByTag(`${DEV_TEST_TAG}-sound`);
    setStatusMessage("closed test tags");
  }, [setStatusMessage]);

  const handleShowDiagnostics = useCallback(() => {
    const perm = notificationService.getPermission();
    setStatusMessage(
      [
        `perm=${perm}`,
        `hydrated=${settingsHydrated}`,
        `dm=${serverSettings.enableDesktopNotifications}`,
        `stream=${serverSettings.enableStreamDesktopNotifications}`,
        `push=${pushState.registered ? "yes" : "no"}`,
        `provider=${pushState.provider ?? "none"}`,
      ].join(" "),
    );
  }, [
    pushState.provider,
    pushState.registered,
    serverSettings,
    settingsHydrated,
    setStatusMessage,
  ]);

  if (!import.meta.env.DEV) {
    return null;
  }

  return (
    <div
      data-testid="topbar-notification-dev"
      className="border-notice-base/40 flex max-w-[min(100%,28rem)] flex-col items-end gap-1 rounded-lg border border-dashed px-2 py-1"
      title="Temporary notification test controls (dev only)"
    >
      <div className="flex flex-wrap items-center justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={handleRequestPermission}>
          Perm
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleOsNotification}>
          OS
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleOsPlusSound}>
          OS+♪
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handlePlaySound}>
          ♪
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handlePushRegister}>
          Push
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleShowDiagnostics}>
          ?
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={handleCloseTest}>
          ✕
        </Button>
      </div>
      {status.length > 0 ? (
        <span className="max-w-full truncate text-[10px] text-text-muted" aria-live="polite">
          {status}
        </span>
      ) : null}
    </div>
  );
};

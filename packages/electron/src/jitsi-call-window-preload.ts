import { contextBridge, ipcRenderer } from "electron";
import { install as installJitsiElectronSdk } from "@jitsi/electron-sdk/preload";
import {
  JITSI_CALL_WINDOW_IPC,
  type JitsiCallWindowParticipant,
  type JitsiCallWindowPayload,
} from "./jitsi-call-window.contract";

installJitsiElectronSdk();

contextBridge.exposeInMainWorld("jitsiCallWindow", {
  getPayload: (): Promise<JitsiCallWindowPayload | null> =>
    ipcRenderer.invoke(JITSI_CALL_WINDOW_IPC.getPayload),
  close: (callId: string): void => ipcRenderer.send(JITSI_CALL_WINDOW_IPC.close, callId),
  updateParticipants: (callId: string, participants: JitsiCallWindowParticipant[]): void =>
    ipcRenderer.send(JITSI_CALL_WINDOW_IPC.updateParticipants, callId, participants),
});

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  call: {
    start: (data: { room: string; participants?: number }): void =>
      ipcRenderer.send("call:start", data),
    end: (): void => ipcRenderer.send("call:end"),
    update: (data: { participants?: number }): void => ipcRenderer.send("call:update", data),
  },
});

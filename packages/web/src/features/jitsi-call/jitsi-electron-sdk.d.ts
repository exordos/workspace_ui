declare module "@jitsi/electron-sdk/renderer" {
  export function setupScreenSharingRender(
    api: object,
    loggerTransports?: readonly unknown[] | null,
  ): object;
}

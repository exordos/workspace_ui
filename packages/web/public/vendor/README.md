# Vendored static assets

## `jitsi-external_api.js`

This file is the Jitsi Meet **IFrame External API** script (`external_api.js`), vendored so the app can expose `window.JitsiMeetExternalAPI` from the same origin as the SPA. It is loaded at startup from `src/shared/lib/jitsi-external-api.loader.ts` (called in `main.tsx` before the rest of the app) so we never put a non-module `<script>` in `index.html` (Vite warns on those during build). That also lets `@jitsi/react-sdk` skip injecting `<script src="https://…/external_api.js">`, which keeps strict CSP (`script-src 'self'`) workable in Electron.

**Source:** replace this file by copying from your Jitsi Meet deployment, for example:

`https://<your-meet-host>/external_api.js`

The committed copy is fetched from the public `meet.jit.si` instance; replace it if your Meet servers run a different Jitsi Meet version so the API matches the iframe target.

**License:** Jitsi Meet components are typically licensed under Apache License 2.0. See [Jitsi licensing](https://github.com/jitsi/jitsi-meet).

**Note:** If you run several Meet backends on incompatible versions, a single global `JitsiMeetExternalAPI` may not fit all of them; align server versions or refresh this file when upgrading Meet.

export function getShellContentSecurityPolicy(isDev: boolean): string[] {
  const mediaSrc = "media-src 'self' data: blob: https:";

  if (isDev) {
    return [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "connect-src 'self' ws://localhost:* http://localhost:* https: wss:",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      mediaSrc,
      "frame-src https:",
    ];
  }

  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' https: wss:",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    mediaSrc,
    "frame-src https:",
  ];
}

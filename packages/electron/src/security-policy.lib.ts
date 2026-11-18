export function getShellContentSecurityPolicy(
  isDev: boolean,
  { allowWasm = false }: { allowWasm?: boolean } = {},
): string[] {
  const mediaSrc = "media-src 'self' data: blob: https:";
  const scriptSrc = `script-src 'self'${allowWasm ? " 'wasm-unsafe-eval'" : ""}`;

  if (isDev) {
    return [
      "default-src 'self'",
      `${scriptSrc} 'unsafe-inline'`,
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
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self' https: wss:",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    mediaSrc,
    "frame-src https:",
  ];
}

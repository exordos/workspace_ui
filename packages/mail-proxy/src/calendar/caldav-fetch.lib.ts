/**
 * CalDAV HTTPS fetch via undici — Node global fetch ignores node:https.Agent.
 */

import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from "undici";
import { mailProxyEnv } from "../shared/env.lib";

let caldavDispatcher: Agent | null = null;

export function getCaldavTlsDispatcher(): Agent {
  if (caldavDispatcher == null) {
    // MAILCOW_TLS_REJECT_UNAUTHORIZED=false → allow dev self-signed certs (rejectUnauthorized: false)
    caldavDispatcher = new Agent({
      connect: {
        rejectUnauthorized: mailProxyEnv.TLS_REJECT_UNAUTHORIZED,
      },
    });
  }
  return caldavDispatcher;
}

/** Reset dispatcher (tests only). */
export function resetCaldavTlsDispatcherForTests(): void {
  caldavDispatcher = null;
}

export async function caldavHttpsFetch(
  url: string,
  init: UndiciRequestInit = {},
): Promise<Response> {
  const options: UndiciRequestInit = { ...init };
  if (url.startsWith("https:")) {
    options.dispatcher = getCaldavTlsDispatcher();
  }
  return undiciFetch(url, options) as Promise<Response>;
}

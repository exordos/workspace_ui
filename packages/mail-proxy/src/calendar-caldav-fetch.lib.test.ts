import { afterEach, describe, expect, it } from "vitest";
import {
  getCaldavTlsDispatcher,
  resetCaldavTlsDispatcherForTests,
} from "./calendar-caldav-fetch.lib";
import { mailProxyEnv } from "./mail-env.lib";

describe("calendar-caldav-fetch.lib", () => {
  afterEach(() => {
    resetCaldavTlsDispatcherForTests();
  });

  it("creates undici dispatcher with TLS setting from env", () => {
    const dispatcher = getCaldavTlsDispatcher();
    expect(dispatcher).toBeDefined();
    expect(mailProxyEnv.TLS_REJECT_UNAUTHORIZED).toBe(false);
  });
});

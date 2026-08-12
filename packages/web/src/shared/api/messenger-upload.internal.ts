import {
  MessengerApiError,
  buildMessengerUrl,
  buildMessengerRequestHeaders,
  resolveMessengerAccessToken,
  shouldAppendDevProxyTargetHeader,
  shouldRetryAfterAuthFailureStatus,
} from "./messenger-transport.internal";
import type { MessengerClientOptions } from "./messenger-transport.internal";

export interface MessengerUploadProgress {
  loaded: number;
  total: number;
}

interface MessengerXhrResult {
  data: unknown;
  headers: Headers;
  status: number;
}

function createMonotonicProgressReporter(
  onProgress: ((progress: MessengerUploadProgress) => void) | undefined,
): (progress: MessengerUploadProgress) => void {
  let logicalTotal: number | null = null;
  let reportedLoaded = 0;

  return ({ loaded, total }) => {
    if (logicalTotal == null && total > 0) {
      logicalTotal = total;
    }
    if (logicalTotal == null) {
      reportedLoaded = Math.max(reportedLoaded, loaded);
      onProgress?.({ loaded: reportedLoaded, total });
      return;
    }

    const normalizedLoaded =
      total > 0
        ? Math.round((Math.min(Math.max(loaded, 0), total) / total) * logicalTotal)
        : loaded;
    reportedLoaded = Math.min(logicalTotal, Math.max(reportedLoaded, normalizedLoaded));
    onProgress?.({ loaded: reportedLoaded, total: logicalTotal });
  };
}

function parseSuccessfulXhrData(responseText: string): unknown {
  if (responseText.trim().length === 0) {
    return null;
  }
  return JSON.parse(responseText) as unknown;
}

function parseErrorXhrData(responseText: string): unknown {
  if (responseText.trim().length === 0) {
    return null;
  }
  try {
    return JSON.parse(responseText) as unknown;
  } catch {
    return responseText;
  }
}

function parseXhrHeaders(rawHeaders: string): Headers {
  const headers = new Headers();
  for (const line of rawHeaders.trim().split(/[\r\n]+/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) continue;
    headers.append(line.slice(0, separatorIndex).trim(), line.slice(separatorIndex + 1).trim());
  }
  return headers;
}

function abortError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted", "AbortError");
}

function sendMultipartXhr(
  url: string,
  accessToken: string | null | undefined,
  options: MessengerClientOptions,
  form: FormData,
  onProgress: ((progress: MessengerUploadProgress) => void) | undefined,
): Promise<MessengerXhrResult> {
  return new Promise((resolve, reject) => {
    const signal = options.signal;
    if (signal?.aborted === true) {
      reject(abortError(signal));
      return;
    }

    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", onSignalAbort);
      callback();
    };
    const onSignalAbort = () => {
      xhr.abort();
      finish(() =>
        reject(signal == null ? new DOMException("Aborted", "AbortError") : abortError(signal)),
      );
    };

    xhr.open("POST", url, true);
    const requestHeaders = buildMessengerRequestHeaders(
      accessToken,
      undefined,
      false,
      options.devTargetOrigin,
      shouldAppendDevProxyTargetHeader(url),
    );
    for (const [name, value] of Object.entries(requestHeaders)) {
      xhr.setRequestHeader(name, value);
    }

    xhr.upload.addEventListener("progress", (event) => {
      onProgress?.({ loaded: event.loaded, total: event.total });
    });
    xhr.addEventListener("load", () => {
      try {
        const data =
          xhr.status >= 200 && xhr.status < 300
            ? parseSuccessfulXhrData(xhr.responseText)
            : parseErrorXhrData(xhr.responseText);
        finish(() =>
          resolve({
            status: xhr.status,
            data,
            headers: parseXhrHeaders(xhr.getAllResponseHeaders()),
          }),
        );
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error("Invalid upload response")));
      }
    });
    xhr.addEventListener("error", () => {
      finish(() => reject(new TypeError("Messenger file upload network request failed")));
    });
    xhr.addEventListener("abort", () => {
      finish(() =>
        reject(signal == null ? new DOMException("Aborted", "AbortError") : abortError(signal)),
      );
    });
    signal?.addEventListener("abort", onSignalAbort, { once: true });
    try {
      xhr.send(form);
    } catch (error) {
      finish(() =>
        reject(error instanceof Error ? error : new Error("Messenger file upload failed to start")),
      );
    }
  });
}

function withoutTrailingSlash(path: string): string | null {
  if (path === "/" || !path.endsWith("/")) return null;
  return path.replace(/\/+$/, "");
}

export async function messengerUploadFormDataResult(
  path: string,
  options: MessengerClientOptions,
  form: FormData,
  onProgress?: (progress: MessengerUploadProgress) => void,
): Promise<{ data: unknown; headers: Headers }> {
  const reportProgress = createMonotonicProgressReporter(onProgress);
  let responsePath = path;
  let accessToken = await resolveMessengerAccessToken(options);
  let result = await sendMultipartXhr(
    buildMessengerUrl(options.baseUrl, responsePath),
    accessToken,
    options,
    form,
    reportProgress,
  );

  const fallbackPath = withoutTrailingSlash(path);
  if (result.status === 404 && fallbackPath != null) {
    responsePath = fallbackPath;
    result = await sendMultipartXhr(
      buildMessengerUrl(options.baseUrl, responsePath),
      accessToken,
      options,
      form,
      reportProgress,
    );
  }

  if (shouldRetryAfterAuthFailureStatus(result.status, result.data)) {
    accessToken = await resolveMessengerAccessToken(options, true);
    result = await sendMultipartXhr(
      buildMessengerUrl(options.baseUrl, responsePath),
      accessToken,
      options,
      form,
      reportProgress,
    );
  }

  if (result.status < 200 || result.status >= 300) {
    throw new MessengerApiError(
      `Messenger API POST ${responsePath} failed`,
      result.status,
      result.data,
      result.headers,
    );
  }
  return { data: result.data, headers: result.headers };
}

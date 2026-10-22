// ============================================================
// core/api.js
// Purpose:   The only place that calls fetch().
//            Sends the access token, and on a 401 refreshes once, then
//            retries the original request.
// Loaded by: every page script
// ============================================================

import { CONFIG } from "./config.js";


// ---- The token: memory first, sessionStorage as the backup ----

let accessToken = sessionStorage.getItem(CONFIG.STORAGE_KEY) || null;

function setToken(token) {
  accessToken = token || null;

  if (token) {
    sessionStorage.setItem(CONFIG.STORAGE_KEY, token);
  } else {
    sessionStorage.removeItem(CONFIG.STORAGE_KEY);
  }
}

function hasToken() {
  return Boolean(accessToken);
}


// ---- One error type, so callers can check err.status ----

class ApiError extends Error {
  constructor(status, message, payload) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload || null;
  }
}


// ---- The refresh call: raw fetch, because it must not recurse ----

let refreshInFlight = null;

async function refreshToken() {
  // Two parallel 401s should share one refresh, not race each other
  if (refreshInFlight) {
    return refreshInFlight;
  }

  refreshInFlight = (async () => {
    try {
      const response = await fetch(`${CONFIG.API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        setToken(null);
        return false;
      }

      const body = await response.json();
      const token = body?.resData?.accessToken;

      if (!token) {
        setToken(null);
        return false;
      }

      setToken(token);
      return true;
    } catch {
      setToken(null);
      return false;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}


// ---- The single request helper ----

async function request(path, options = {}) {
  const { method = "GET", body, auth = true, retry = true, query } = options;

  const url = new URL(`${CONFIG.API_BASE}${path}`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, item));
      } else {
        url.searchParams.set(key, value);
      }
    }
  }

  const headers = { Accept: "application/json" };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  if (auth && accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  let response;

  // A hung request must not leave skeletons on screen forever
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

  try {
    response = await fetch(url, {
      method,
      headers,
      credentials: "include",
      signal: controller.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw controller.signal.aborted
      ? new ApiError(0, "The request timed out. Check that the API is running.")
      : new ApiError(0, "Cannot reach the server. Is the API running?");
  } finally {
    clearTimeout(timer);
  }

  // Expired access token: refresh once, then replay the request
  const isAuthPath = CONFIG.AUTH_PATHS.some((item) => path.startsWith(item));

  if (response.status === 401 && auth && retry && !isAuthPath) {
    const refreshed = await refreshToken();

    if (refreshed) {
      return request(path, { ...options, retry: false });
    }
  }

  // 204 has no body
  if (response.status === 204) {
    return null;
  }

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.resError ||
      payload?.resMessage ||
      `Request failed (${response.status})`;

    throw new ApiError(response.status, message, payload);
  }

  return payload?.resData ?? null;
}


// ---- Convenience wrappers ----

const api = {
  get: (path, options) => request(path, { ...options, method: "GET" }),
  post: (path, body, options) => request(path, { ...options, method: "POST", body }),
  patch: (path, body, options) => request(path, { ...options, method: "PATCH", body }),
  del: (path, options) => request(path, { ...options, method: "DELETE" }),

  // Raw helpers used by the auth pages
  setToken,
  hasToken,
  refreshToken,
  request,
  ApiError,
};

export { api, ApiError, setToken, hasToken, refreshToken };

const CLOUD_STATE_DEFAULT_KEY = "wb-dashboard-v2";
const CLOUD_STATE_DEFAULT_ENDPOINT = "/api/state";
const CLOUD_STATE_EXPORT_ENDPOINT = "/api/state-export";
const CLOUD_STATE_FETCH_TIMEOUT_MS = 30000;
const CLOUD_STATE_SYNC_DEBOUNCE_MS = 250;
const CLOUD_STATE_SYNC_RETRY_BASE_MS = 1200;
const CLOUD_STATE_SYNC_RETRY_MAX_MS = 12000;

const cloudStateSync = {
  timer: 0,
  inFlight: false,
  pending: false,
  latestPayload: null,
  lastErrorAt: 0,
  lastAuthErrorAt: 0,
  retryDelayMs: CLOUD_STATE_SYNC_RETRY_BASE_MS,
  retryAt: 0,
  lastSyncStartedAt: 0,
  lastSyncFinishedAt: 0,
  lastSyncDurationMs: 0,
  lastSyncOk: false,
};

function getCloudStateSyncStatus() {
  const now = Date.now();
  const retryAt = Number.isFinite(cloudStateSync.retryAt) ? cloudStateSync.retryAt : 0;
  const waitingRetry = retryAt > now;
  return {
    disabled: isCloudStateDisabled(),
    inFlight: cloudStateSync.inFlight === true,
    pending: cloudStateSync.pending === true,
    hasPayload: Boolean(cloudStateSync.latestPayload && typeof cloudStateSync.latestPayload === "object"),
    retryDelayMs: Math.max(0, Math.round(Number(cloudStateSync.retryDelayMs) || 0)),
    retryAt,
    waitingRetry,
    lastErrorAt: Math.max(0, Math.round(Number(cloudStateSync.lastErrorAt) || 0)),
    lastSyncStartedAt: Math.max(0, Math.round(Number(cloudStateSync.lastSyncStartedAt) || 0)),
    lastSyncFinishedAt: Math.max(0, Math.round(Number(cloudStateSync.lastSyncFinishedAt) || 0)),
    lastSyncDurationMs: Math.max(0, Math.round(Number(cloudStateSync.lastSyncDurationMs) || 0)),
    lastSyncOk: cloudStateSync.lastSyncOk === true,
  };
}

function getCloudStateKey() {
  const custom = String(window.WB_DASHBOARD_CLOUD_KEY || "").trim();
  return custom || CLOUD_STATE_DEFAULT_KEY;
}

function getCloudStateEndpoint() {
  const custom = String(window.WB_DASHBOARD_CLOUD_ENDPOINT || "").trim();
  return custom || CLOUD_STATE_DEFAULT_ENDPOINT;
}

function isCloudStateDisabled() {
  return window.WB_DASHBOARD_DISABLE_CLOUD_STATE === true;
}

function getCloudStateHeaders(base = {}) {
  return {
    "content-type": "application/json",
    ...base,
  };
}

function buildCloudStateUrl() {
  const endpoint = getCloudStateEndpoint();
  const url = new URL(endpoint, window.location.origin);
  url.searchParams.set("key", getCloudStateKey());
  return url.toString();
}

function buildCloudStateExportUrl() {
  const url = new URL(CLOUD_STATE_EXPORT_ENDPOINT, window.location.origin);
  url.searchParams.set("key", getCloudStateKey());
  return url.toString();
}

function clearCloudStateTimer() {
  if (!cloudStateSync.timer) {
    return;
  }
  clearTimeout(cloudStateSync.timer);
  cloudStateSync.timer = 0;
}

function parseCloudStateResponse(data) {
  if (!data || typeof data !== "object") {
    return null;
  }
  if (data.ok !== true) {
    return null;
  }
  const payload = data.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  return payload;
}

async function runCloudStateRequest(method, body = null) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLOUD_STATE_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(buildCloudStateUrl(), {
      method,
      headers: getCloudStateHeaders(),
      body: body ? JSON.stringify(body) : null,
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });

    if (response.status === 401) {
      const now = Date.now();
      if (!cloudStateSync.lastAuthErrorAt || now - cloudStateSync.lastAuthErrorAt >= 3000) {
        cloudStateSync.lastAuthErrorAt = now;
        try {
          window.dispatchEvent(new CustomEvent("wb-auth-required"));
        } catch {
          // noop
        }
      }
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const data = await response.json().catch(() => null);
    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadCloudStatePayload() {
  if (isCloudStateDisabled()) {
    return null;
  }

  const data = await runCloudStateRequest("GET");
  return parseCloudStateResponse(data);
}

async function sendCloudStatePayload(payload) {
  if (isCloudStateDisabled()) {
    return false;
  }

  const body = {
    key: getCloudStateKey(),
    payload,
  };

  const data = await runCloudStateRequest("PUT", body);
  return Boolean(data && data.ok === true);
}

async function flushCloudStateSync() {
  if (cloudStateSync.inFlight) {
    cloudStateSync.pending = true;
    cloudStateSync.retryAt = 0;
    return;
  }

  const payload = cloudStateSync.latestPayload;
  if (!payload || typeof payload !== "object") {
    return;
  }

  cloudStateSync.inFlight = true;
  cloudStateSync.pending = false;
  cloudStateSync.retryAt = 0;
  cloudStateSync.lastSyncStartedAt = Date.now();

  const ok = await sendCloudStatePayload(payload);
  const finishedAt = Date.now();
  cloudStateSync.lastSyncFinishedAt = finishedAt;
  cloudStateSync.lastSyncDurationMs =
    cloudStateSync.lastSyncStartedAt > 0
      ? Math.max(1, finishedAt - cloudStateSync.lastSyncStartedAt)
      : cloudStateSync.lastSyncDurationMs;
  cloudStateSync.lastSyncOk = ok === true;
  cloudStateSync.inFlight = false;
  if (!ok) {
    cloudStateSync.lastErrorAt = Date.now();
    cloudStateSync.retryDelayMs = Math.min(
      CLOUD_STATE_SYNC_RETRY_MAX_MS,
      Math.max(CLOUD_STATE_SYNC_RETRY_BASE_MS, Math.round(cloudStateSync.retryDelayMs * 1.6)),
    );
    cloudStateSync.retryAt = Date.now() + cloudStateSync.retryDelayMs;
    clearCloudStateTimer();
    cloudStateSync.timer = setTimeout(() => {
      clearCloudStateTimer();
      flushCloudStateSync();
    }, cloudStateSync.retryDelayMs);
    try {
      window.dispatchEvent(new CustomEvent("wb-cloud-state-sync-failed"));
    } catch {
      // noop
    }
  } else {
    cloudStateSync.retryDelayMs = CLOUD_STATE_SYNC_RETRY_BASE_MS;
    cloudStateSync.retryAt = 0;
    if (typeof clearShadowPendingPayload === "function") {
      clearShadowPendingPayload();
    }
    try {
      window.dispatchEvent(new CustomEvent("wb-cloud-state-sync-ok"));
    } catch {
      // noop
    }
  }

  if (cloudStateSync.pending) {
    cloudStateSync.pending = false;
    clearCloudStateTimer();
    cloudStateSync.timer = setTimeout(() => {
      flushCloudStateSync();
    }, CLOUD_STATE_SYNC_DEBOUNCE_MS);
  }
}

function queueCloudStateSync(payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }
  if (isCloudStateDisabled()) {
    return;
  }

  cloudStateSync.latestPayload = payload;
  if (typeof persistShadowPendingPayload === "function") {
    persistShadowPendingPayload(payload);
  }
  cloudStateSync.retryDelayMs = CLOUD_STATE_SYNC_RETRY_BASE_MS;
  cloudStateSync.retryAt = 0;

  clearCloudStateTimer();
  cloudStateSync.timer = setTimeout(() => {
    clearCloudStateTimer();
    flushCloudStateSync();
  }, CLOUD_STATE_SYNC_DEBOUNCE_MS);
}

function notifyAuthRequiredThrottled() {
  const now = Date.now();
  if (cloudStateSync.lastAuthErrorAt && now - cloudStateSync.lastAuthErrorAt < 3000) {
    return;
  }
  cloudStateSync.lastAuthErrorAt = now;
  try {
    window.dispatchEvent(new CustomEvent("wb-auth-required"));
  } catch {
    // noop
  }
}

async function downloadCloudStateExport() {
  if (isCloudStateDisabled()) {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(12000, CLOUD_STATE_FETCH_TIMEOUT_MS));

  try {
    const response = await fetch(buildCloudStateExportUrl(), {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });

    if (response.status === 401) {
      notifyAuthRequiredThrottled();
      return false;
    }

    if (!response.ok) {
      return false;
    }

    const blob = await response.blob();
    const contentDisposition = String(response.headers.get("content-disposition") || "");
    const filenameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
    const filename = filenameMatch?.[1] ? filenameMatch[1] : `wb-dashboard-export-${Date.now()}.csv`;

    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

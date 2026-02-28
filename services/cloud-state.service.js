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
  deltaBaseline: {
    initialized: false,
    rowSignatures: new Map(),
    metaSignature: "",
    snapshotSignature: "",
  },
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

function getCloudRowKey(rowRaw, index) {
  const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
  const nmId = String(row.nmId || "").trim();
  if (nmId) {
    return nmId;
  }
  const rowId = String(row.id || "").trim();
  if (rowId) {
    return rowId;
  }
  return `row-index:${Math.max(0, Math.round(Number(index) || 0))}`;
}

function getCloudRowSignature(rowRaw, index) {
  const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
  try {
    return JSON.stringify({
      sortIndex: Math.max(0, Math.round(Number(index) || 0)),
      row,
    });
  } catch {
    return `${getCloudRowKey(rowRaw, index)}-${Date.now()}`;
  }
}

function getCloudMetaFromPayload(payloadRaw) {
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
  const meta = { ...payload };
  delete meta.rows;
  delete meta.updateSnapshots;
  return meta;
}

function getCloudMetaSignature(metaRaw) {
  const meta = metaRaw && typeof metaRaw === "object" ? { ...metaRaw } : {};
  delete meta.savedAt;
  delete meta.lastSyncAt;
  try {
    return JSON.stringify(meta);
  } catch {
    return "";
  }
}

function getLatestCloudSnapshot(payloadRaw) {
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
  const snapshots = Array.isArray(payload.updateSnapshots) ? payload.updateSnapshots : [];
  return snapshots.length > 0 ? snapshots[snapshots.length - 1] : null;
}

function getCloudSnapshotSignature(snapshotRaw) {
  if (!snapshotRaw || typeof snapshotRaw !== "object") {
    return "";
  }
  try {
    return JSON.stringify(snapshotRaw);
  } catch {
    return "";
  }
}

function buildCloudDeltaBaseline(payloadRaw) {
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const rowSignatures = new Map();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const key = getCloudRowKey(row, index);
    const signature = getCloudRowSignature(row, index);
    rowSignatures.set(key, signature);
  }

  const meta = getCloudMetaFromPayload(payload);
  const latestSnapshot = getLatestCloudSnapshot(payload);
  return {
    initialized: true,
    rowSignatures,
    metaSignature: getCloudMetaSignature(meta),
    snapshotSignature: getCloudSnapshotSignature(latestSnapshot),
  };
}

function setCloudDeltaBaseline(payloadRaw) {
  cloudStateSync.deltaBaseline = buildCloudDeltaBaseline(payloadRaw);
}

function buildCloudStateDeltaPatch(payloadRaw) {
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : null;
  if (!payload) {
    return { noop: true, patch: null, nextBaseline: cloudStateSync.deltaBaseline };
  }

  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const currentBaseline = cloudStateSync.deltaBaseline || {
    initialized: false,
    rowSignatures: new Map(),
    metaSignature: "",
    snapshotSignature: "",
  };
  const previousRowSignatures =
    currentBaseline.rowSignatures instanceof Map ? currentBaseline.rowSignatures : new Map();
  const nextBaseline = buildCloudDeltaBaseline(payload);

  const rowsUpsert = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const rowKey = getCloudRowKey(row, index);
    const nextSignature = nextBaseline.rowSignatures.get(rowKey) || "";
    const prevSignature = previousRowSignatures.get(rowKey) || "";
    if (!currentBaseline.initialized || nextSignature !== prevSignature) {
      rowsUpsert.push({
        ...(row && typeof row === "object" ? row : {}),
        id: rowKey,
        sortIndex: index,
      });
    }
  }

  const rowIdsDelete = [];
  if (currentBaseline.initialized) {
    for (const rowKey of previousRowSignatures.keys()) {
      if (!nextBaseline.rowSignatures.has(rowKey)) {
        rowIdsDelete.push(rowKey);
      }
    }
  }

  const meta = getCloudMetaFromPayload(payload);
  const latestSnapshot = getLatestCloudSnapshot(payload);
  const metaChanged = !currentBaseline.initialized || nextBaseline.metaSignature !== currentBaseline.metaSignature;
  const snapshotChanged =
    !currentBaseline.initialized || nextBaseline.snapshotSignature !== currentBaseline.snapshotSignature;

  const patch = {
    savedAt: String(payload.savedAt || payload.lastSyncAt || new Date().toISOString()),
    lastSyncAt: String(payload.lastSyncAt || payload.savedAt || new Date().toISOString()),
    source: String(payload.source || "manual"),
    actionKey: String(payload.actionKey || "all"),
    mode: String(payload.mode || "full"),
    meta,
    rowsUpsert,
    rowIdsDelete,
    updateSnapshots: snapshotChanged && latestSnapshot ? [latestSnapshot] : [],
  };

  const hasChanges = rowsUpsert.length > 0 || rowIdsDelete.length > 0 || snapshotChanged || metaChanged;
  return {
    noop: !hasChanges,
    patch,
    nextBaseline,
  };
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
      return {
        ok: false,
        status: 401,
        data: null,
      };
    }

    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: null,
      };
    }

    const data = await response.json().catch(() => null);
    return {
      ok: true,
      status: response.status,
      data,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function loadCloudStatePayload() {
  if (isCloudStateDisabled()) {
    return null;
  }

  const response = await runCloudStateRequest("GET");
  if (!response || response.ok !== true) {
    return null;
  }
  const payload = parseCloudStateResponse(response.data);
  if (payload) {
    setCloudDeltaBaseline(payload);
  }
  return payload;
}

async function sendCloudStatePayload(payload) {
  if (isCloudStateDisabled()) {
    return false;
  }

  const key = getCloudStateKey();
  const delta = buildCloudStateDeltaPatch(payload);
  if (delta.noop) {
    cloudStateSync.deltaBaseline = delta.nextBaseline;
    return true;
  }

  const patchBody = {
    key,
    patch: delta.patch,
  };
  const patchResponse = await runCloudStateRequest("PATCH", patchBody);
  if (patchResponse && patchResponse.ok === true && patchResponse.data && patchResponse.data.ok === true) {
    cloudStateSync.deltaBaseline = delta.nextBaseline;
    return true;
  }

  const fallbackBody = {
    key,
    payload,
  };
  const putResponse = await runCloudStateRequest("PUT", fallbackBody);
  if (putResponse && putResponse.ok === true && putResponse.data && putResponse.data.ok === true) {
    setCloudDeltaBaseline(payload);
    return true;
  }
  return false;
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

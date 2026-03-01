import { json } from "./auth.js";

export const DEFAULT_STATE_KEY = "wb-dashboard-v2";
const SNAPSHOT_LIMIT = 4000;
const ROW_LOG_LIMIT = 100;
const ROW_VERSION_LIMIT = 500;
const DASHBOARD_SAVE_EVENT_LIMIT = 2000;
const CSV_SEPARATOR = ",";
const WRITE_UPSERT_ROW_VERSIONS = false;
const WRITE_LEGACY_STATE_ON_SAVE = false;
const TOUCH_ARTICLE_REGISTRY_ON_UPDATE = false;
const WRITE_SAVE_EVENTS = false;

let tablesEnsured = false;
let tablesEnsurePromise = null;
const compactedStateKeys = new Set();
const ENABLE_HOTPATH_COMPACTION = false;

const REQUIRED_TABLES = [
  "dashboard_state",
  "dashboard_state_meta",
  "dashboard_rows_current",
  "dashboard_article_registry",
  "dashboard_row_versions",
  "dashboard_row_logs",
  "dashboard_problem_snapshots",
  "dashboard_save_events",
];

async function maybeCompactStateStorage(db, stateKey, savedAtIso, nowIso) {
  if (!ENABLE_HOTPATH_COMPACTION) {
    return;
  }
  const key = safeString(stateKey, 120) || DEFAULT_STATE_KEY;
  if (!key || compactedStateKeys.has(key)) {
    return;
  }

  await db
    .prepare(
      `UPDATE dashboard_rows_current
       SET row_payload_json = NULL
       WHERE state_key = ?1
         AND row_payload_json IS NOT NULL`,
    )
    .bind(key)
    .run();

  if (!WRITE_SAVE_EVENTS) {
    await db
      .prepare(
        `DELETE FROM dashboard_save_events
         WHERE state_key = ?1`,
      )
      .bind(key)
      .run();
  }

  if (!WRITE_LEGACY_STATE_ON_SAVE) {
    const compactPayload = {
      savedAt: toIsoOrNow(savedAtIso, nowIso),
      lastSyncAt: toIsoOrNow(savedAtIso, nowIso),
      compact: true,
      updatedAt: toIsoOrNow(nowIso, new Date().toISOString()),
    };
    await db.prepare(UPSERT_LEGACY_STATE_SQL)
      .bind(
        key,
        JSON.stringify(compactPayload),
        toIsoOrNow(savedAtIso, nowIso),
        toIsoOrNow(nowIso, new Date().toISOString()),
      )
      .run();
  }

  compactedStateKeys.add(key);
}

export function getStateKeyFromUrl(url) {
  const key = String(url.searchParams.get("key") || "").trim();
  return key || DEFAULT_STATE_KEY;
}

export function getClientIp(request) {
  if (!request || !request.headers) {
    return "";
  }

  const cfIp = String(request.headers.get("cf-connecting-ip") || "").trim();
  if (cfIp) {
    return cfIp.slice(0, 64);
  }

  const trueClientIp = String(request.headers.get("true-client-ip") || "").trim();
  if (trueClientIp) {
    return trueClientIp.slice(0, 64);
  }

  const xRealIp = String(request.headers.get("x-real-ip") || "").trim();
  if (xRealIp) {
    return xRealIp.slice(0, 64);
  }

  const xForwardedFor = String(request.headers.get("x-forwarded-for") || "").trim();
  if (xForwardedFor) {
    const firstIp = xForwardedFor
      .split(",")
      .map((part) => part.trim())
      .find(Boolean);
    if (firstIp) {
      return firstIp.slice(0, 64);
    }
  }

  return "";
}

export function parsePayloadJson(payloadJsonRaw) {
  const payloadJson = String(payloadJsonRaw || "").trim();
  if (!payloadJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(payloadJson);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function safeString(valueRaw, maxLen = 2000) {
  return String(valueRaw || "")
    .trim()
    .slice(0, maxLen);
}

function safeNullableString(valueRaw, maxLen = 2000) {
  const normalized = safeString(valueRaw, maxLen);
  return normalized || null;
}

function toIsoOrNow(valueRaw, fallbackIso) {
  const fallback = fallbackIso || new Date().toISOString();
  const value = safeString(valueRaw, 100);
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function toIsoOrNull(valueRaw) {
  const value = safeString(valueRaw, 100);
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toIntegerOrNull(valueRaw) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.round(value);
}

function toNumberOrNull(valueRaw, precision = null) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return null;
  }
  if (!Number.isFinite(precision)) {
    return value;
  }
  const factor = 10 ** Math.max(0, Math.round(precision));
  return Math.round(value * factor) / factor;
}

function boolToDb(valueRaw) {
  if (valueRaw === true) {
    return 1;
  }
  if (valueRaw === false) {
    return 0;
  }
  return null;
}

function dbToBool(valueRaw) {
  const value = Number(valueRaw);
  if (value === 1) {
    return true;
  }
  if (value === 0) {
    return false;
  }
  return null;
}

function toJson(valueRaw, fallback = "{}") {
  try {
    return JSON.stringify(valueRaw);
  } catch {
    return fallback;
  }
}

function parseJson(textRaw, fallback = null) {
  const text = String(textRaw || "").trim();
  if (!text) {
    return fallback;
  }
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function sortObjectKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortObjectKeysDeep(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  const sorted = {};
  const keys = Object.keys(value).sort((left, right) => left.localeCompare(right));
  for (const key of keys) {
    sorted[key] = sortObjectKeysDeep(value[key]);
  }
  return sorted;
}

async function sha256Hex(valueRaw) {
  const text = String(valueRaw || "");
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);

  try {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const digestBytes = new Uint8Array(digest);
    return Array.from(digestBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    let hash = 0;
    for (let index = 0; index < bytes.length; index += 1) {
      hash = (hash << 5) - hash + bytes[index];
      hash |= 0;
    }
    return `fallback-${Math.abs(hash)}`;
  }
}

function getPayloadRowsCount(payloadRaw) {
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : null;
  if (!payload) {
    return 0;
  }
  return Array.isArray(payload.rows) ? payload.rows.length : 0;
}

function normalizeNmId(valueRaw) {
  const value = safeString(valueRaw, 40);
  if (!value) {
    return "";
  }
  if (/^\d{4,}$/.test(value)) {
    return value;
  }
  return value;
}

function normalizeArrayOfNmIds(valuesRaw, sourceNmIdRaw = "") {
  const sourceNmId = normalizeNmId(sourceNmIdRaw);
  const source = Array.isArray(valuesRaw) ? valuesRaw : [];
  const unique = [];
  const seen = new Set();

  for (const raw of source) {
    const nmId = normalizeNmId(raw);
    if (!nmId || nmId === sourceNmId || seen.has(nmId)) {
      continue;
    }
    seen.add(nmId);
    unique.push(nmId);
  }

  return unique;
}

function normalizeRowLogChanges(changesRaw) {
  const source = Array.isArray(changesRaw) ? changesRaw : [];
  const output = [];

  for (const raw of source) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const field = safeString(raw.field, 120);
    if (!field) {
      continue;
    }

    output.push({
      field,
      label: safeString(raw.label || field, 240),
      beforeText: safeString(raw.beforeText, 2000),
      afterText: safeString(raw.afterText, 2000),
    });

    if (output.length >= 80) {
      break;
    }
  }

  return output;
}

function normalizeSingleRowLog(raw, fallbackIso, index = 0) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const at = toIsoOrNow(raw.at, fallbackIso);
  const sourceType = safeString(raw.source, 40).toLowerCase() === "system" ? "system" : "manual";
  const mode = safeString(raw.mode, 40) || "full";
  const actionKey = safeString(raw.actionKey, 80) || "row-refresh";
  const status = safeString(raw.status, 20).toLowerCase() === "error" ? "error" : "success";
  const error = safeString(raw.error, 4000);
  const changes = normalizeRowLogChanges(raw.changes);
  const logId =
    safeString(raw.id, 120) ||
    `log-${Math.floor(new Date(at).getTime())}-${index}-${Math.random().toString(16).slice(2, 8)}`;

  return {
    logId,
    at,
    sourceType,
    mode,
    actionKey,
    status,
    error,
    changes,
  };
}

function normalizeRowLogs(logsRaw, fallbackIso) {
  const source = Array.isArray(logsRaw) ? logsRaw : [];
  const output = [];

  for (let index = 0; index < source.length; index += 1) {
    const normalized = normalizeSingleRowLog(source[index], fallbackIso, index);
    if (!normalized) {
      continue;
    }

    output.push(normalized);
  }

  if (output.length <= ROW_LOG_LIMIT) {
    return output;
  }
  return output.slice(output.length - ROW_LOG_LIMIT);
}

function normalizeIncomingLogsForPersist(logsRaw, latestStoredLogIdRaw) {
  const logs = Array.isArray(logsRaw) ? logsRaw : [];
  if (logs.length <= 0) {
    return [];
  }

  const latestStoredLogId = safeString(latestStoredLogIdRaw, 120);
  if (!latestStoredLogId) {
    return logs;
  }

  let latestMatchIndex = -1;
  for (let index = logs.length - 1; index >= 0; index -= 1) {
    const logId = safeString(logs[index]?.logId, 120);
    if (!logId) {
      continue;
    }
    if (logId === latestStoredLogId) {
      latestMatchIndex = index;
      break;
    }
  }

  if (latestMatchIndex >= 0) {
    return logs.slice(latestMatchIndex + 1);
  }

  const latestIncomingLogId = safeString(logs[logs.length - 1]?.logId, 120);
  if (latestIncomingLogId && latestIncomingLogId === latestStoredLogId) {
    return [];
  }

  // Если не нашли общую точку, сохраняем только самый свежий лог:
  // это безопасно по нагрузке и исключает массовые повторные UPSERT.
  return logs.slice(-1);
}

function normalizeProblemSnapshotEntry(raw, fallbackIso) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const at = toIsoOrNow(raw.at, fallbackIso);
  const source = safeString(raw.source, 40).toLowerCase() === "system" ? "system" : "manual";
  const actionKey = safeString(raw.actionKey, 80) || "all";
  const mode = safeString(raw.mode, 40) || "full";

  const snapshotId =
    safeString(raw.id, 120) ||
    `snap-${Math.floor(new Date(at).getTime())}-${Math.random().toString(16).slice(2, 8)}`;

  const problemsRaw = raw.problems && typeof raw.problems === "object" ? raw.problems : {};
  const cabinetsRaw = Array.isArray(raw.cabinets) ? raw.cabinets : [];

  return {
    snapshotId,
    at,
    source,
    actionKey,
    mode,
    totalRows: Math.max(0, toIntegerOrNull(raw.totalRows) || 0),
    loadedRows: Math.max(0, toIntegerOrNull(raw.loadedRows) || 0),
    errorRows: Math.max(0, toIntegerOrNull(raw.errorRows) || 0),
    problemsJson: toJson(
      {
        recommendationsNo: Math.max(0, toIntegerOrNull(problemsRaw.recommendationsNo) || 0),
        richNo: Math.max(0, toIntegerOrNull(problemsRaw.richNo) || 0),
        videoNo: Math.max(0, toIntegerOrNull(problemsRaw.videoNo) || 0),
        autoplayNo: Math.max(0, toIntegerOrNull(problemsRaw.autoplayNo) || 0),
        autoplayOver: Math.max(0, toIntegerOrNull(problemsRaw.autoplayOver) || 0),
        tagsNo: Math.max(0, toIntegerOrNull(problemsRaw.tagsNo) || 0),
        tagsOver: Math.max(0, toIntegerOrNull(problemsRaw.tagsOver) || 0),
        coverDuplicate: Math.max(0, toIntegerOrNull(problemsRaw.coverDuplicate) || 0),
        total: Math.max(0, toIntegerOrNull(problemsRaw.total) || 0),
      },
      "{}",
    ),
    cabinetsJson: toJson(cabinetsRaw, "[]"),
  };
}

async function normalizeRowForStorage(rowRaw, sortIndex, actor, savedAtIso) {
  const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
  const nmId = normalizeNmId(row.nmId);
  const uiRowId = safeString(row.id, 120);
  const rowId = nmId || uiRowId || `row-${Date.now()}-${sortIndex}`;
  const rowData = row.data && typeof row.data === "object" ? row.data : null;

  const recommendationRefs = normalizeArrayOfNmIds(
    rowData?.recommendationResolvedRefs || rowData?.recommendationRefs || [],
    nmId,
  );
  const colorNmIds = normalizeArrayOfNmIds(rowData?.colorNmIds || [], nmId);

  const listingSlidesCount = Array.isArray(rowData?.slides) ? rowData.slides.length : 0;
  const richSlidesCount = Array.isArray(rowData?.richDetails?.media) ? rowData.richDetails.media.length : 0;
  const recommendationKnownCount = Number.isFinite(rowData?.recommendationKnownCount)
    ? Math.max(0, Math.round(rowData.recommendationKnownCount))
    : recommendationRefs.length;

  const hasRich = rowData?.hasRich === true ? true : rowData?.hasRich === false ? false : null;
  const hasRecommendations =
    rowData?.hasSellerRecommendations === true ? true : rowData?.hasSellerRecommendations === false ? false : null;

  const richBlockCount = Number.isFinite(rowData?.richBlockCount)
    ? Math.max(0, Math.round(rowData.richBlockCount))
    : Number.isFinite(rowData?.richDetails?.blockCount)
      ? Math.max(0, Math.round(rowData.richDetails.blockCount))
      : null;

  const normalizedData = rowData
    ? {
        ...rowData,
        recommendationResolvedRefs: recommendationRefs,
        recommendationKnownCount,
        colorNmIds,
        colorCount: colorNmIds.length,
        richDetails:
          rowData.richDetails && typeof rowData.richDetails === "object"
            ? {
                ...rowData.richDetails,
                media: Array.isArray(rowData.richDetails.media) ? rowData.richDetails.media.slice(0, 80) : [],
                links: Array.isArray(rowData.richDetails.links) ? rowData.richDetails.links.slice(0, 120) : [],
                snippets: Array.isArray(rowData.richDetails.snippets) ? rowData.richDetails.snippets.slice(0, 120) : [],
              }
            : rowData.richDetails,
      }
    : null;

  const rowForHash = {
    rowId,
    nmId,
    sortIndex,
    cabinet: safeString(row.cabinet, 120),
    supplierId: safeNullableString(row.supplierId, 40),
    stockValue: toIntegerOrNull(row.stockValue),
    inStock: row.inStock === true ? true : row.inStock === false ? false : null,
    stockSource: safeString(row.stockSource, 80),
    currentPrice: toIntegerOrNull(row.currentPrice),
    basePrice: toIntegerOrNull(row.basePrice),
    priceSource: safeString(row.priceSource, 80),
    error: safeString(row.error, 4000),
    updatedAt: toIsoOrNull(row.updatedAt),
    data: normalizedData,
  };

  const rowHash = await sha256Hex(toJson(sortObjectKeysDeep(rowForHash), "{}"));
  // В payload передаем последние логи (ограничение - ROW_LOG_LIMIT),
  // а на запись в БД сохраняем только реально новые (см. persistIncomingRowLogs).
  const logs = normalizeRowLogs(row.updateLogs, savedAtIso);

  return {
    stateKey: actor.stateKey,
    rowId,
    sortIndex,
    nmId,
    cabinet: safeString(row.cabinet, 120),
    supplierId: safeNullableString(row.supplierId, 40),
    stockValue: toIntegerOrNull(row.stockValue),
    inStock: boolToDb(row.inStock),
    stockSource: safeString(row.stockSource, 80),
    currentPrice: toIntegerOrNull(row.currentPrice),
    basePrice: toIntegerOrNull(row.basePrice),
    priceSource: safeString(row.priceSource, 80),
    error: safeString(row.error, 4000),
    updatedAt: toIsoOrNull(row.updatedAt),
    cardCode: safeString(rowData?.cardCode || rowData?.vendorCode || rowData?.vendor_code, 60),
    productName: safeString(rowData?.name, 400),
    categoryName: safeString(rowData?.category, 240),
    brandName: safeString(rowData?.brand, 240),
    hasVideo: boolToDb(rowData?.hasVideo),
    hasRecommendations: boolToDb(hasRecommendations),
    hasRich: boolToDb(hasRich),
    richBlockCount: toIntegerOrNull(richBlockCount),
    hasAutoplay: boolToDb(rowData?.hasAutoplay),
    hasTags: boolToDb(rowData?.hasTags),
    coverDuplicate: boolToDb(rowData?.coverSlideDuplicate),
    listingSlidesCount: Math.max(0, listingSlidesCount),
    richSlidesCount: Math.max(0, richSlidesCount),
    recommendationKnownCount: Math.max(0, recommendationKnownCount),
    recommendationRefsJson: toJson(recommendationRefs, "[]"),
    colorCount: colorNmIds.length,
    colorNmIdsJson: toJson(colorNmIds, "[]"),
    rating: toNumberOrNull(rowData?.rating, 1),
    reviewCount: toIntegerOrNull(rowData?.reviewCount),
    marketError: safeString(rowData?.marketError, 2000),
    rowDataJson: toJson(normalizedData, "null"),
    // Для текущего состояния храним полный row_data_json.
    // Дублирующий row_payload_json intentionally не сохраняем (экономия хранилища).
    rowPayloadJson: null,
    rowHash,
    lastSavedAt: savedAtIso,
    createdAt: savedAtIso,
    savedByUserId: actor.userId,
    savedByLogin: actor.login,
    savedByRole: actor.role,
    savedByIp: actor.ip,
    logs,
  };
}

async function persistIncomingRowLogs(db, params) {
  const stateKey = safeString(params?.stateKey, 120);
  const rowId = safeString(params?.rowId, 120);
  const actor = params?.actor && typeof params.actor === "object" ? params.actor : {};
  const nowIso = toIsoOrNow(params?.nowIso, new Date().toISOString());
  const latestStoredLogRaw = params?.latestStoredLog && typeof params.latestStoredLog === "object"
    ? params.latestStoredLog
    : null;

  if (!stateKey || !rowId) {
    return { latestStoredLog: latestStoredLogRaw, logsUpserted: 0, touched: false };
  }

  let latestStoredLog = latestStoredLogRaw;
  const latestStoredLogId = latestStoredLog ? safeString(latestStoredLog.logId, 120) : "";
  const incomingLogs = normalizeIncomingLogsForPersist(params?.incomingLogs, latestStoredLogId);
  if (incomingLogs.length <= 0) {
    return { latestStoredLog, logsUpserted: 0, touched: false };
  }

  let logsUpserted = 0;
  let touched = false;

  for (const log of incomingLogs) {
    const logId = safeString(log?.logId, 120);
    if (!logId) {
      continue;
    }

    const currentLatestLogId = latestStoredLog ? safeString(latestStoredLog.logId, 120) : "";
    const shouldMergeNoChange =
      latestStoredLog &&
      isNoChangeLog(latestStoredLog) &&
      isNoChangeLog(log);

    if (shouldMergeNoChange && currentLatestLogId) {
      const mergedLog = {
        ...latestStoredLog,
        ...log,
        logId: currentLatestLogId,
        at: toIsoOrNow(log.at, nowIso),
      };
      await db
        .prepare(UPDATE_EXISTING_ROW_LOG_SQL)
        .bind(...mapLogUpdateBind(stateKey, rowId, currentLatestLogId, mergedLog, actor, nowIso))
        .run();
      latestStoredLog = mergedLog;
      touched = true;
      continue;
    }

    await db
      .prepare(UPSERT_ROW_LOG_SQL)
      .bind(...mapLogToBind(stateKey, rowId, log, actor, nowIso))
      .run();

    if (!currentLatestLogId || currentLatestLogId !== logId) {
      logsUpserted += 1;
    }
    latestStoredLog = log;
    touched = true;
  }

  return { latestStoredLog, logsUpserted, touched };
}

async function hasNormalizedStateData(db, stateKey) {
  const metaRow = await db
    .prepare(
      `SELECT state_key
       FROM dashboard_state_meta
       WHERE state_key = ?1
       LIMIT 1`,
    )
    .bind(stateKey)
    .first();
  if (metaRow) {
    return true;
  }

  const rowsCountRow = await db
    .prepare(
      `SELECT COUNT(1) AS total
       FROM dashboard_rows_current
       WHERE state_key = ?1`,
    )
    .bind(stateKey)
    .first();
  return (Number(rowsCountRow?.total) || 0) > 0;
}

async function getCurrentRowsCount(db, stateKey) {
  const rowsCountRow = await db
    .prepare(
      `SELECT COUNT(1) AS total
       FROM dashboard_rows_current
       WHERE state_key = ?1`,
    )
    .bind(stateKey)
    .first();
  return Math.max(0, Number(rowsCountRow?.total) || 0);
}

async function compactLegacyStateRecord(db, stateKey) {
  const nowIso = new Date().toISOString();
  const rowsCount = await getCurrentRowsCount(db, stateKey);
  const metaRow = await db
    .prepare(
      `SELECT saved_at
       FROM dashboard_state_meta
       WHERE state_key = ?1
       LIMIT 1`,
    )
    .bind(stateKey)
    .first();

  const savedAtIso = toIsoOrNow(metaRow?.saved_at, nowIso);
  const compactPayload = {
    savedAt: savedAtIso,
    lastSyncAt: savedAtIso,
    rowsCount,
    migrated: true,
    updatedAt: nowIso,
  };

  await db.prepare(UPSERT_LEGACY_STATE_SQL)
    .bind(stateKey, JSON.stringify(compactPayload), savedAtIso, nowIso)
    .run();

  return { rowsCount, savedAt: savedAtIso, updatedAt: nowIso };
}

export async function migrateLegacyStateToNormalizedIfNeeded(db, input = {}) {
  await ensureStateTables(db);

  const stateKey = safeString(input.stateKey, 120) || DEFAULT_STATE_KEY;
  const alreadyNormalized = await hasNormalizedStateData(db, stateKey);
  if (alreadyNormalized) {
    const compacted = await compactLegacyStateRecord(db, stateKey);
    return { migrated: false, reason: "already-normalized", compacted: true, ...compacted };
  }

  const legacyRow = await db
    .prepare(
      `SELECT state_key, payload_json
       FROM dashboard_state
       WHERE state_key = ?1
       LIMIT 1`,
    )
    .bind(stateKey)
    .first();
  if (!legacyRow) {
    return { migrated: false, reason: "no-legacy-row" };
  }

  const legacyPayload = parsePayloadJson(legacyRow.payload_json || "");
  if (!legacyPayload || !Array.isArray(legacyPayload.rows) || legacyPayload.rows.length <= 0) {
    return { migrated: false, reason: "legacy-payload-empty" };
  }

  const saved = await saveDashboardState(db, {
    stateKey,
    payload: legacyPayload,
    actorUserId: input.actorUserId,
    actorLogin: input.actorLogin,
    actorRole: input.actorRole,
    actorIp: input.actorIp,
  });

  return {
    migrated: true,
    reason: "legacy-imported",
    rowsTotal: saved.rowsTotal,
    savedAt: saved.savedAt,
  };
}

function normalizeMetaPayload(payloadRaw) {
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
  const cloned = { ...payload };
  delete cloned.rows;
  delete cloned.updateSnapshots;
  return cloned;
}

function normalizeSnapshots(snapshotsRaw, savedAtIso) {
  const source = Array.isArray(snapshotsRaw) ? snapshotsRaw : [];
  const output = [];
  for (const entry of source) {
    const normalized = normalizeProblemSnapshotEntry(entry, savedAtIso);
    if (!normalized) {
      continue;
    }
    output.push(normalized);
    if (output.length >= SNAPSHOT_LIMIT) {
      break;
    }
  }
  return output;
}

function normalizeRowIdList(rowIdsRaw) {
  const source = Array.isArray(rowIdsRaw) ? rowIdsRaw : [];
  const unique = [];
  const seen = new Set();
  for (const raw of source) {
    const rowId = safeString(raw, 120);
    if (!rowId || seen.has(rowId)) {
      continue;
    }
    seen.add(rowId);
    unique.push(rowId);
  }
  return unique;
}

async function getSnapshotCount(db, stateKey) {
  const row = await db
    .prepare(
      `SELECT COUNT(1) AS total
       FROM dashboard_problem_snapshots
       WHERE state_key = ?1`,
    )
    .bind(stateKey)
    .first();
  return Math.max(0, Number(row?.total) || 0);
}

function mapRowLogRecord(rowRaw) {
  const row = rowRaw && typeof rowRaw === "object" ? rowRaw : {};
  const rowId = safeString(row.row_id, 120);
  const logId = safeString(row.log_id, 120);
  if (!rowId || !logId) {
    return null;
  }

  const changes = (() => {
    const parsed = parseJson(row.changes_json, []);
    return Array.isArray(parsed) ? parsed : [];
  })();

  return {
    rowId,
    logId,
    at: toIsoOrNow(row.at, new Date().toISOString()),
    sourceType: safeString(row.source, 40).toLowerCase() === "system" ? "system" : "manual",
    mode: safeString(row.mode, 40) || "full",
    actionKey: safeString(row.action_key, 80) || "row-refresh",
    status: safeString(row.status, 20).toLowerCase() === "error" ? "error" : "success",
    error: safeString(row.error, 4000),
    changes,
  };
}

function isNoChangeLog(logRaw) {
  const log = logRaw && typeof logRaw === "object" ? logRaw : null;
  if (!log) {
    return false;
  }
  if (safeString(log.status, 20).toLowerCase() === "error") {
    return false;
  }
  if (safeString(log.error, 4000)) {
    return false;
  }
  return !Array.isArray(log.changes) || log.changes.length <= 0;
}

async function getLatestRowLogs(db, stateKey) {
  const result = await db
    .prepare(
      `SELECT row_id, log_id, at, source, mode, action_key, status, error, changes_json
       FROM dashboard_row_logs
       WHERE state_key = ?1
         AND rowid IN (
           SELECT MAX(rowid)
           FROM dashboard_row_logs
           WHERE state_key = ?1
           GROUP BY row_id
         )`,
    )
    .bind(stateKey)
    .all();

  const rows = Array.isArray(result?.results) ? result.results : [];
  const latestByRowId = new Map();
  for (const row of rows) {
    const mapped = mapRowLogRecord(row);
    if (!mapped) {
      continue;
    }
    latestByRowId.set(mapped.rowId, mapped);
  }
  return latestByRowId;
}

async function getLatestRowLogsForRows(db, stateKey, rowIdsRaw) {
  const rowIds = normalizeRowIdList(rowIdsRaw);
  if (rowIds.length <= 0) {
    return new Map();
  }

  const placeholders = rowIds.map((_, index) => `?${index + 2}`).join(", ");
  const sql = `SELECT row_id, log_id, at, source, mode, action_key, status, error, changes_json
    FROM dashboard_row_logs
    WHERE state_key = ?1
      AND rowid IN (
        SELECT MAX(rowid)
        FROM dashboard_row_logs
        WHERE state_key = ?1
          AND row_id IN (${placeholders})
        GROUP BY row_id
      )`;

  const result = await db
    .prepare(sql)
    .bind(stateKey, ...rowIds)
    .all();

  const rows = Array.isArray(result?.results) ? result.results : [];
  const latestByRowId = new Map();
  for (const row of rows) {
    const mapped = mapRowLogRecord(row);
    if (!mapped || latestByRowId.has(mapped.rowId)) {
      continue;
    }
    latestByRowId.set(mapped.rowId, mapped);
  }
  return latestByRowId;
}

const CURRENT_ROW_COLUMNS = [
  "state_key",
  "row_id",
  "sort_index",
  "nm_id",
  "cabinet",
  "supplier_id",
  "stock_value",
  "in_stock",
  "stock_source",
  "current_price",
  "base_price",
  "price_source",
  "error",
  "updated_at",
  "card_code",
  "product_name",
  "category_name",
  "brand_name",
  "has_video",
  "has_recommendations",
  "has_rich",
  "rich_block_count",
  "has_autoplay",
  "has_tags",
  "cover_duplicate",
  "listing_slides_count",
  "rich_slides_count",
  "recommendation_known_count",
  "recommendation_refs_json",
  "color_count",
  "color_nm_ids_json",
  "rating",
  "review_count",
  "market_error",
  "row_data_json",
  "row_payload_json",
  "row_hash",
  "last_saved_at",
  "created_at",
  "saved_by_user_id",
  "saved_by_login",
  "saved_by_role",
  "saved_by_ip",
];

const UPSERT_ROW_SQL = `INSERT INTO dashboard_rows_current (${CURRENT_ROW_COLUMNS.join(", ")})
VALUES (${CURRENT_ROW_COLUMNS.map((_, index) => `?${index + 1}`).join(", ")})
ON CONFLICT(state_key, row_id) DO UPDATE SET
  sort_index = excluded.sort_index,
  nm_id = excluded.nm_id,
  cabinet = excluded.cabinet,
  supplier_id = excluded.supplier_id,
  stock_value = excluded.stock_value,
  in_stock = excluded.in_stock,
  stock_source = excluded.stock_source,
  current_price = excluded.current_price,
  base_price = excluded.base_price,
  price_source = excluded.price_source,
  error = excluded.error,
  updated_at = excluded.updated_at,
  card_code = excluded.card_code,
  product_name = excluded.product_name,
  category_name = excluded.category_name,
  brand_name = excluded.brand_name,
  has_video = excluded.has_video,
  has_recommendations = excluded.has_recommendations,
  has_rich = excluded.has_rich,
  rich_block_count = excluded.rich_block_count,
  has_autoplay = excluded.has_autoplay,
  has_tags = excluded.has_tags,
  cover_duplicate = excluded.cover_duplicate,
  listing_slides_count = excluded.listing_slides_count,
  rich_slides_count = excluded.rich_slides_count,
  recommendation_known_count = excluded.recommendation_known_count,
  recommendation_refs_json = excluded.recommendation_refs_json,
  color_count = excluded.color_count,
  color_nm_ids_json = excluded.color_nm_ids_json,
  rating = excluded.rating,
  review_count = excluded.review_count,
  market_error = excluded.market_error,
  row_data_json = excluded.row_data_json,
  row_payload_json = excluded.row_payload_json,
  row_hash = excluded.row_hash,
  last_saved_at = excluded.last_saved_at,
  saved_by_user_id = excluded.saved_by_user_id,
  saved_by_login = excluded.saved_by_login,
  saved_by_role = excluded.saved_by_role,
  saved_by_ip = excluded.saved_by_ip`;

const INSERT_ROW_VERSION_SQL = `INSERT INTO dashboard_row_versions (
  state_key,
  row_id,
  nm_id,
  sort_index,
  operation,
  version_saved_at,
  actor_user_id,
  actor_login,
  actor_role,
  actor_ip,
  cabinet,
  supplier_id,
  stock_value,
  in_stock,
  stock_source,
  current_price,
  base_price,
  price_source,
  error,
  updated_at,
  card_code,
  product_name,
  category_name,
  brand_name,
  has_video,
  has_recommendations,
  has_rich,
  rich_block_count,
  has_autoplay,
  has_tags,
  cover_duplicate,
  listing_slides_count,
  rich_slides_count,
  recommendation_known_count,
  recommendation_refs_json,
  color_count,
  color_nm_ids_json,
  rating,
  review_count,
  market_error,
  row_data_json,
  row_payload_json,
  row_hash,
  created_at
) VALUES (
  ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
  ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20,
  ?21, ?22, ?23, ?24, ?25, ?26, ?27, ?28, ?29, ?30,
  ?31, ?32, ?33, ?34, ?35, ?36, ?37, ?38, ?39, ?40,
  ?41, ?42, ?43, ?44
)`;

const UPSERT_ROW_LOG_SQL = `INSERT INTO dashboard_row_logs (
  state_key,
  row_id,
  log_id,
  at,
  source,
  mode,
  action_key,
  status,
  error,
  changes_json,
  actor_user_id,
  actor_login,
  actor_role,
  actor_ip,
  created_at
) VALUES (
  ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15
)
ON CONFLICT(state_key, row_id, log_id) DO UPDATE SET
  at = excluded.at,
  source = excluded.source,
  mode = excluded.mode,
  action_key = excluded.action_key,
  status = excluded.status,
  error = excluded.error,
  changes_json = excluded.changes_json,
  actor_user_id = excluded.actor_user_id,
  actor_login = excluded.actor_login,
  actor_role = excluded.actor_role,
  actor_ip = excluded.actor_ip`;

const UPDATE_EXISTING_ROW_LOG_SQL = `UPDATE dashboard_row_logs
SET
  at = ?1,
  source = ?2,
  mode = ?3,
  action_key = ?4,
  status = ?5,
  error = ?6,
  changes_json = ?7,
  actor_user_id = ?8,
  actor_login = ?9,
  actor_role = ?10,
  actor_ip = ?11,
  created_at = ?12
WHERE state_key = ?13
  AND row_id = ?14
  AND log_id = ?15`;

const UPSERT_META_SQL = `INSERT INTO dashboard_state_meta (
  state_key,
  meta_json,
  saved_at,
  updated_at,
  actor_user_id,
  actor_login,
  actor_role,
  actor_ip
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
ON CONFLICT(state_key) DO UPDATE SET
  meta_json = excluded.meta_json,
  saved_at = excluded.saved_at,
  updated_at = excluded.updated_at,
  actor_user_id = excluded.actor_user_id,
  actor_login = excluded.actor_login,
  actor_role = excluded.actor_role,
  actor_ip = excluded.actor_ip`;

const UPSERT_LEGACY_STATE_SQL = `INSERT INTO dashboard_state (state_key, payload_json, saved_at, updated_at)
VALUES (?1, ?2, ?3, ?4)
ON CONFLICT(state_key) DO UPDATE SET
  payload_json = excluded.payload_json,
  saved_at = excluded.saved_at,
  updated_at = excluded.updated_at`;

const UPSERT_PROBLEM_SNAPSHOT_SQL = `INSERT INTO dashboard_problem_snapshots (
  state_key,
  snapshot_id,
  at,
  source,
  action_key,
  mode,
  total_rows,
  loaded_rows,
  error_rows,
  problems_json,
  cabinets_json,
  created_at,
  updated_at
) VALUES (
  ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
)
ON CONFLICT(state_key, snapshot_id) DO UPDATE SET
  at = excluded.at,
  source = excluded.source,
  action_key = excluded.action_key,
  mode = excluded.mode,
  total_rows = excluded.total_rows,
  loaded_rows = excluded.loaded_rows,
  error_rows = excluded.error_rows,
  problems_json = excluded.problems_json,
  cabinets_json = excluded.cabinets_json,
  updated_at = excluded.updated_at`;

const UPSERT_ARTICLE_REGISTRY_SQL = `INSERT INTO dashboard_article_registry (
  state_key,
  nm_id,
  first_seen_at,
  last_seen_at,
  last_seen_by_user_id,
  last_seen_by_login,
  last_seen_by_role,
  last_seen_by_ip
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
ON CONFLICT(state_key, nm_id) DO UPDATE SET
  last_seen_at = excluded.last_seen_at,
  last_seen_by_user_id = excluded.last_seen_by_user_id,
  last_seen_by_login = excluded.last_seen_by_login,
  last_seen_by_role = excluded.last_seen_by_role,
  last_seen_by_ip = excluded.last_seen_by_ip`;

export async function ensureStateTables(db) {
  if (!db) {
    return;
  }

  if (tablesEnsured) {
    return;
  }

  if (!tablesEnsurePromise) {
    tablesEnsurePromise = (async () => {
      const placeholders = REQUIRED_TABLES.map((_, index) => `?${index + 1}`).join(", ");
      const checkSql = `SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name IN (${placeholders})`;
      const checkResult = await db
        .prepare(checkSql)
        .bind(...REQUIRED_TABLES)
        .all();
      const existingNames = new Set(
        Array.isArray(checkResult?.results)
          ? checkResult.results.map((row) => safeString(row?.name, 120)).filter(Boolean)
          : [],
      );

      const hasAllTables = REQUIRED_TABLES.every((tableName) => existingNames.has(tableName));
      if (hasAllTables) {
        tablesEnsured = true;
        return;
      }

      const schemaSql = `
    CREATE TABLE IF NOT EXISTS dashboard_state (
      state_key TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dashboard_state_updated_at
      ON dashboard_state(updated_at);

    CREATE TABLE IF NOT EXISTS dashboard_state_meta (
      state_key TEXT PRIMARY KEY,
      meta_json TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      actor_user_id INTEGER,
      actor_login TEXT,
      actor_role TEXT,
      actor_ip TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_dashboard_state_meta_updated_at
      ON dashboard_state_meta(updated_at);

    CREATE TABLE IF NOT EXISTS dashboard_rows_current (
      state_key TEXT NOT NULL,
      row_id TEXT NOT NULL,
      sort_index INTEGER NOT NULL DEFAULT 0,
      nm_id TEXT NOT NULL,
      cabinet TEXT,
      supplier_id TEXT,
      stock_value INTEGER,
      in_stock INTEGER,
      stock_source TEXT,
      current_price INTEGER,
      base_price INTEGER,
      price_source TEXT,
      error TEXT,
      updated_at TEXT,
      card_code TEXT,
      product_name TEXT,
      category_name TEXT,
      brand_name TEXT,
      has_video INTEGER,
      has_recommendations INTEGER,
      has_rich INTEGER,
      rich_block_count INTEGER,
      has_autoplay INTEGER,
      has_tags INTEGER,
      cover_duplicate INTEGER,
      listing_slides_count INTEGER,
      rich_slides_count INTEGER,
      recommendation_known_count INTEGER,
      recommendation_refs_json TEXT,
      color_count INTEGER,
      color_nm_ids_json TEXT,
      rating REAL,
      review_count INTEGER,
      market_error TEXT,
      row_data_json TEXT,
      row_payload_json TEXT,
      row_hash TEXT NOT NULL,
      last_saved_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      saved_by_user_id INTEGER,
      saved_by_login TEXT,
      saved_by_role TEXT,
      saved_by_ip TEXT,
      PRIMARY KEY(state_key, row_id)
    );

    CREATE INDEX IF NOT EXISTS idx_dashboard_rows_current_nm
      ON dashboard_rows_current(state_key, nm_id);

    CREATE INDEX IF NOT EXISTS idx_dashboard_rows_current_updated
      ON dashboard_rows_current(state_key, updated_at);

    CREATE INDEX IF NOT EXISTS idx_dashboard_rows_current_cabinet
      ON dashboard_rows_current(state_key, cabinet);

    CREATE TABLE IF NOT EXISTS dashboard_article_registry (
      state_key TEXT NOT NULL,
      nm_id TEXT NOT NULL,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_seen_by_user_id INTEGER,
      last_seen_by_login TEXT,
      last_seen_by_role TEXT,
      last_seen_by_ip TEXT,
      PRIMARY KEY(state_key, nm_id)
    );

    CREATE INDEX IF NOT EXISTS idx_dashboard_article_registry_seen
      ON dashboard_article_registry(state_key, last_seen_at);

    CREATE TABLE IF NOT EXISTS dashboard_row_versions (
      version_id INTEGER PRIMARY KEY AUTOINCREMENT,
      state_key TEXT NOT NULL,
      row_id TEXT NOT NULL,
      nm_id TEXT NOT NULL,
      sort_index INTEGER NOT NULL DEFAULT 0,
      operation TEXT NOT NULL CHECK(operation IN ('upsert', 'delete', 'rollback')),
      version_saved_at TEXT NOT NULL,
      actor_user_id INTEGER,
      actor_login TEXT,
      actor_role TEXT,
      actor_ip TEXT,
      cabinet TEXT,
      supplier_id TEXT,
      stock_value INTEGER,
      in_stock INTEGER,
      stock_source TEXT,
      current_price INTEGER,
      base_price INTEGER,
      price_source TEXT,
      error TEXT,
      updated_at TEXT,
      card_code TEXT,
      product_name TEXT,
      category_name TEXT,
      brand_name TEXT,
      has_video INTEGER,
      has_recommendations INTEGER,
      has_rich INTEGER,
      rich_block_count INTEGER,
      has_autoplay INTEGER,
      has_tags INTEGER,
      cover_duplicate INTEGER,
      listing_slides_count INTEGER,
      rich_slides_count INTEGER,
      recommendation_known_count INTEGER,
      recommendation_refs_json TEXT,
      color_count INTEGER,
      color_nm_ids_json TEXT,
      rating REAL,
      review_count INTEGER,
      market_error TEXT,
      row_data_json TEXT,
      row_payload_json TEXT,
      row_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dashboard_row_versions_row
      ON dashboard_row_versions(state_key, row_id, version_saved_at);

    CREATE INDEX IF NOT EXISTS idx_dashboard_row_versions_nm
      ON dashboard_row_versions(state_key, nm_id);

    CREATE TABLE IF NOT EXISTS dashboard_row_logs (
      state_key TEXT NOT NULL,
      row_id TEXT NOT NULL,
      log_id TEXT NOT NULL,
      at TEXT NOT NULL,
      source TEXT,
      mode TEXT,
      action_key TEXT,
      status TEXT,
      error TEXT,
      changes_json TEXT,
      actor_user_id INTEGER,
      actor_login TEXT,
      actor_role TEXT,
      actor_ip TEXT,
      created_at TEXT NOT NULL,
      PRIMARY KEY(state_key, row_id, log_id)
    );

    CREATE INDEX IF NOT EXISTS idx_dashboard_row_logs_at
      ON dashboard_row_logs(state_key, row_id, at);

    CREATE TABLE IF NOT EXISTS dashboard_problem_snapshots (
      state_key TEXT NOT NULL,
      snapshot_id TEXT NOT NULL,
      at TEXT NOT NULL,
      source TEXT,
      action_key TEXT,
      mode TEXT,
      total_rows INTEGER,
      loaded_rows INTEGER,
      error_rows INTEGER,
      problems_json TEXT,
      cabinets_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(state_key, snapshot_id)
    );

    CREATE INDEX IF NOT EXISTS idx_dashboard_problem_snapshots_at
      ON dashboard_problem_snapshots(state_key, at);

    CREATE TABLE IF NOT EXISTS dashboard_save_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      state_key TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      rows_total INTEGER NOT NULL DEFAULT 0,
      rows_changed INTEGER NOT NULL DEFAULT 0,
      rows_deleted INTEGER NOT NULL DEFAULT 0,
      logs_upserted INTEGER NOT NULL DEFAULT 0,
      payload_size INTEGER NOT NULL DEFAULT 0,
      actor_user_id INTEGER,
      actor_login TEXT,
      actor_role TEXT,
      actor_ip TEXT,
      source TEXT,
      action_key TEXT,
      mode TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_dashboard_save_events_saved_at
      ON dashboard_save_events(state_key, saved_at);
  `;

      const statements = String(schemaSql)
        .split(";")
        .map((part) => part.trim())
        .filter(Boolean);

      for (const statement of statements) {
        const singleLine = statement.replace(/\s+/g, " ").trim();
        if (!singleLine) {
          continue;
        }
        await db.exec(singleLine);
      }

      tablesEnsured = true;
    })()
      .catch((error) => {
        tablesEnsured = false;
        throw error;
      })
      .finally(() => {
        tablesEnsurePromise = null;
      });
  }

  await tablesEnsurePromise;
}

async function getCurrentRowsMap(db, stateKey) {
  const result = await db
    .prepare(
      `SELECT *
       FROM dashboard_rows_current
       WHERE state_key = ?1`,
    )
    .bind(stateKey)
    .all();

  const rows = Array.isArray(result?.results) ? result.results : [];
  const byId = new Map();
  for (const row of rows) {
    byId.set(String(row.row_id || ""), row);
  }
  return byId;
}

async function getCurrentRowsMapByIds(db, stateKey, rowIdsRaw) {
  const rowIds = normalizeRowIdList(rowIdsRaw);
  if (rowIds.length <= 0) {
    return new Map();
  }

  const placeholders = rowIds.map((_, index) => `?${index + 2}`).join(", ");
  const sql = `SELECT *
    FROM dashboard_rows_current
    WHERE state_key = ?1
      AND row_id IN (${placeholders})`;

  const result = await db
    .prepare(sql)
    .bind(stateKey, ...rowIds)
    .all();

  const rows = Array.isArray(result?.results) ? result.results : [];
  const byId = new Map();
  for (const row of rows) {
    byId.set(String(row.row_id || ""), row);
  }
  return byId;
}

async function getMaxSortIndex(db, stateKey) {
  const row = await db
    .prepare(
      `SELECT MAX(sort_index) AS max_sort_index
       FROM dashboard_rows_current
       WHERE state_key = ?1`,
    )
    .bind(stateKey)
    .first();
  return Math.max(0, Number(row?.max_sort_index) || 0);
}

export async function getStateRowsCount(db, stateKey) {
  await ensureStateTables(db);

  const currentCountRow = await db
    .prepare(
      `SELECT COUNT(1) AS total
       FROM dashboard_rows_current
       WHERE state_key = ?1`,
    )
    .bind(stateKey)
    .first();

  const currentCount = Number(currentCountRow?.total) || 0;
  if (currentCount > 0) {
    return currentCount;
  }

  const legacyRow = await db
    .prepare(
      `SELECT payload_json
       FROM dashboard_state
       WHERE state_key = ?1
       LIMIT 1`,
    )
    .bind(stateKey)
    .first();

  const legacyPayload = parsePayloadJson(legacyRow?.payload_json || "");
  return getPayloadRowsCount(legacyPayload);
}

function mapCurrentRowToVersionBind(row, operation, actor, nowIso) {
  return [
    row.state_key,
    row.row_id,
    row.nm_id,
    row.sort_index,
    operation,
    nowIso,
    actor.userId,
    actor.login,
    actor.role,
    actor.ip,
    row.cabinet,
    row.supplier_id,
    row.stock_value,
    row.in_stock,
    row.stock_source,
    row.current_price,
    row.base_price,
    row.price_source,
    row.error,
    row.updated_at,
    row.card_code,
    row.product_name,
    row.category_name,
    row.brand_name,
    row.has_video,
    row.has_recommendations,
    row.has_rich,
    row.rich_block_count,
    row.has_autoplay,
    row.has_tags,
    row.cover_duplicate,
    row.listing_slides_count,
    row.rich_slides_count,
    row.recommendation_known_count,
    row.recommendation_refs_json,
    row.color_count,
    row.color_nm_ids_json,
    row.rating,
    row.review_count,
    row.market_error,
    row.row_data_json,
    row.row_payload_json,
    row.row_hash,
    nowIso,
  ];
}

function mapNormalizedRowToCurrentBind(row, existingCreatedAt = null) {
  return [
    row.stateKey,
    row.rowId,
    row.sortIndex,
    row.nmId,
    row.cabinet,
    row.supplierId,
    row.stockValue,
    row.inStock,
    row.stockSource,
    row.currentPrice,
    row.basePrice,
    row.priceSource,
    row.error,
    row.updatedAt,
    row.cardCode,
    row.productName,
    row.categoryName,
    row.brandName,
    row.hasVideo,
    row.hasRecommendations,
    row.hasRich,
    row.richBlockCount,
    row.hasAutoplay,
    row.hasTags,
    row.coverDuplicate,
    row.listingSlidesCount,
    row.richSlidesCount,
    row.recommendationKnownCount,
    row.recommendationRefsJson,
    row.colorCount,
    row.colorNmIdsJson,
    row.rating,
    row.reviewCount,
    row.marketError,
    row.rowDataJson,
    row.rowPayloadJson,
    row.rowHash,
    row.lastSavedAt,
    existingCreatedAt || row.createdAt,
    row.savedByUserId,
    row.savedByLogin,
    row.savedByRole,
    row.savedByIp,
  ];
}

function mapNormalizedRowToVersionBind(row, operation, actor, nowIso) {
  return [
    row.stateKey,
    row.rowId,
    row.nmId,
    row.sortIndex,
    operation,
    nowIso,
    actor.userId,
    actor.login,
    actor.role,
    actor.ip,
    row.cabinet,
    row.supplierId,
    row.stockValue,
    row.inStock,
    row.stockSource,
    row.currentPrice,
    row.basePrice,
    row.priceSource,
    row.error,
    row.updatedAt,
    row.cardCode,
    row.productName,
    row.categoryName,
    row.brandName,
    row.hasVideo,
    row.hasRecommendations,
    row.hasRich,
    row.richBlockCount,
    row.hasAutoplay,
    row.hasTags,
    row.coverDuplicate,
    row.listingSlidesCount,
    row.richSlidesCount,
    row.recommendationKnownCount,
    row.recommendationRefsJson,
    row.colorCount,
    row.colorNmIdsJson,
    row.rating,
    row.reviewCount,
    row.marketError,
    row.rowDataJson,
    row.rowPayloadJson,
    row.rowHash,
    nowIso,
  ];
}

function mapLogToBind(stateKey, rowId, log, actor, nowIso) {
  return [
    stateKey,
    rowId,
    log.logId,
    log.at,
    log.sourceType,
    log.mode,
    log.actionKey,
    log.status,
    log.error,
    toJson(log.changes, "[]"),
    actor.userId,
    actor.login,
    actor.role,
    actor.ip,
    nowIso,
  ];
}

function mapLogUpdateBind(stateKey, rowId, existingLogId, log, actor, nowIso) {
  return [
    log.at,
    log.sourceType,
    log.mode,
    log.actionKey,
    log.status,
    log.error,
    toJson(log.changes, "[]"),
    actor.userId,
    actor.login,
    actor.role,
    actor.ip,
    nowIso,
    stateKey,
    rowId,
    existingLogId,
  ];
}

function mapSnapshotToBind(stateKey, snapshot, nowIso) {
  return [
    stateKey,
    snapshot.snapshotId,
    snapshot.at,
    snapshot.source,
    snapshot.actionKey,
    snapshot.mode,
    snapshot.totalRows,
    snapshot.loadedRows,
    snapshot.errorRows,
    snapshot.problemsJson,
    snapshot.cabinetsJson,
    nowIso,
    nowIso,
  ];
}

async function pruneRowVersions(db, stateKey, rowId) {
  await db
    .prepare(
      `DELETE FROM dashboard_row_versions
       WHERE state_key = ?1
         AND row_id = ?2
         AND rowid <= (
           SELECT COALESCE(MAX(rowid), 0) - ?3
           FROM dashboard_row_versions
           WHERE state_key = ?1 AND row_id = ?2
         )`,
    )
    .bind(stateKey, rowId, ROW_VERSION_LIMIT)
    .run();
}

async function pruneRowLogs(db, stateKey, rowId) {
  await db
    .prepare(
      `DELETE FROM dashboard_row_logs
       WHERE state_key = ?1
         AND row_id = ?2
         AND rowid <= (
           SELECT COALESCE(MAX(rowid), 0) - ?3
           FROM dashboard_row_logs
           WHERE state_key = ?1 AND row_id = ?2
         )`,
    )
    .bind(stateKey, rowId, ROW_LOG_LIMIT)
    .run();
}

async function pruneSnapshots(db, stateKey) {
  await db
    .prepare(
      `DELETE FROM dashboard_problem_snapshots
       WHERE state_key = ?1
         AND rowid <= (
           SELECT COALESCE(MAX(rowid), 0) - ?2
           FROM dashboard_problem_snapshots
           WHERE state_key = ?1
         )`,
    )
    .bind(stateKey, SNAPSHOT_LIMIT)
    .run();
}

async function pruneSaveEvents(db, stateKey) {
  await db
    .prepare(
      `DELETE FROM dashboard_save_events
       WHERE state_key = ?1
         AND event_id <= (
           SELECT COALESCE(MAX(event_id), 0) - ?2
           FROM dashboard_save_events
           WHERE state_key = ?1
         )`,
    )
    .bind(stateKey, DASHBOARD_SAVE_EVENT_LIMIT)
    .run();
}

export async function saveDashboardState(db, input = {}) {
  await ensureStateTables(db);

  const stateKey = safeString(input.stateKey, 120) || DEFAULT_STATE_KEY;
  const payload = input.payload && typeof input.payload === "object" ? input.payload : null;
  if (!payload) {
    const error = new Error("payload must be an object");
    error.status = 400;
    throw error;
  }

  const actor = {
    stateKey,
    userId: Number.isFinite(Number(input.actorUserId)) ? Number(input.actorUserId) : null,
    login: safeString(input.actorLogin, 80),
    role: safeString(input.actorRole, 40),
    ip: safeString(input.actorIp, 64),
  };

  const nowIso = new Date().toISOString();
  const savedAtIso = toIsoOrNow(payload.savedAt || payload.lastSyncAt, nowIso);

  const rowsRaw = Array.isArray(payload.rows) ? payload.rows : [];
  const normalizedRows = [];
  for (let index = 0; index < rowsRaw.length; index += 1) {
    const normalized = await normalizeRowForStorage(rowsRaw[index], index, actor, savedAtIso);
    normalizedRows.push(normalized);
  }

  const snapshots = normalizeSnapshots(payload.updateSnapshots, savedAtIso);
  const metaPayload = normalizeMetaPayload(payload);
  const metaJson = toJson(metaPayload, "{}");

  const payloadBytes = (() => {
    try {
      const encoded = new TextEncoder().encode(JSON.stringify(payload));
      return encoded.byteLength;
    } catch {
      return 0;
    }
  })();

  const existingRowsById = await getCurrentRowsMap(db, stateKey);
  const existingLatestLogsByRowId = await getLatestRowLogs(db, stateKey);
  const existingSnapshotCount = await getSnapshotCount(db, stateKey);
  const incomingRowIds = new Set(normalizedRows.map((row) => row.rowId));

  const changedRowIds = new Set();
  const rowsWithUpdatedLogs = new Set();
  let rowsChanged = 0;
  let rowsDeleted = 0;
  let logsUpserted = 0;

  let txStarted = false;
  try {
    await db.exec("BEGIN");
    txStarted = true;
  } catch {
    txStarted = false;
  }

  try {
    await db.prepare(UPSERT_META_SQL)
      .bind(
        stateKey,
        metaJson,
        savedAtIso,
        nowIso,
        actor.userId,
        actor.login,
        actor.role,
        actor.ip,
      )
      .run();

    if (WRITE_LEGACY_STATE_ON_SAVE) {
      const legacyCompactPayload = {
        savedAt: savedAtIso,
        lastSyncAt: safeString(payload.lastSyncAt, 100) || savedAtIso,
        rowsCount: normalizedRows.length,
        migrated: true,
        updatedAt: nowIso,
      };

      await db.prepare(UPSERT_LEGACY_STATE_SQL)
        .bind(stateKey, JSON.stringify(legacyCompactPayload), savedAtIso, nowIso)
        .run();
    }

    for (const row of normalizedRows) {
      const existing = existingRowsById.get(row.rowId) || null;
      const existingHash = existing ? String(existing.row_hash || "") : "";
      const isChanged = !existing || existingHash !== row.rowHash;

      if (isChanged) {
        await db.prepare(UPSERT_ROW_SQL)
          .bind(...mapNormalizedRowToCurrentBind(row, existing?.created_at || null))
          .run();

        if (row.nmId && (!existing || TOUCH_ARTICLE_REGISTRY_ON_UPDATE)) {
          await db.prepare(UPSERT_ARTICLE_REGISTRY_SQL)
            .bind(
              stateKey,
              row.nmId,
              nowIso,
              nowIso,
              actor.userId,
              actor.login,
              actor.role,
              actor.ip,
            )
            .run();
        }

        rowsChanged += 1;
        changedRowIds.add(row.rowId);
        if (WRITE_UPSERT_ROW_VERSIONS) {
          await db.prepare(INSERT_ROW_VERSION_SQL)
            .bind(...mapNormalizedRowToVersionBind(row, "upsert", actor, nowIso))
            .run();
        }
      }

      const logPersistResult = await persistIncomingRowLogs(db, {
        stateKey,
        rowId: row.rowId,
        incomingLogs: row.logs,
        latestStoredLog: existingLatestLogsByRowId.get(row.rowId) || null,
        actor,
        nowIso,
      });
      if (logPersistResult.touched) {
        rowsWithUpdatedLogs.add(row.rowId);
      }
      if (logPersistResult.logsUpserted > 0) {
        logsUpserted += logPersistResult.logsUpserted;
      }
      if (logPersistResult.latestStoredLog) {
        existingLatestLogsByRowId.set(row.rowId, logPersistResult.latestStoredLog);
      }
    }

    for (const [rowId, existing] of existingRowsById.entries()) {
      if (incomingRowIds.has(rowId)) {
        continue;
      }

      rowsDeleted += 1;
      changedRowIds.add(rowId);

      if (WRITE_UPSERT_ROW_VERSIONS) {
        await db.prepare(INSERT_ROW_VERSION_SQL)
          .bind(...mapCurrentRowToVersionBind(existing, "delete", actor, nowIso))
          .run();
      }

      await db
        .prepare(
          `DELETE FROM dashboard_rows_current
           WHERE state_key = ?1 AND row_id = ?2`,
        )
        .bind(stateKey, rowId)
        .run();
    }

    const snapshotsToPersist =
      existingSnapshotCount <= 0 ? snapshots : snapshots.length > 0 ? snapshots.slice(-1) : [];

    for (const snapshot of snapshotsToPersist) {
      await db.prepare(UPSERT_PROBLEM_SNAPSHOT_SQL)
        .bind(...mapSnapshotToBind(stateKey, snapshot, nowIso))
        .run();
    }

    if (WRITE_SAVE_EVENTS) {
      await db
        .prepare(
          `INSERT INTO dashboard_save_events (
            state_key,
            saved_at,
            rows_total,
            rows_changed,
            rows_deleted,
            logs_upserted,
            payload_size,
            actor_user_id,
            actor_login,
            actor_role,
            actor_ip,
            source,
            action_key,
            mode,
            created_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
        )
        .bind(
          stateKey,
          savedAtIso,
          normalizedRows.length,
          rowsChanged,
          rowsDeleted,
          logsUpserted,
          payloadBytes,
          actor.userId,
          actor.login,
          actor.role,
          actor.ip,
          safeString(payload.source, 40) || "manual",
          safeString(payload.actionKey, 80) || "all",
          safeString(payload.mode, 40) || "full",
          nowIso,
        )
        .run();
    }

    await maybeCompactStateStorage(db, stateKey, savedAtIso, nowIso);

    const rowsToPruneLogs = new Set([...rowsWithUpdatedLogs]);

    if (WRITE_UPSERT_ROW_VERSIONS) {
      for (const rowId of changedRowIds) {
        await pruneRowVersions(db, stateKey, rowId);
      }
    }
    for (const rowId of rowsToPruneLogs) {
      await pruneRowLogs(db, stateKey, rowId);
    }

    await pruneSnapshots(db, stateKey);
    if (WRITE_SAVE_EVENTS) {
      await pruneSaveEvents(db, stateKey);
    }

    if (txStarted) {
      await db.exec("COMMIT");
    }
  } catch (error) {
    if (txStarted) {
      try {
        await db.exec("ROLLBACK");
      } catch {
        // noop
      }
    }
    throw error;
  }

  return {
    key: stateKey,
    savedAt: savedAtIso,
    updatedAt: nowIso,
    rowsTotal: normalizedRows.length,
    rowsChanged,
    rowsDeleted,
    logsUpserted,
    payloadBytes,
  };
}

export async function saveDashboardStatePatch(db, input = {}) {
  await ensureStateTables(db);

  const stateKey = safeString(input.stateKey, 120) || DEFAULT_STATE_KEY;
  const patch = input.patch && typeof input.patch === "object" ? input.patch : null;
  if (!patch) {
    const error = new Error("patch must be an object");
    error.status = 400;
    throw error;
  }

  const actor = {
    stateKey,
    userId: Number.isFinite(Number(input.actorUserId)) ? Number(input.actorUserId) : null,
    login: safeString(input.actorLogin, 80),
    role: safeString(input.actorRole, 40),
    ip: safeString(input.actorIp, 64),
  };

  const allowRowInsert = input.allowRowInsert !== false;
  const allowRowDelete = input.allowRowDelete !== false;
  const confirmMassDelete = input.confirmMassDelete === true;

  const nowIso = new Date().toISOString();
  const savedAtIso = toIsoOrNow(patch.savedAt || patch.lastSyncAt, nowIso);
  const rowsUpsertRaw = Array.isArray(patch.rowsUpsert) ? patch.rowsUpsert : [];
  const rowIdsDelete = normalizeRowIdList(patch.rowIdsDelete);
  const snapshots = normalizeSnapshots(patch.updateSnapshots, savedAtIso);
  const metaSource =
    patch.meta && typeof patch.meta === "object" && !Array.isArray(patch.meta) ? patch.meta : patch;
  const metaPayload = normalizeMetaPayload({
    ...metaSource,
    savedAt: patch.savedAt || metaSource.savedAt || savedAtIso,
    lastSyncAt: patch.lastSyncAt || metaSource.lastSyncAt || savedAtIso,
  });
  const metaJson = toJson(metaPayload, "{}");

  const payloadBytes = (() => {
    try {
      const encoded = new TextEncoder().encode(JSON.stringify(patch));
      return encoded.byteLength;
    } catch {
      return 0;
    }
  })();

  const upsertCandidateRowIds = [];
  const candidateRowIdsSet = new Set();
  for (const rowRaw of rowsUpsertRaw) {
    const rowCandidate = rowRaw && typeof rowRaw === "object" ? rowRaw : null;
    if (!rowCandidate) {
      continue;
    }
    const candidateNmId = normalizeNmId(rowCandidate.nmId);
    const candidateRowId = safeString(rowCandidate.id, 120);
    const rowId = candidateNmId || candidateRowId;
    if (!rowId) {
      continue;
    }
    if (!candidateRowIdsSet.has(rowId)) {
      candidateRowIdsSet.add(rowId);
    }
    upsertCandidateRowIds.push(rowId);
  }
  for (const rowId of rowIdsDelete) {
    if (!candidateRowIdsSet.has(rowId)) {
      candidateRowIdsSet.add(rowId);
    }
  }

  const existingRowsTotal = await getCurrentRowsCount(db, stateKey);
  const existingRowsById = await getCurrentRowsMapByIds(db, stateKey, Array.from(candidateRowIdsSet));
  const existingLatestLogsByRowId = await getLatestRowLogsForRows(db, stateKey, upsertCandidateRowIds);
  const existingSnapshotCount = await getSnapshotCount(db, stateKey);
  let maxSortIndex = await getMaxSortIndex(db, stateKey);

  const rowIdsToDeleteExisting = rowIdsDelete.filter((rowId) => existingRowsById.has(rowId));
  if (!allowRowDelete && rowIdsToDeleteExisting.length > 0) {
    const error = new Error("Only admin can add or remove products.");
    error.status = 403;
    throw error;
  }

  if (
    rowIdsToDeleteExisting.length > 0 &&
    existingRowsTotal >= 50 &&
    rowIdsToDeleteExisting.length >= Math.max(1, Math.ceil(existingRowsTotal * 0.5)) &&
    !confirmMassDelete
  ) {
    const error = new Error(
      "Mass delete protection: rows reduction exceeds 50%. Confirm explicitly with confirmMassDelete=true.",
    );
    error.status = 409;
    throw error;
  }

  const rowsUpsertNormalized = [];
  for (const rowRaw of rowsUpsertRaw) {
    const rowCandidate = rowRaw && typeof rowRaw === "object" ? rowRaw : null;
    if (!rowCandidate) {
      continue;
    }

    const candidateNmId = normalizeNmId(rowCandidate.nmId);
    const candidateRowId = safeString(rowCandidate.id, 120);
    const rowId = candidateNmId || candidateRowId;
    if (!rowId) {
      continue;
    }

    const existing = existingRowsById.get(rowId) || null;
    if (!allowRowInsert && !existing) {
      const error = new Error("Only admin can add or remove products.");
      error.status = 403;
      throw error;
    }

    let sortIndex = Number.isFinite(Number(rowCandidate.sortIndex))
      ? Math.max(0, Math.round(Number(rowCandidate.sortIndex)))
      : existing && Number.isFinite(Number(existing.sort_index))
        ? Math.max(0, Math.round(Number(existing.sort_index)))
        : NaN;

    if (!Number.isFinite(sortIndex)) {
      maxSortIndex += 1;
      sortIndex = maxSortIndex;
    }

    const normalized = await normalizeRowForStorage(
      {
        ...rowCandidate,
        id: rowId,
      },
      sortIndex,
      actor,
      savedAtIso,
    );
    rowsUpsertNormalized.push(normalized);
  }

  const changedRowIds = new Set();
  const rowsWithUpdatedLogs = new Set();
  let rowsChanged = 0;
  let rowsDeleted = 0;
  let logsUpserted = 0;
  let rowsTotalCurrent = existingRowsTotal;

  let txStarted = false;
  try {
    await db.exec("BEGIN");
    txStarted = true;
  } catch {
    txStarted = false;
  }

  try {
    await db.prepare(UPSERT_META_SQL)
      .bind(
        stateKey,
        metaJson,
        savedAtIso,
        nowIso,
        actor.userId,
        actor.login,
        actor.role,
        actor.ip,
      )
      .run();

    for (const row of rowsUpsertNormalized) {
      const existing = existingRowsById.get(row.rowId) || null;
      const existingHash = existing ? String(existing.row_hash || "") : "";
      const isChanged = !existing || existingHash !== row.rowHash;

      if (isChanged) {
        await db.prepare(UPSERT_ROW_SQL)
          .bind(...mapNormalizedRowToCurrentBind(row, existing?.created_at || null))
          .run();

        if (row.nmId && (!existing || TOUCH_ARTICLE_REGISTRY_ON_UPDATE)) {
          await db.prepare(UPSERT_ARTICLE_REGISTRY_SQL)
            .bind(
              stateKey,
              row.nmId,
              nowIso,
              nowIso,
              actor.userId,
              actor.login,
              actor.role,
              actor.ip,
            )
            .run();
        }

        if (!existing) {
          rowsTotalCurrent += 1;
        }
        rowsChanged += 1;
        changedRowIds.add(row.rowId);
        if (WRITE_UPSERT_ROW_VERSIONS) {
          await db.prepare(INSERT_ROW_VERSION_SQL)
            .bind(...mapNormalizedRowToVersionBind(row, "upsert", actor, nowIso))
            .run();
        }

        existingRowsById.set(row.rowId, {
          ...(existing || {}),
          row_id: row.rowId,
          row_hash: row.rowHash,
          created_at: existing?.created_at || row.createdAt,
          sort_index: row.sortIndex,
        });
      }

      const logPersistResult = await persistIncomingRowLogs(db, {
        stateKey,
        rowId: row.rowId,
        incomingLogs: row.logs,
        latestStoredLog: existingLatestLogsByRowId.get(row.rowId) || null,
        actor,
        nowIso,
      });
      if (logPersistResult.touched) {
        rowsWithUpdatedLogs.add(row.rowId);
      }
      if (logPersistResult.logsUpserted > 0) {
        logsUpserted += logPersistResult.logsUpserted;
      }
      if (logPersistResult.latestStoredLog) {
        existingLatestLogsByRowId.set(row.rowId, logPersistResult.latestStoredLog);
      }
    }

    for (const rowId of rowIdsToDeleteExisting) {
      const existing = existingRowsById.get(rowId) || null;
      if (!existing) {
        continue;
      }

      rowsDeleted += 1;
      changedRowIds.add(rowId);
      rowsTotalCurrent = Math.max(0, rowsTotalCurrent - 1);

      if (WRITE_UPSERT_ROW_VERSIONS) {
        await db.prepare(INSERT_ROW_VERSION_SQL)
          .bind(...mapCurrentRowToVersionBind(existing, "delete", actor, nowIso))
          .run();
      }

      await db
        .prepare(
          `DELETE FROM dashboard_rows_current
           WHERE state_key = ?1 AND row_id = ?2`,
        )
        .bind(stateKey, rowId)
        .run();

      existingRowsById.delete(rowId);
    }

    const snapshotsToPersist =
      existingSnapshotCount <= 0 ? snapshots : snapshots.length > 0 ? snapshots.slice(-1) : [];

    for (const snapshot of snapshotsToPersist) {
      await db.prepare(UPSERT_PROBLEM_SNAPSHOT_SQL)
        .bind(...mapSnapshotToBind(stateKey, snapshot, nowIso))
        .run();
    }

    if (WRITE_SAVE_EVENTS) {
      await db
        .prepare(
          `INSERT INTO dashboard_save_events (
            state_key,
            saved_at,
            rows_total,
            rows_changed,
            rows_deleted,
            logs_upserted,
            payload_size,
            actor_user_id,
            actor_login,
            actor_role,
            actor_ip,
            source,
            action_key,
            mode,
            created_at
          ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
        )
        .bind(
          stateKey,
          savedAtIso,
          rowsTotalCurrent,
          rowsChanged,
          rowsDeleted,
          logsUpserted,
          payloadBytes,
          actor.userId,
          actor.login,
          actor.role,
          actor.ip,
          safeString(patch.source, 40) || "manual",
          safeString(patch.actionKey, 80) || "delta",
          safeString(patch.mode, 40) || "partial",
          nowIso,
        )
        .run();
    }

    await maybeCompactStateStorage(db, stateKey, savedAtIso, nowIso);

    if (WRITE_LEGACY_STATE_ON_SAVE) {
      const compactPayload = {
        savedAt: savedAtIso,
        lastSyncAt: safeString(patch.lastSyncAt, 100) || savedAtIso,
        rowsCount: rowsTotalCurrent,
        migrated: true,
        updatedAt: nowIso,
      };
      await db.prepare(UPSERT_LEGACY_STATE_SQL)
        .bind(stateKey, JSON.stringify(compactPayload), savedAtIso, nowIso)
        .run();
    }

    const rowsToPruneLogs = new Set([...rowsWithUpdatedLogs]);
    if (WRITE_UPSERT_ROW_VERSIONS) {
      for (const rowId of changedRowIds) {
        await pruneRowVersions(db, stateKey, rowId);
      }
    }
    for (const rowId of rowsToPruneLogs) {
      await pruneRowLogs(db, stateKey, rowId);
    }

    await pruneSnapshots(db, stateKey);
    if (WRITE_SAVE_EVENTS) {
      await pruneSaveEvents(db, stateKey);
    }

    if (txStarted) {
      await db.exec("COMMIT");
    }
  } catch (error) {
    if (txStarted) {
      try {
        await db.exec("ROLLBACK");
      } catch {
        // noop
      }
    }
    throw error;
  }

  return {
    key: stateKey,
    savedAt: savedAtIso,
    updatedAt: nowIso,
    rowsTotal: rowsTotalCurrent,
    rowsChanged,
    rowsDeleted,
    logsUpserted,
    payloadBytes,
  };
}

function buildPayloadRowFromDb(row, logsByRowId) {
  const rowId = safeString(row.row_id, 120);
  const data = parseJson(row.row_data_json, null);
  const updateLogs = logsByRowId.get(rowId) || [];

  return {
    id: rowId,
    nmId: safeString(row.nm_id, 40),
    cabinet: safeString(row.cabinet, 120),
    supplierId: safeNullableString(row.supplier_id, 40),
    stockValue: toIntegerOrNull(row.stock_value),
    inStock: dbToBool(row.in_stock),
    stockSource: safeString(row.stock_source, 80),
    currentPrice: toIntegerOrNull(row.current_price),
    basePrice: toIntegerOrNull(row.base_price),
    priceSource: safeString(row.price_source, 80),
    error: safeString(row.error, 4000),
    data,
    updatedAt: toIsoOrNull(row.updated_at),
    updateLogs,
  };
}

async function loadRowLogsByStateKey(db, stateKey) {
  const result = await db
    .prepare(
      `SELECT
         row_id,
         log_id,
         at,
         source,
         mode,
         action_key,
         status,
         error,
         changes_json,
         actor_login,
         actor_role,
         actor_ip
       FROM dashboard_row_logs
       WHERE state_key = ?1
       ORDER BY at ASC, log_id ASC`,
    )
    .bind(stateKey)
    .all();

  const logsByRowId = new Map();
  const rows = Array.isArray(result?.results) ? result.results : [];

  for (const row of rows) {
    const rowId = safeString(row.row_id, 120);
    if (!rowId) {
      continue;
    }

    const logEntry = {
      id: safeString(row.log_id, 120),
      at: toIsoOrNow(row.at, new Date().toISOString()),
      source: safeString(row.source, 40).toLowerCase() === "system" ? "system" : "manual",
      mode: safeString(row.mode, 40) || "full",
      actionKey: safeString(row.action_key, 80) || "row-refresh",
      status: safeString(row.status, 20).toLowerCase() === "error" ? "error" : "success",
      error: safeString(row.error, 4000),
      actorLogin: safeString(row.actor_login, 80),
      actorRole: safeString(row.actor_role, 40),
      actorIp: safeString(row.actor_ip, 64),
      changes: (() => {
        const parsed = parseJson(row.changes_json, []);
        return Array.isArray(parsed) ? parsed : [];
      })(),
    };

    if (!logsByRowId.has(rowId)) {
      logsByRowId.set(rowId, []);
    }
    const bucket = logsByRowId.get(rowId);
    bucket.push(logEntry);
    if (bucket.length > ROW_LOG_LIMIT) {
      bucket.splice(0, bucket.length - ROW_LOG_LIMIT);
    }
  }

  return logsByRowId;
}

async function loadProblemSnapshots(db, stateKey) {
  const result = await db
    .prepare(
      `SELECT
         snapshot_id,
         at,
         source,
         action_key,
         mode,
         total_rows,
         loaded_rows,
         error_rows,
         problems_json,
         cabinets_json
       FROM dashboard_problem_snapshots
       WHERE state_key = ?1
       ORDER BY at ASC, snapshot_id ASC
       LIMIT ?2`,
    )
    .bind(stateKey, SNAPSHOT_LIMIT)
    .all();

  const rows = Array.isArray(result?.results) ? result.results : [];

  return rows.map((row) => {
    const problems = parseJson(row.problems_json, {});
    const cabinets = parseJson(row.cabinets_json, []);
    return {
      id: safeString(row.snapshot_id, 120),
      at: toIsoOrNow(row.at, new Date().toISOString()),
      source: safeString(row.source, 40).toLowerCase() === "system" ? "system" : "manual",
      actionKey: safeString(row.action_key, 80) || "all",
      mode: safeString(row.mode, 40) || "full",
      totalRows: Math.max(0, toIntegerOrNull(row.total_rows) || 0),
      loadedRows: Math.max(0, toIntegerOrNull(row.loaded_rows) || 0),
      errorRows: Math.max(0, toIntegerOrNull(row.error_rows) || 0),
      problems: problems && typeof problems === "object" && !Array.isArray(problems) ? problems : {},
      cabinets: Array.isArray(cabinets) ? cabinets : [],
    };
  });
}

export async function loadDashboardState(db, stateKey) {
  await ensureStateTables(db);

  const metaRow = await db
    .prepare(
      `SELECT
         state_key,
         meta_json,
         saved_at,
         updated_at
       FROM dashboard_state_meta
       WHERE state_key = ?1
       LIMIT 1`,
    )
    .bind(stateKey)
    .first();

  const rowsResult = await db
    .prepare(
      `SELECT *
       FROM dashboard_rows_current
       WHERE state_key = ?1
       ORDER BY sort_index ASC, row_id ASC`,
    )
    .bind(stateKey)
    .all();
  const currentRows = Array.isArray(rowsResult?.results) ? rowsResult.results : [];

  if (!metaRow && currentRows.length <= 0) {
    const legacyRow = await db
      .prepare(
        `SELECT state_key, payload_json, saved_at, updated_at
         FROM dashboard_state
         WHERE state_key = ?1
         LIMIT 1`,
      )
      .bind(stateKey)
      .first();

    if (!legacyRow) {
      return {
        key: stateKey,
        payload: null,
        savedAt: null,
        updatedAt: null,
      };
    }

    const legacyPayload = parsePayloadJson(legacyRow.payload_json || "");
    return {
      key: stateKey,
      payload: legacyPayload,
      savedAt: safeNullableString(legacyRow.saved_at, 100),
      updatedAt: safeNullableString(legacyRow.updated_at, 100),
    };
  }

  const metaPayload = parseJson(metaRow?.meta_json, {}) || {};
  const logsByRowId = await loadRowLogsByStateKey(db, stateKey);
  const updateSnapshots = await loadProblemSnapshots(db, stateKey);

  const payloadRows = currentRows.map((row) => buildPayloadRowFromDb(row, logsByRowId));

  const payload = {
    ...metaPayload,
    savedAt: safeString(metaRow?.saved_at || metaPayload.savedAt || "", 100) || null,
    rows: payloadRows,
    updateSnapshots,
  };

  const savedAt = safeNullableString(metaRow?.saved_at || payload.savedAt, 100);
  const updatedAt = safeNullableString(metaRow?.updated_at || payload.lastSyncAt, 100);

  return {
    key: stateKey,
    payload,
    savedAt,
    updatedAt,
  };
}

function csvEscape(valueRaw) {
  const value = valueRaw === null || valueRaw === undefined ? "" : String(valueRaw);
  const escaped = value.replaceAll('"', '""');
  return `"${escaped}"`;
}

function boolToRu(valueRaw) {
  const value = dbToBool(valueRaw);
  if (value === true) {
    return "Да";
  }
  if (value === false) {
    return "Нет";
  }
  return "Н/Д";
}

function formatNumberWithSpace(valueRaw) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return "";
  }
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function parseListJson(jsonRaw) {
  const parsed = parseJson(jsonRaw, []);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed.map((item) => safeString(item, 40)).filter(Boolean);
}

function deriveProblemFlagYesNo(boolValueRaw) {
  const value = dbToBool(boolValueRaw);
  if (value === false) {
    return "Да";
  }
  if (value === true) {
    return "Нет";
  }
  return "Н/Д";
}

export async function getDashboardExportRows(db, stateKey) {
  await ensureStateTables(db);

  const result = await db
    .prepare(
      `SELECT *
       FROM dashboard_rows_current
       WHERE state_key = ?1
       ORDER BY cabinet COLLATE NOCASE ASC, nm_id ASC`,
    )
    .bind(stateKey)
    .all();

  const rows = Array.isArray(result?.results) ? result.results : [];

  return rows.map((row) => {
    const recommendationRefs = parseListJson(row.recommendation_refs_json);
    const colorNmIds = parseListJson(row.color_nm_ids_json);

    return {
      stateKey: safeString(row.state_key, 120),
      rowId: safeString(row.row_id, 120),
      nmId: safeString(row.nm_id, 40),
      cardCode: safeString(row.card_code, 80),
      cabinet: safeString(row.cabinet, 120),
      supplierId: safeString(row.supplier_id, 40),
      name: safeString(row.product_name, 400),
      category: safeString(row.category_name, 240),
      brand: safeString(row.brand_name, 240),
      stockValue: Number.isFinite(Number(row.stock_value)) ? Number(row.stock_value) : null,
      inStock: boolToRu(row.in_stock),
      currentPrice: Number.isFinite(Number(row.current_price)) ? Number(row.current_price) : null,
      basePrice: Number.isFinite(Number(row.base_price)) ? Number(row.base_price) : null,
      rating: Number.isFinite(Number(row.rating)) ? Number(row.rating) : null,
      reviewCount: Number.isFinite(Number(row.review_count)) ? Number(row.review_count) : null,
      hasVideo: boolToRu(row.has_video),
      hasRecommendations: boolToRu(row.has_recommendations),
      hasRich: boolToRu(row.has_rich),
      hasAutoplay: boolToRu(row.has_autoplay),
      hasTags: boolToRu(row.has_tags),
      coverDuplicate: boolToRu(row.cover_duplicate),
      recommendationCount: Math.max(0, Number(row.recommendation_known_count) || 0),
      listingSlidesCount: Math.max(0, Number(row.listing_slides_count) || 0),
      richSlidesCount: Math.max(0, Number(row.rich_slides_count) || 0),
      colorCount: Math.max(0, Number(row.color_count) || 0),
      recommendationRefs: recommendationRefs.join(", "),
      colorNmIds: colorNmIds.join(", "),
      marketError: safeString(row.market_error, 2000),
      rowError: safeString(row.error, 4000),
      problemLoadError: row.error ? "Да" : "Нет",
      problemRecommendations: deriveProblemFlagYesNo(row.has_recommendations),
      problemRich: deriveProblemFlagYesNo(row.has_rich),
      problemVideo: deriveProblemFlagYesNo(row.has_video),
      problemAutoplay: deriveProblemFlagYesNo(row.has_autoplay),
      problemTags: deriveProblemFlagYesNo(row.has_tags),
      problemCoverDuplicate: dbToBool(row.cover_duplicate) === true ? "Да" : "Нет",
      updatedAt: safeString(row.updated_at, 100),
      lastSavedAt: safeString(row.last_saved_at, 100),
      savedByLogin: safeString(row.saved_by_login, 80),
      savedByRole: safeString(row.saved_by_role, 40),
      savedByIp: safeString(row.saved_by_ip, 64),
    };
  });
}

export function buildDashboardExportCsv(rowsRaw) {
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  const columns = [
    ["stateKey", "state_key"],
    ["rowId", "row_id"],
    ["nmId", "nm_id"],
    ["cardCode", "vendor_code"],
    ["cabinet", "cabinet"],
    ["supplierId", "supplier_id"],
    ["name", "product_name"],
    ["category", "category"],
    ["brand", "brand"],
    ["stockValue", "stock_qty"],
    ["inStock", "in_stock"],
    ["currentPrice", "current_price_rub"],
    ["basePrice", "base_price_rub"],
    ["rating", "rating"],
    ["reviewCount", "review_count"],
    ["hasVideo", "video"],
    ["hasRecommendations", "recommendations"],
    ["hasRich", "rich"],
    ["hasAutoplay", "autoplay"],
    ["hasTags", "tags"],
    ["coverDuplicate", "cover_duplicate"],
    ["recommendationCount", "recommendation_count"],
    ["listingSlidesCount", "listing_slides_count"],
    ["richSlidesCount", "rich_slides_count"],
    ["colorCount", "color_count"],
    ["recommendationRefs", "recommendation_nm_ids"],
    ["colorNmIds", "color_nm_ids"],
    ["marketError", "market_error"],
    ["rowError", "row_error"],
    ["problemLoadError", "problem_load_error"],
    ["problemRecommendations", "problem_recommendations"],
    ["problemRich", "problem_rich"],
    ["problemVideo", "problem_video"],
    ["problemAutoplay", "problem_autoplay"],
    ["problemTags", "problem_tags"],
    ["problemCoverDuplicate", "problem_cover_duplicate"],
    ["updatedAt", "row_updated_at"],
    ["lastSavedAt", "saved_at"],
    ["savedByLogin", "saved_by_login"],
    ["savedByRole", "saved_by_role"],
    ["savedByIp", "saved_by_ip"],
  ];

  const lines = [];
  lines.push(columns.map(([, title]) => csvEscape(title)).join(CSV_SEPARATOR));

  for (const row of rows) {
    const values = columns.map(([key]) => {
      const value = row[key];
      if (key === "currentPrice" || key === "basePrice") {
        return csvEscape(Number.isFinite(value) ? formatNumberWithSpace(value) : "");
      }
      if (key === "stockValue" || key === "reviewCount" || key === "recommendationCount" || key === "listingSlidesCount" || key === "richSlidesCount" || key === "colorCount") {
        return csvEscape(Number.isFinite(value) ? String(Math.round(value)) : "");
      }
      if (key === "rating") {
        return csvEscape(Number.isFinite(value) ? String(Math.round(value * 10) / 10).replace(".", ",") : "");
      }
      return csvEscape(value ?? "");
    });

    lines.push(values.join(CSV_SEPARATOR));
  }

  return `\uFEFF${lines.join("\n")}`;
}

function buildPayloadRowFromVersion(versionRow) {
  const rowData = parseJson(versionRow.row_data_json, null);
  return {
    id: safeString(versionRow.row_id, 120),
    nmId: safeString(versionRow.nm_id, 40),
    cabinet: safeString(versionRow.cabinet, 120),
    supplierId: safeNullableString(versionRow.supplier_id, 40),
    stockValue: toIntegerOrNull(versionRow.stock_value),
    inStock: dbToBool(versionRow.in_stock),
    stockSource: safeString(versionRow.stock_source, 80),
    currentPrice: toIntegerOrNull(versionRow.current_price),
    basePrice: toIntegerOrNull(versionRow.base_price),
    priceSource: safeString(versionRow.price_source, 80),
    error: safeString(versionRow.error, 4000),
    updatedAt: toIsoOrNull(versionRow.updated_at),
    data: rowData,
    updateLogs: [],
  };
}

export async function rollbackRowToVersion(db, input = {}) {
  await ensureStateTables(db);

  const stateKey = safeString(input.stateKey, 120) || DEFAULT_STATE_KEY;
  const versionId = Number(input.versionId);
  if (!Number.isInteger(versionId) || versionId <= 0) {
    const error = new Error("versionId must be a positive integer");
    error.status = 400;
    throw error;
  }

  const actor = {
    userId: Number.isFinite(Number(input.actorUserId)) ? Number(input.actorUserId) : null,
    login: safeString(input.actorLogin, 80),
    role: safeString(input.actorRole, 40),
    ip: safeString(input.actorIp, 64),
  };

  const versionRow = await db
    .prepare(
      `SELECT *
       FROM dashboard_row_versions
       WHERE state_key = ?1 AND version_id = ?2
       LIMIT 1`,
    )
    .bind(stateKey, versionId)
    .first();

  if (!versionRow) {
    const error = new Error("Версия строки не найдена");
    error.status = 404;
    throw error;
  }

  const nowIso = new Date().toISOString();
  const restoredRow = buildPayloadRowFromVersion(versionRow);
  const normalized = await normalizeRowForStorage(restoredRow, Number(versionRow.sort_index) || 0, {
    stateKey,
    ...actor,
  }, nowIso);

  let txStarted = false;
  try {
    await db.exec("BEGIN");
    txStarted = true;
  } catch {
    txStarted = false;
  }

  try {
    await db.prepare(UPSERT_ROW_SQL)
      .bind(...mapNormalizedRowToCurrentBind(normalized, null))
      .run();

    await db.prepare(INSERT_ROW_VERSION_SQL)
      .bind(...mapNormalizedRowToVersionBind(normalized, "rollback", actor, nowIso))
      .run();

    await pruneRowVersions(db, stateKey, normalized.rowId);

    if (txStarted) {
      await db.exec("COMMIT");
    }
  } catch (error) {
    if (txStarted) {
      try {
        await db.exec("ROLLBACK");
      } catch {
        // noop
      }
    }
    throw error;
  }

  return {
    ok: true,
    stateKey,
    rowId: normalized.rowId,
    nmId: normalized.nmId,
    rollbackVersionId: versionId,
    savedAt: nowIso,
  };
}

export async function recoverStateRowsFromVersions(db, input = {}) {
  await ensureStateTables(db);

  const stateKey = safeString(input.stateKey, 120) || DEFAULT_STATE_KEY;
  const actor = {
    userId: Number.isFinite(Number(input.actorUserId)) ? Number(input.actorUserId) : null,
    login: safeString(input.actorLogin, 80),
    role: safeString(input.actorRole, 40),
    ip: safeString(input.actorIp, 64),
    stateKey,
  };
  const nowIso = new Date().toISOString();

  const currentRowsResult = await db
    .prepare(
      `SELECT row_id, nm_id, created_at
       FROM dashboard_rows_current
       WHERE state_key = ?1`,
    )
    .bind(stateKey)
    .all();
  const currentRows = Array.isArray(currentRowsResult?.results) ? currentRowsResult.results : [];
  const createdAtByRowId = new Map();
  for (const row of currentRows) {
    const rowId = safeString(row.row_id, 120);
    if (!rowId) {
      continue;
    }
    createdAtByRowId.set(rowId, safeNullableString(row.created_at, 100));
  }

  const legacyRow = await db
    .prepare(
      `SELECT payload_json
       FROM dashboard_state
       WHERE state_key = ?1
       LIMIT 1`,
    )
    .bind(stateKey)
    .first();
  const legacyPayload = parsePayloadJson(legacyRow?.payload_json || "");
  const legacyRowsCount = getPayloadRowsCount(legacyPayload);
  if (legacyPayload && legacyRowsCount > currentRows.length) {
    const saved = await saveDashboardState(db, {
      stateKey,
      payload: legacyPayload,
      actorUserId: actor.userId,
      actorLogin: actor.login,
      actorRole: actor.role,
      actorIp: actor.ip,
    });
    return {
      ok: true,
      stateKey,
      restoredRows: Math.max(0, saved.rowsTotal - currentRows.length),
      rowsTotal: saved.rowsTotal,
      sourceRows: legacyRowsCount,
      source: "legacy_state",
    };
  }

  const latestVersionsResult = await db
    .prepare(
      `SELECT v.*
       FROM dashboard_row_versions v
       JOIN (
         SELECT nm_id, MAX(version_id) AS latest_version_id
         FROM dashboard_row_versions
         WHERE state_key = ?1
           AND nm_id <> ''
           AND operation IN ('upsert', 'rollback')
         GROUP BY nm_id
       ) latest ON latest.latest_version_id = v.version_id
       WHERE v.state_key = ?1
       ORDER BY v.sort_index ASC, v.version_id ASC`,
    )
    .bind(stateKey)
    .all();
  const latestVersions = Array.isArray(latestVersionsResult?.results) ? latestVersionsResult.results : [];

  if (latestVersions.length <= 0) {
    return {
      ok: true,
      stateKey,
      restoredRows: 0,
      rowsTotal: currentRows.length,
      sourceRows: 0,
    };
  }

  let txStarted = false;
  try {
    await db.exec("BEGIN");
    txStarted = true;
  } catch {
    txStarted = false;
  }

  let restoredRows = 0;
  try {
    for (let index = 0; index < latestVersions.length; index += 1) {
      const versionRow = latestVersions[index];
      const payloadRow = buildPayloadRowFromVersion(versionRow);
      const normalized = await normalizeRowForStorage(payloadRow, index, actor, nowIso);
      const existingCreatedAt = createdAtByRowId.get(normalized.rowId) || null;

      await db.prepare(UPSERT_ROW_SQL)
        .bind(...mapNormalizedRowToCurrentBind(normalized, existingCreatedAt))
        .run();

      if (!createdAtByRowId.has(normalized.rowId)) {
        restoredRows += 1;
      }
      createdAtByRowId.set(normalized.rowId, existingCreatedAt || nowIso);

      if (normalized.nmId) {
        await db.prepare(UPSERT_ARTICLE_REGISTRY_SQL)
          .bind(
            stateKey,
            normalized.nmId,
            nowIso,
            nowIso,
            actor.userId,
            actor.login,
            actor.role,
            actor.ip,
          )
          .run();
      }
    }

    if (txStarted) {
      await db.exec("COMMIT");
    }
  } catch (error) {
    if (txStarted) {
      try {
        await db.exec("ROLLBACK");
      } catch {
        // noop
      }
    }
    throw error;
  }

  return {
    ok: true,
    stateKey,
    restoredRows,
    rowsTotal: createdAtByRowId.size,
    sourceRows: latestVersions.length,
    source: "versions",
  };
}

export function errorJson(error, fallbackMessage = "Unexpected state storage error") {
  const message = safeString(error?.message || fallbackMessage, 2000) || fallbackMessage;
  const status = Number(error?.status);
  const statusCode = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
  return json({ ok: false, error: message }, { status: statusCode });
}

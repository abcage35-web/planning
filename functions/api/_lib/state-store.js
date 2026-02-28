import { json } from "./auth.js";

export const DEFAULT_STATE_KEY = "wb-dashboard-v2";
const SNAPSHOT_LIMIT = 4000;
const ROW_LOG_LIMIT = 320;
const ROW_VERSION_LIMIT = 500;
const DASHBOARD_SAVE_EVENT_LIMIT = 2000;
const CSV_SEPARATOR = ",";

let tablesEnsured = false;

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

function normalizeRowLogs(logsRaw, fallbackIso) {
  const source = Array.isArray(logsRaw) ? logsRaw : [];
  const output = [];

  for (let index = 0; index < source.length; index += 1) {
    const raw = source[index];
    if (!raw || typeof raw !== "object") {
      continue;
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

    output.push({
      logId,
      at,
      sourceType,
      mode,
      actionKey,
      status,
      error,
      changes,
    });

    if (output.length >= ROW_LOG_LIMIT) {
      break;
    }
  }

  return output;
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
  const rowId = safeString(row.id, 120) || (nmId ? `row-${nmId}` : `row-${Date.now()}-${sortIndex}`);
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
    rowPayloadJson: toJson(rowForHash, "{}"),
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

async function getRowLogCounts(db, stateKey) {
  const result = await db
    .prepare(
      `SELECT row_id, COUNT(1) AS total
       FROM dashboard_row_logs
       WHERE state_key = ?1
       GROUP BY row_id`,
    )
    .bind(stateKey)
    .all();

  const rows = Array.isArray(result?.results) ? result.results : [];
  const counts = new Map();
  for (const row of rows) {
    const rowId = safeString(row.row_id, 120);
    if (!rowId) {
      continue;
    }
    counts.set(rowId, Math.max(0, Number(row.total) || 0));
  }
  return counts;
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

export async function ensureStateTables(db) {
  if (!db) {
    return;
  }

  if (tablesEnsured) {
    return;
  }

  await db.exec(`
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
  `);

  tablesEnsured = true;
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
       WHERE version_id IN (
         SELECT version_id
         FROM dashboard_row_versions
         WHERE state_key = ?1 AND row_id = ?2
         ORDER BY version_id DESC
         LIMIT -1 OFFSET ?3
       )`,
    )
    .bind(stateKey, rowId, ROW_VERSION_LIMIT)
    .run();
}

async function pruneRowLogs(db, stateKey, rowId) {
  await db
    .prepare(
      `DELETE FROM dashboard_row_logs
       WHERE rowid IN (
         SELECT rowid
         FROM dashboard_row_logs
         WHERE state_key = ?1 AND row_id = ?2
         ORDER BY at DESC, log_id DESC
         LIMIT -1 OFFSET ?3
       )`,
    )
    .bind(stateKey, rowId, ROW_LOG_LIMIT)
    .run();
}

async function pruneSnapshots(db, stateKey) {
  await db
    .prepare(
      `DELETE FROM dashboard_problem_snapshots
       WHERE rowid IN (
         SELECT rowid
         FROM dashboard_problem_snapshots
         WHERE state_key = ?1
         ORDER BY at DESC, snapshot_id DESC
         LIMIT -1 OFFSET ?2
       )`,
    )
    .bind(stateKey, SNAPSHOT_LIMIT)
    .run();
}

async function pruneSaveEvents(db, stateKey) {
  await db
    .prepare(
      `DELETE FROM dashboard_save_events
       WHERE event_id IN (
         SELECT event_id
         FROM dashboard_save_events
         WHERE state_key = ?1
         ORDER BY event_id DESC
         LIMIT -1 OFFSET ?2
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
  const existingLogCounts = await getRowLogCounts(db, stateKey);
  const existingSnapshotCount = await getSnapshotCount(db, stateKey);
  const incomingRowIds = new Set(normalizedRows.map((row) => row.rowId));

  const changedRowIds = new Set();
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

    for (const row of normalizedRows) {
      const existing = existingRowsById.get(row.rowId) || null;
      const existingHash = existing ? String(existing.row_hash || "") : "";
      const isChanged = !existing || existingHash !== row.rowHash;

      await db.prepare(UPSERT_ROW_SQL)
        .bind(...mapNormalizedRowToCurrentBind(row, existing?.created_at || null))
        .run();

      if (isChanged) {
        rowsChanged += 1;
        changedRowIds.add(row.rowId);
        await db.prepare(INSERT_ROW_VERSION_SQL)
          .bind(...mapNormalizedRowToVersionBind(row, "upsert", actor, nowIso))
          .run();
      }

      const existingLogsForRow = existingLogCounts.get(row.rowId) || 0;
      const logsToPersist =
        existingLogsForRow > 0 ? row.logs.slice(-8) : row.logs.slice(-ROW_LOG_LIMIT);

      for (const log of logsToPersist) {
        await db.prepare(UPSERT_ROW_LOG_SQL)
          .bind(...mapLogToBind(stateKey, row.rowId, log, actor, nowIso))
          .run();
        logsUpserted += 1;
      }
    }

    for (const [rowId, existing] of existingRowsById.entries()) {
      if (incomingRowIds.has(rowId)) {
        continue;
      }

      rowsDeleted += 1;
      changedRowIds.add(rowId);

      await db.prepare(INSERT_ROW_VERSION_SQL)
        .bind(...mapCurrentRowToVersionBind(existing, "delete", actor, nowIso))
        .run();

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

    for (const rowId of changedRowIds) {
      await pruneRowVersions(db, stateKey, rowId);
      await pruneRowLogs(db, stateKey, rowId);
    }

    await pruneSnapshots(db, stateKey);
    await pruneSaveEvents(db, stateKey);

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

export function errorJson(error, fallbackMessage = "Unexpected state storage error") {
  const message = safeString(error?.message || fallbackMessage, 2000) || fallbackMessage;
  const status = Number(error?.status);
  const statusCode = Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
  return json({ ok: false, error: message }, { status: statusCode });
}

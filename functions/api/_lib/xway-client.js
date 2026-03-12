import { XWAY_FALLBACK_STORAGE_STATE } from "./xway-storage-state.js";

const XWAY_BASE_URL = "https://am.xway.ru";
const XWAY_AB_TESTS_REFERER = `${XWAY_BASE_URL}/wb/ab-tests`;
const XWAY_RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function wait(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(durationMs) || 0)));
}

function isXwayRetryableStatus(statusRaw) {
  return XWAY_RETRYABLE_STATUSES.has(Number(statusRaw) || 0);
}

function isXwayRetryableError(error) {
  if (!error) {
    return false;
  }
  if (isXwayRetryableStatus(error.status)) {
    return true;
  }
  const message = String(error instanceof Error ? error.message : error || "").toLowerCase();
  return (
    message.includes("fetch")
    || message.includes("network")
    || message.includes("timeout")
    || message.includes("502")
    || message.includes("503")
    || message.includes("504")
  );
}

function buildXwayResponseError(status, message) {
  const error = new Error(message);
  error.status = Number(status) || 0;
  return error;
}

function safeJsonParse(textRaw) {
  try {
    return JSON.parse(String(textRaw || "").trim() || "null");
  } catch {
    return null;
  }
}

export function getXwayStorageState(env) {
  const direct = String(env?.XWAY_STORAGE_STATE_JSON || "").trim();
  if (direct) {
    return safeJsonParse(direct);
  }

  const base64 = String(env?.XWAY_STORAGE_STATE_BASE64 || "").trim();
  if (base64) {
    try {
      const decoded = atob(base64);
      return safeJsonParse(decoded);
    } catch {
      return null;
    }
  }

  if (Array.isArray(XWAY_FALLBACK_STORAGE_STATE?.cookies) && XWAY_FALLBACK_STORAGE_STATE.cookies.length > 0) {
    return XWAY_FALLBACK_STORAGE_STATE;
  }

  return null;
}

export function getXwayCookiesMap(storageState) {
  const cookies = Array.isArray(storageState?.cookies) ? storageState.cookies : [];
  const map = new Map();
  for (const cookie of cookies) {
    const name = String(cookie?.name || "").trim();
    if (!name) {
      continue;
    }
    map.set(name, String(cookie?.value || ""));
  }
  return map;
}

export function buildXwayCookieHeader(storageState) {
  const cookies = Array.isArray(storageState?.cookies) ? storageState.cookies : [];
  return cookies
    .map((cookie) => {
      const name = String(cookie?.name || "").trim();
      if (!name) {
        return "";
      }
      return `${name}=${String(cookie?.value || "")}`;
    })
    .filter(Boolean)
    .join("; ");
}

export function getXwayCsrfToken(storageState) {
  const cookies = getXwayCookiesMap(storageState);
  return String(cookies.get("csrftoken_v2") || cookies.get("csrftoken") || "").trim();
}

export async function xwayFetchJson(env, pathOrUrl, options = {}) {
  const storageState = getXwayStorageState(env);
  if (!storageState) {
    throw new Error("XWAY session is not configured");
  }

  const url = String(pathOrUrl || "").startsWith("http")
    ? String(pathOrUrl)
    : `${XWAY_BASE_URL}${String(pathOrUrl || "")}`;
  const method = String(options.method || "GET").trim().toUpperCase();
  const headers = new Headers(options.headers || {});
  headers.set("Accept", "application/json, text/plain, */*");
  headers.set("Cookie", buildXwayCookieHeader(storageState));

  const referer = String(options.referer || "").trim();
  if (referer) {
    headers.set("Referer", referer);
  }

  if (options.csrf) {
    const csrfToken = getXwayCsrfToken(storageState);
    if (csrfToken) {
      headers.set("X-CSRFToken", csrfToken);
    }
    headers.set("X-Requested-With", "XMLHttpRequest");
  }

  let body = options.body;
  if (body && typeof body === "object" && !(body instanceof ArrayBuffer) && !(body instanceof FormData)) {
    headers.set("content-type", "application/json; charset=utf-8");
    body = JSON.stringify(body);
  }

  const retries = Math.max(0, Number(options.retries ?? 2) || 0);
  const retryDelayMs = Math.max(150, Number(options.retryDelayMs) || 350);
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers,
        body,
        redirect: "follow",
      });

      const text = response.status === 204 ? "" : await response.text();
      if (!response.ok) {
        throw buildXwayResponseError(response.status, `XWAY ${response.status}: ${text.slice(0, 300)}`);
      }

      if (response.status === 204 || !text.trim()) {
        return null;
      }

      const parsed = safeJsonParse(text);
      if (parsed === null && text.trim().toLowerCase() !== "null") {
        throw buildXwayResponseError(response.status, "XWAY вернул невалидный JSON.");
      }
      return parsed;
    } catch (error) {
      lastError = error;
      if (attempt < retries && isXwayRetryableError(error)) {
        await wait(retryDelayMs * (attempt + 1));
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error("XWAY request failed");
}

export function xwayIsoDateFromDateLike(valueRaw) {
  const value = String(valueRaw || "").trim();
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 10);
}

export function xwayShiftIsoDate(isoDateRaw, deltaDays) {
  const isoDate = String(isoDateRaw || "").trim();
  if (!isoDate) {
    return "";
  }
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setUTCDate(date.getUTCDate() + Number(deltaDays || 0));
  return date.toISOString().slice(0, 10);
}

export function xwaySafeDivide(numeratorRaw, denominatorRaw) {
  const numerator = Number(numeratorRaw);
  const denominator = Number(denominatorRaw);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

export function xwayNormalizeCampaignType(typeRaw) {
  return String(typeRaw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

export function xwayMatchCampaignType(campaign, typeRaw) {
  const type = xwayNormalizeCampaignType(typeRaw);
  if (!type) {
    return true;
  }
  const haystack = [campaign?.name, campaign?.query, campaign?.query_main]
    .map((value) => String(value || "").trim().toUpperCase())
    .filter(Boolean)
    .join(" | ");
  return haystack.includes(type);
}

export function xwayAggregateCampaignStats(campaignsRaw) {
  const campaigns = Array.isArray(campaignsRaw) ? campaignsRaw : [];
  const totals = {
    views: 0,
    clicks: 0,
    atbs: 0,
    orders: 0,
    matchedCount: 0,
  };

  for (const campaign of campaigns) {
    const stat = campaign?.stat || {};
    totals.views += Number(stat.views) || 0;
    totals.clicks += Number(stat.clicks) || 0;
    totals.atbs += Number(stat.atbs) || 0;
    totals.orders += Number(stat.orders) || 0;
    totals.matchedCount += 1;
  }

  return totals;
}

export function xwayBuildConversionMetrics(totalsRaw) {
  const totals = totalsRaw || {};
  const ctr = xwaySafeDivide(totals.clicks, totals.views);
  const cr1 = xwaySafeDivide(totals.atbs, totals.clicks);
  const cr2 = xwaySafeDivide(totals.orders, totals.atbs);
  const ctrCr1 = Number.isFinite(ctr) && Number.isFinite(cr1) ? ctr * cr1 : xwaySafeDivide(totals.atbs, totals.views);
  const crf100 = Number.isFinite(ctrCr1) && Number.isFinite(cr2)
    ? ctrCr1 * cr2 * 100
    : xwaySafeDivide(totals.orders, totals.views) !== null
      ? xwaySafeDivide(totals.orders, totals.views) * 100
      : null;

  return {
    ctr,
    cr1,
    cr2,
    ctrCr1,
    crf100,
  };
}

export function xwayBuildDiff(afterRaw, beforeRaw) {
  const afterValue = Number(afterRaw);
  const beforeValue = Number(beforeRaw);
  if (!Number.isFinite(afterValue) || !Number.isFinite(beforeValue) || beforeValue === 0) {
    return null;
  }
  return afterValue / beforeValue - 1;
}

export function xwayBuildAbTestPageReferer(shopIdRaw, productIdRaw, testIdRaw) {
  const shopId = String(shopIdRaw || "").trim();
  const productId = String(productIdRaw || "").trim();
  const testId = String(testIdRaw || "").trim();
  if (!shopId || !productId || !testId) {
    return XWAY_AB_TESTS_REFERER;
  }
  return `${XWAY_BASE_URL}/wb/shop/${shopId}/product/${productId}/ab-test/${testId}`;
}

export const XWAY_REFERERS = Object.freeze({
  abTests: XWAY_AB_TESTS_REFERER,
});

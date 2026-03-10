import { XWAY_FALLBACK_STORAGE_STATE } from "./xway-storage-state.js";

const XWAY_BASE_URL = "https://am.xway.ru";
const XWAY_AB_TESTS_REFERER = `${XWAY_BASE_URL}/wb/ab-tests`;

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

  const response = await fetch(url, {
    method,
    headers,
    body,
    redirect: "follow",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`XWAY ${response.status}: ${text.slice(0, 300)}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  return safeJsonParse(text);
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

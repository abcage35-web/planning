import { getSessionFromRequest, json } from "./_lib/auth.js";

const CARD_V4_APP_TYPE = "1";
const CARD_V4_CURR = "rub";
const CARD_V4_DEST = "-1257786";
const CARD_V4_SPP = "30";
const CARD_V4_ATTEMPTS = 4;
const CARD_V4_TIMEOUT_MS = 5000;
const RETRY_BASE_DELAY_MS = 180;
const RETRY_MAX_DELAY_MS = 1400;

function toPositiveInteger(valueRaw) {
  if (typeof valueRaw === "number" && Number.isInteger(valueRaw) && valueRaw > 0) {
    return valueRaw;
  }

  if (typeof valueRaw === "string") {
    const normalized = valueRaw.trim();
    if (/^\d+$/.test(normalized)) {
      const parsed = Number(normalized);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return null;
}

function toFiniteNumber(valueRaw) {
  if (typeof valueRaw === "number" && Number.isFinite(valueRaw)) {
    return Math.max(0, valueRaw);
  }

  if (typeof valueRaw === "string") {
    const normalized = valueRaw.replace(",", ".").trim();
    if (!normalized) {
      return null;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }

  return null;
}

function toRubFromMinorUnits(valueRaw) {
  const value = toFiniteNumber(valueRaw);
  if (value === null) {
    return null;
  }
  return Math.max(0, Math.round(value / 100));
}

function createEmptyMarketSnapshot() {
  return {
    cardExists: null,
    stockValue: null,
    inStock: null,
    stockSource: "",
    currentPrice: null,
    basePrice: null,
    priceSource: "",
    rating: null,
    reviewCount: null,
    marketError: "",
  };
}

function extractNmIdFromEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  return (
    toPositiveInteger(entry.nmId) ??
    toPositiveInteger(entry.nm_id) ??
    toPositiveInteger(entry.id) ??
    toPositiveInteger(entry.nmid)
  );
}

function extractStockFromCardV4Product(product) {
  const totalQuantity = toFiniteNumber(product?.totalQuantity);
  if (totalQuantity !== null) {
    const normalized = Math.max(0, Math.round(totalQuantity));
    return {
      stockValue: normalized,
      inStock: normalized > 0,
    };
  }

  const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
  let sum = 0;
  let found = false;
  for (const size of sizes) {
    if (!size || typeof size !== "object") {
      continue;
    }
    const stocks = Array.isArray(size.stocks) ? size.stocks : [];
    for (const stock of stocks) {
      const qty = toFiniteNumber(stock?.qty ?? stock?.quantity ?? stock?.qnt ?? stock?.stock ?? stock?.balance);
      if (qty === null) {
        continue;
      }
      found = true;
      sum += qty;
    }
  }

  if (found) {
    const normalized = Math.max(0, Math.round(sum));
    return {
      stockValue: normalized,
      inStock: normalized > 0,
    };
  }

  if (typeof product?.soldOut === "boolean") {
    return {
      stockValue: null,
      inStock: !product.soldOut,
    };
  }

  if (typeof product?.sold_out === "boolean") {
    return {
      stockValue: null,
      inStock: !product.sold_out,
    };
  }

  return {
    stockValue: null,
    inStock: null,
  };
}

function extractPriceFromCardV4Product(product) {
  const sizes = Array.isArray(product?.sizes) ? product.sizes : [];
  let currentPrice = null;
  let basePrice = null;

  for (const size of sizes) {
    if (!size || typeof size !== "object" || !size.price || typeof size.price !== "object") {
      continue;
    }

    const productPrice = toRubFromMinorUnits(size.price.product);
    const basicPrice = toRubFromMinorUnits(size.price.basic);
    if (currentPrice === null && Number.isFinite(productPrice)) {
      currentPrice = productPrice;
    }
    if (basePrice === null && Number.isFinite(basicPrice)) {
      basePrice = basicPrice;
    }

    if (currentPrice !== null && basePrice !== null) {
      break;
    }
  }

  if (currentPrice === null) {
    currentPrice =
      toRubFromMinorUnits(product?.salePriceU) ??
      toRubFromMinorUnits(product?.salePrice) ??
      toRubFromMinorUnits(product?.priceU);
  }

  if (basePrice === null) {
    basePrice = toRubFromMinorUnits(product?.priceU) ?? toRubFromMinorUnits(product?.price);
  }

  return {
    currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
    basePrice: Number.isFinite(basePrice) ? basePrice : null,
  };
}

function extractReviewCountFromCardV4Product(product) {
  const candidates = [
    product?.feedbacks,
    product?.feedbackCount,
    product?.reviewCount,
    product?.reviewsCount,
    product?.nmFeedbacks,
    product?.commentsCnt,
  ];

  for (const candidate of candidates) {
    const value = toFiniteNumber(candidate);
    if (Number.isFinite(value)) {
      return Math.max(0, Math.round(value));
    }
  }

  return null;
}

function extractMarketSnapshotFromCardV4(payload, nmIdRaw) {
  const targetNmId = toPositiveInteger(nmIdRaw);
  if (!Number.isInteger(targetNmId) || targetNmId <= 0) {
    return createEmptyMarketSnapshot();
  }

  const products = Array.isArray(payload?.products) ? payload.products : [];
  const product = products.find((item) => extractNmIdFromEntry(item) === targetNmId) || null;
  if (!product || typeof product !== "object") {
    return {
      ...createEmptyMarketSnapshot(),
      cardExists: false,
      marketError: "card-v4: карточка не найдена",
    };
  }

  const stock = extractStockFromCardV4Product(product);
  const price = extractPriceFromCardV4Product(product);
  const ratingRaw = product?.nmReviewRating ?? product?.reviewRating ?? product?.rating;
  const rating = toFiniteNumber(ratingRaw);
  const reviewCount = extractReviewCountFromCardV4Product(product);

  return {
    cardExists: true,
    stockValue: stock.stockValue,
    inStock: stock.inStock,
    stockSource: stock.stockValue !== null || typeof stock.inStock === "boolean" ? "card-v4" : "",
    currentPrice: price.currentPrice,
    basePrice: price.basePrice,
    priceSource: price.currentPrice !== null ? "card-v4" : "",
    rating: Number.isFinite(rating) ? Math.round(rating * 10) / 10 : null,
    reviewCount: Number.isFinite(reviewCount) ? reviewCount : null,
    marketError: "",
  };
}

function buildCardV4Url(nmId) {
  const url = new URL("https://card.wb.ru/cards/v4/detail");
  url.searchParams.set("appType", CARD_V4_APP_TYPE);
  url.searchParams.set("curr", CARD_V4_CURR);
  url.searchParams.set("dest", CARD_V4_DEST);
  url.searchParams.set("spp", CARD_V4_SPP);
  url.searchParams.set("nm", String(nmId));
  return url.toString();
}

function sleep(ms) {
  const timeout = Math.max(0, Number(ms) || 0);
  return new Promise((resolve) => setTimeout(resolve, timeout));
}

function isRetriableStatus(status) {
  return status === 403 || status === 404 || status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function parseXPowStatus(headerRaw) {
  const header = String(headerRaw || "");
  const match = header.match(/\bstatus=([^;,\s]+)/i);
  return match?.[1] ? String(match[1]) : "";
}

function getRetryDelayMs(attempt) {
  const exp = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 220);
  return Math.min(RETRY_MAX_DELAY_MS, exp + jitter);
}

function tryParseJson(textRaw) {
  const text = String(textRaw || "");
  if (!text.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchCardV4Payload(nmId) {
  const endpoint = buildCardV4Url(nmId);
  let lastError = "Не удалось получить ответ card-v4";
  let lastStatus = 0;
  let lastPowStatus = "";
  let attemptsUsed = 0;

  for (let attempt = 1; attempt <= CARD_V4_ATTEMPTS; attempt += 1) {
    attemptsUsed = attempt;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CARD_V4_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers: {
          accept: "application/json, text/plain, */*",
          "cache-control": "no-cache",
          pragma: "no-cache",
          "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        },
        redirect: "follow",
        signal: controller.signal,
        cf: {
          cacheEverything: false,
        },
      });

      lastStatus = Number(response.status) || 0;
      lastPowStatus = parseXPowStatus(response.headers.get("x-pow"));
      const text = await response.text();

      if (!response.ok) {
        lastError = `HTTP ${response.status}${lastPowStatus ? ` (x-pow: ${lastPowStatus})` : ""}`;
        if (attempt < CARD_V4_ATTEMPTS && isRetriableStatus(response.status)) {
          await sleep(getRetryDelayMs(attempt));
          continue;
        }
        break;
      }

      const payload = tryParseJson(text);
      if (!payload) {
        lastError = "card-v4 вернул не-JSON";
        if (attempt < CARD_V4_ATTEMPTS) {
          await sleep(getRetryDelayMs(attempt));
          continue;
        }
        break;
      }

      return {
        ok: true,
        endpoint,
        payload,
        attemptsUsed,
        status: response.status,
        powStatus: lastPowStatus,
      };
    } catch (error) {
      const message = String(error?.message || error || "");
      lastError = /aborted/i.test(message) ? "Превышено время ожидания card-v4" : message || "Fetch error";
      if (attempt < CARD_V4_ATTEMPTS) {
        await sleep(getRetryDelayMs(attempt));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: false,
    endpoint,
    error: lastError,
    attemptsUsed,
    status: lastStatus,
    powStatus: lastPowStatus,
  };
}

function getMissingMarketFields(snapshot) {
  const missing = [];
  if (!Number.isFinite(snapshot.stockValue) && typeof snapshot.inStock !== "boolean") {
    missing.push("остаток");
  }
  if (!Number.isFinite(snapshot.currentPrice)) {
    missing.push("цена");
  }
  if (!Number.isFinite(snapshot.rating)) {
    missing.push("рейтинг");
  }
  if (!Number.isFinite(snapshot.reviewCount)) {
    missing.push("отзывы");
  }
  return missing;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function onRequestGet(context) {
  if (!context?.env?.DB) {
    return json({ ok: false, error: "D1 binding DB is not configured" }, { status: 500 });
  }

  const session = await getSessionFromRequest(context.request, context.env);
  if (!session) {
    return json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(context.request.url);
  const nmId = toPositiveInteger(url.searchParams.get("nm"));
  if (!Number.isInteger(nmId) || nmId <= 0) {
    return json({ ok: false, error: "Некорректный параметр nm" }, { status: 400 });
  }

  const fetched = await fetchCardV4Payload(nmId);
  if (!fetched.ok) {
    return json({
      ok: false,
      source: "card-v4",
      nmId,
      endpoint: fetched.endpoint,
      error: fetched.error || "Не удалось загрузить card-v4",
      meta: {
        attemptsUsed: fetched.attemptsUsed,
        httpStatus: fetched.status || 0,
        powStatus: fetched.powStatus || "",
      },
    });
  }

  const snapshot = extractMarketSnapshotFromCardV4(fetched.payload, nmId);
  if (snapshot.cardExists !== false) {
    const missingFields = getMissingMarketFields(snapshot);
    if (missingFields.length > 0) {
      snapshot.marketError = `card-v4: не получены поля: ${missingFields.join(", ")}`;
    }
  }

  return json({
    ok: true,
    source: "card-v4",
    nmId,
    endpoint: fetched.endpoint,
    snapshot,
    meta: {
      attemptsUsed: fetched.attemptsUsed,
      httpStatus: fetched.status || 0,
      powStatus: fetched.powStatus || "",
      missingFields,
    },
  });
}

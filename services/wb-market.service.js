(function initWBMarketService(global) {
  function createEmptyMarketSnapshot() {
    return {
      stockValue: null,
      inStock: null,
      stockSource: "",
      currentPrice: null,
      basePrice: null,
      priceSource: "",
      rating: null,
      reviewCount: null,
    };
  }

  function toFiniteNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, value);
    }

    if (typeof value === "string") {
      const normalized = value.replace(",", ".").trim();
      if (!normalized) {
        return null;
      }

      const num = Number(normalized);
      if (Number.isFinite(num)) {
        return Math.max(0, num);
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

  function extractNmIdFromEntry(entry) {
    if (!entry || typeof entry !== "object") {
      return null;
    }
    return (
      toPositiveInteger(entry?.nmId) ??
      toPositiveInteger(entry?.nm_id) ??
      toPositiveInteger(entry?.id) ??
      toPositiveInteger(entry?.nmid)
    );
  }

  function mergeMarketSnapshots(primaryRaw, patchRaw) {
    const primary = primaryRaw && typeof primaryRaw === "object" ? primaryRaw : createEmptyMarketSnapshot();
    const patch = patchRaw && typeof patchRaw === "object" ? patchRaw : createEmptyMarketSnapshot();

    const merged = {
      stockValue: Number.isFinite(primary.stockValue) ? Math.max(0, Math.round(primary.stockValue)) : null,
      inStock: typeof primary.inStock === "boolean" ? primary.inStock : null,
      stockSource: String(primary.stockSource || ""),
      currentPrice: Number.isFinite(primary.currentPrice) ? Math.max(0, Math.round(primary.currentPrice)) : null,
      basePrice: Number.isFinite(primary.basePrice) ? Math.max(0, Math.round(primary.basePrice)) : null,
      priceSource: String(primary.priceSource || ""),
      rating: Number.isFinite(primary.rating) ? Math.round(Number(primary.rating) * 10) / 10 : null,
      reviewCount: Number.isFinite(primary.reviewCount) ? Math.max(0, Math.round(primary.reviewCount)) : null,
    };

    if (!Number.isFinite(merged.stockValue) && Number.isFinite(patch.stockValue)) {
      merged.stockValue = Math.max(0, Math.round(patch.stockValue));
    }
    if (merged.inStock === null && typeof patch.inStock === "boolean") {
      merged.inStock = patch.inStock;
    }
    if (!merged.stockSource && patch.stockSource) {
      merged.stockSource = String(patch.stockSource);
    }
    if (!Number.isFinite(merged.currentPrice) && Number.isFinite(patch.currentPrice)) {
      merged.currentPrice = Math.max(0, Math.round(patch.currentPrice));
      if (patch.priceSource) {
        merged.priceSource = String(patch.priceSource);
      }
    }
    if (!Number.isFinite(merged.basePrice) && Number.isFinite(patch.basePrice)) {
      merged.basePrice = Math.max(0, Math.round(patch.basePrice));
    }
    if (!merged.priceSource && patch.priceSource) {
      merged.priceSource = String(patch.priceSource);
    }
    if (!Number.isFinite(merged.rating) && Number.isFinite(patch.rating)) {
      merged.rating = Math.round(Number(patch.rating) * 10) / 10;
    }
    if (!Number.isFinite(merged.reviewCount) && Number.isFinite(patch.reviewCount)) {
      merged.reviewCount = Math.max(0, Math.round(patch.reviewCount));
    }

    return merged;
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

  function extractMarketSnapshotFromCardV4(payload, nmIdRaw, source) {
    const snapshotSource = source || "card-v4";
    const targetNmId = toPositiveInteger(nmIdRaw);
    if (!Number.isInteger(targetNmId) || targetNmId <= 0) {
      return createEmptyMarketSnapshot();
    }
    const products = Array.isArray(payload?.products) ? payload.products : [];
    // Строгий матч по nmId: не берем products[0], чтобы не подмешивать чужой артикул.
    const product = products.find((item) => extractNmIdFromEntry(item) === targetNmId) || null;

    if (!product || typeof product !== "object") {
      return createEmptyMarketSnapshot();
    }

    const stock = extractStockFromCardV4Product(product);
    const price = extractPriceFromCardV4Product(product);
    const ratingRaw = product?.nmReviewRating ?? product?.reviewRating ?? product?.rating;
    const rating = toFiniteNumber(ratingRaw);
    const reviewCount = extractReviewCountFromCardV4Product(product);
    return {
      stockValue: stock.stockValue,
      inStock: stock.inStock,
      stockSource: stock.stockValue !== null || typeof stock.inStock === "boolean" ? snapshotSource : "",
      currentPrice: price.currentPrice,
      basePrice: price.basePrice,
      priceSource: price.currentPrice !== null ? snapshotSource : "",
      rating: Number.isFinite(rating) ? Math.round(rating * 10) / 10 : null,
      reviewCount: Number.isFinite(reviewCount) ? reviewCount : null,
    };
  }

  function extractFirstJsonObject(textRaw) {
    const text = String(textRaw || "");
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start < 0 || end <= start) {
      return "";
    }
    return text.slice(start, end + 1).trim();
  }

  async function fetchCardV4ViaProxy(endpoint, deps) {
    const fetchWithRetry = deps?.fetchWithRetry;
    const fetchTimeoutMs = Number(deps?.fetchTimeoutMs) || 12000;

    if (typeof endpoint !== "string" || !endpoint.trim() || typeof fetchWithRetry !== "function") {
      return null;
    }

    const proxyUrl = `https://r.jina.ai/http://${endpoint.replace(/^https?:\/\//i, "")}`;

    try {
      const response = await fetchWithRetry(
        proxyUrl,
        {
          method: "GET",
          mode: "cors",
          cache: "no-store",
        },
        { attempts: 1, timeoutMs: fetchTimeoutMs },
      );

      if (!response.ok) {
        return null;
      }

      const text = await response.text();
      const payloadText = extractFirstJsonObject(text);
      if (!payloadText) {
        return null;
      }

      const parsed = JSON.parse(payloadText);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function extractStockFromProductOrderQntPayload(payload, nmIdRaw) {
    const targetNmId = toPositiveInteger(nmIdRaw);
    if (!Number.isInteger(targetNmId) || targetNmId <= 0) {
      return {
        stockValue: null,
        inStock: null,
      };
    }
    const items = Array.isArray(payload) ? payload : [];
    const item = items.find((entry) => extractNmIdFromEntry(entry) === targetNmId) || null;
    if (!item || typeof item !== "object") {
      return {
        stockValue: null,
        inStock: null,
      };
    }
    const value = toFiniteNumber(item?.qnt ?? item?.qty ?? item?.quantity ?? item?.stock ?? item?.totalQuantity);

    if (value !== null) {
      const normalized = Math.max(0, Math.round(value));
      return {
        stockValue: normalized,
        inStock: normalized > 0,
      };
    }

    return {
      stockValue: null,
      inStock: null,
    };
  }

  function extractCurrentPriceFromPriceHistoryPayload(payload) {
    const items = Array.isArray(payload) ? payload : [];
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const entry = items[index];
      if (!entry || typeof entry !== "object") {
        continue;
      }

      const value =
        toRubFromMinorUnits(entry?.price?.RUB) ??
        toRubFromMinorUnits(entry?.price?.rub) ??
        toRubFromMinorUnits(entry?.RUB) ??
        toRubFromMinorUnits(entry?.rub);
      if (Number.isFinite(value)) {
        return value;
      }
    }
    return null;
  }

  async function fetchFallbackMarketSnapshot(nmIdRaw, basketBase, deps) {
    const fetchJsonMaybe = deps?.fetchJsonMaybe;
    const nmId = Number(nmIdRaw);
    if (!Number.isInteger(nmId) || nmId <= 0 || typeof fetchJsonMaybe !== "function") {
      return createEmptyMarketSnapshot();
    }

    const normalizedBasketBase = typeof basketBase === "string" ? basketBase.trim() : "";
    const qtyUrl = `https://product-order-qnt.wildberries.ru/by-nm/?nm=${nmId}`;
    const priceHistoryUrl = normalizedBasketBase ? `${normalizedBasketBase}/info/price-history.json` : "";

    const fastConfig = {
      attempts: 1,
      timeoutMs: Math.max(1800, Math.min(3600, Number(deps?.fetchTimeoutMs) || 3600)),
    };

    const [qtyResponse, priceHistoryResponse] = await Promise.all([
      fetchJsonMaybe(qtyUrl, fastConfig),
      priceHistoryUrl
        ? fetchJsonMaybe(priceHistoryUrl, fastConfig)
        : Promise.resolve({ ok: false, message: "no-price-url" }),
    ]);

    const snapshot = createEmptyMarketSnapshot();

    if (qtyResponse.ok && qtyResponse.data) {
      const stock = extractStockFromProductOrderQntPayload(qtyResponse.data, nmId);
      if (Number.isFinite(stock.stockValue)) {
        snapshot.stockValue = stock.stockValue;
        snapshot.inStock = stock.stockValue > 0;
        snapshot.stockSource = "product-order-qnt";
      } else if (typeof stock.inStock === "boolean") {
        snapshot.inStock = stock.inStock;
        snapshot.stockSource = "product-order-qnt";
      }
    }

    if (priceHistoryResponse.ok && priceHistoryResponse.data) {
      const historyPrice = extractCurrentPriceFromPriceHistoryPayload(priceHistoryResponse.data);
      if (Number.isFinite(historyPrice)) {
        snapshot.currentPrice = Math.max(0, Math.round(historyPrice));
        snapshot.priceSource = "price-history";
      }
    }

    return snapshot;
  }

  async function fetchCardMarketSnapshot(nmIdRaw, options, deps) {
    const fetchJsonMaybe = deps?.fetchJsonMaybe;
    const fetchWithRetry = deps?.fetchWithRetry;
    const fetchTimeoutMs = Number(deps?.fetchTimeoutMs) || 12000;

    const nmId = Number(nmIdRaw);
    const basketBase = typeof options?.basketBase === "string" ? options.basketBase.trim() : "";
    const strictPrimary = options?.strictPrimary === true;
    if (!Number.isInteger(nmId) || nmId <= 0) {
      return createEmptyMarketSnapshot();
    }

    if (typeof fetchJsonMaybe !== "function") {
      return createEmptyMarketSnapshot();
    }

    const fastConfig = {
      attempts: 2,
      timeoutMs: Math.max(2200, Math.min(5200, fetchTimeoutMs)),
    };

    const endpoint = `https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${nmId}`;
    let snapshot = createEmptyMarketSnapshot();

    const response = await fetchJsonMaybe(endpoint, fastConfig);
    if (response.ok && response.data) {
      snapshot = mergeMarketSnapshots(
        snapshot,
        extractMarketSnapshotFromCardV4(response.data, nmId, "card-v4"),
      );
    }

    if (strictPrimary) {
      return snapshot;
    }

    if (snapshot.currentPrice === null || snapshot.stockValue === null) {
      const proxyData = await fetchCardV4ViaProxy(endpoint, {
        fetchWithRetry,
        fetchTimeoutMs,
      });
      if (proxyData) {
        snapshot = mergeMarketSnapshots(
          snapshot,
          extractMarketSnapshotFromCardV4(proxyData, nmId, "card-v4-proxy"),
        );
      }
    }

    if (snapshot.currentPrice === null || snapshot.stockValue === null) {
      const fallbackSnapshot = await fetchFallbackMarketSnapshot(nmId, basketBase, {
        fetchJsonMaybe,
        fetchTimeoutMs,
      });
      snapshot = mergeMarketSnapshots(snapshot, fallbackSnapshot);
    }

    return snapshot;
  }

  global.WBMarketService = {
    fetchCardMarketSnapshot,
  };
})(window);

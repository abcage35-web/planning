(function initWBMarketService(global) {
  const MARKET_BACKEND_ENDPOINT = "/api/wb-market";
  let lastAuthEventAt = 0;

  function notifyAuthRequired() {
    const now = Date.now();
    if (lastAuthEventAt && now - lastAuthEventAt < 3000) {
      return;
    }
    lastAuthEventAt = now;
    try {
      window.dispatchEvent(new CustomEvent("wb-auth-required"));
    } catch {
      // noop
    }
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

  function hasAnyMarketData(snapshotRaw) {
    const snapshot = snapshotRaw && typeof snapshotRaw === "object" ? snapshotRaw : createEmptyMarketSnapshot();
    return (
      Number.isFinite(snapshot.stockValue) ||
      typeof snapshot.inStock === "boolean" ||
      Number.isFinite(snapshot.currentPrice) ||
      Number.isFinite(snapshot.basePrice) ||
      Number.isFinite(snapshot.rating) ||
      Number.isFinite(snapshot.reviewCount)
    );
  }

  function isOutOfStockSnapshot(snapshotRaw) {
    const snapshot = snapshotRaw && typeof snapshotRaw === "object" ? snapshotRaw : createEmptyMarketSnapshot();
    if (typeof snapshot.inStock === "boolean") {
      return snapshot.inStock === false;
    }
    if (Number.isFinite(snapshot.stockValue)) {
      return Math.max(0, Math.round(snapshot.stockValue)) <= 0;
    }
    return false;
  }

  function hasCoreMarketData(snapshotRaw) {
    const snapshot = snapshotRaw && typeof snapshotRaw === "object" ? snapshotRaw : createEmptyMarketSnapshot();
    const hasStock = Number.isFinite(snapshot.stockValue) || typeof snapshot.inStock === "boolean";
    const hasPrice = Number.isFinite(snapshot.currentPrice) || Number.isFinite(snapshot.basePrice) || isOutOfStockSnapshot(snapshot);
    return hasStock && hasPrice;
  }

  function mergeMarketSnapshots(primaryRaw, patchRaw) {
    const primary = primaryRaw && typeof primaryRaw === "object" ? primaryRaw : createEmptyMarketSnapshot();
    const patch = patchRaw && typeof patchRaw === "object" ? patchRaw : createEmptyMarketSnapshot();

    const merged = {
      cardExists: typeof primary.cardExists === "boolean" ? primary.cardExists : null,
      stockValue: Number.isFinite(primary.stockValue) ? Math.max(0, Math.round(primary.stockValue)) : null,
      inStock: typeof primary.inStock === "boolean" ? primary.inStock : null,
      stockSource: String(primary.stockSource || ""),
      currentPrice: Number.isFinite(primary.currentPrice) ? Math.max(0, Math.round(primary.currentPrice)) : null,
      basePrice: Number.isFinite(primary.basePrice) ? Math.max(0, Math.round(primary.basePrice)) : null,
      priceSource: String(primary.priceSource || ""),
      rating: Number.isFinite(primary.rating) ? Math.round(Number(primary.rating) * 10) / 10 : null,
      reviewCount: Number.isFinite(primary.reviewCount) ? Math.max(0, Math.round(primary.reviewCount)) : null,
      marketError: String(primary.marketError || ""),
    };

    if (merged.cardExists === null && typeof patch.cardExists === "boolean") {
      merged.cardExists = patch.cardExists;
    }
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

    if (!merged.marketError && patch.marketError) {
      merged.marketError = String(patch.marketError);
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
    const product = products.find((item) => extractNmIdFromEntry(item) === targetNmId) || null;

    if (!product || typeof product !== "object") {
      return {
        ...createEmptyMarketSnapshot(),
        cardExists: false,
        marketError: `${snapshotSource}: карточка не найдена`,
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
      stockSource: stock.stockValue !== null || typeof stock.inStock === "boolean" ? snapshotSource : "",
      currentPrice: price.currentPrice,
      basePrice: price.basePrice,
      priceSource: price.currentPrice !== null ? snapshotSource : "",
      rating: Number.isFinite(rating) ? Math.round(rating * 10) / 10 : null,
      reviewCount: Number.isFinite(reviewCount) ? reviewCount : null,
      marketError: "",
    };
  }

  function buildMissingMarketFields(snapshotRaw) {
    const snapshot = snapshotRaw && typeof snapshotRaw === "object" ? snapshotRaw : createEmptyMarketSnapshot();
    const missing = [];
    const outOfStock = isOutOfStockSnapshot(snapshot);

    if (!Number.isFinite(snapshot.stockValue) && typeof snapshot.inStock !== "boolean") {
      missing.push("остаток");
    }
    if (!outOfStock && !Number.isFinite(snapshot.currentPrice) && !Number.isFinite(snapshot.basePrice)) {
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

  function withCoreMarketWarning(snapshotRaw) {
    const snapshot = snapshotRaw && typeof snapshotRaw === "object" ? snapshotRaw : createEmptyMarketSnapshot();
    if (snapshot.cardExists === false) {
      return snapshot;
    }
    const missing = buildMissingMarketFields(snapshot);
    const hasCoreGap = missing.includes("остаток") || missing.includes("цена");
    const normalizedError = String(snapshot.marketError || "").trim().toLowerCase();

    if (hasCoreGap && !snapshot.marketError) {
      snapshot.marketError = `card-v4: не получены поля: ${missing.join(", ")}`;
    } else if (!hasCoreGap && normalizedError.startsWith("card-v4: не получены поля")) {
      snapshot.marketError = "";
    }

    return snapshot;
  }

  function normalizeMarketSnapshotFromBackend(payloadRaw) {
    const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : null;
    if (!payload || payload.ok !== true || !payload.snapshot || typeof payload.snapshot !== "object") {
      return null;
    }

    const snapshot = mergeMarketSnapshots(createEmptyMarketSnapshot(), payload.snapshot);
    snapshot.cardExists = typeof payload.snapshot.cardExists === "boolean" ? payload.snapshot.cardExists : null;
    if (snapshot.stockSource) {
      snapshot.stockSource = "card-v4";
    }
    if (snapshot.priceSource) {
      snapshot.priceSource = "card-v4";
    }
    snapshot.marketError = String(payload.snapshot.marketError || "").trim();
    return snapshot;
  }

  async function fetchMarketSnapshotViaBackend(nmId, requestSignal, fetchJsonMaybe, fastConfig, reconnectConfig) {
    const endpoint = `${MARKET_BACKEND_ENDPOINT}?nm=${nmId}`;

    let response = await fetchJsonMaybe(endpoint, { signal: requestSignal }, fastConfig);
    if (reconnectConfig && !(response.ok && response.data && response.data.ok === true)) {
      response = await fetchJsonMaybe(endpoint, { signal: requestSignal }, reconnectConfig);
    }

    const unauthorized =
      Number(response?.status) === 401 ||
      String(response?.data?.error || "")
        .trim()
        .toLowerCase() === "unauthorized";
    if (unauthorized) {
      notifyAuthRequired();
    }

    const snapshot = normalizeMarketSnapshotFromBackend(response.data);
    if (snapshot) {
      return {
        snapshot: withCoreMarketWarning(snapshot),
        error: "",
      };
    }

    const backendError =
      String(response?.data?.error || "").trim() ||
      String(response?.message || "").trim() ||
      "Cloudflare market endpoint недоступен";

    return {
      snapshot: createEmptyMarketSnapshot(),
      error: `backend: ${backendError}`,
    };
  }

  async function fetchMarketSnapshotDirect(nmId, requestSignal, fetchJsonMaybe, fastConfig, reconnectConfig) {
    const endpoint = `https://card.wb.ru/cards/v4/detail?appType=1&curr=rub&dest=-1257786&spp=30&nm=${nmId}`;

    let response = await fetchJsonMaybe(endpoint, { signal: requestSignal }, fastConfig);
    if (reconnectConfig && !(response.ok && response.data)) {
      response = await fetchJsonMaybe(endpoint, { signal: requestSignal }, reconnectConfig);
    }

    if (response.ok && response.data) {
      return {
        snapshot: withCoreMarketWarning(
          extractMarketSnapshotFromCardV4(response.data, nmId, "card-v4"),
        ),
        error: "",
      };
    }

    const directError =
      String(response?.message || "").trim() ||
      String(response?.data?.error || "").trim() ||
      "card-v4 недоступен";

    return {
      snapshot: createEmptyMarketSnapshot(),
      error: `direct: ${directError}`,
    };
  }

  async function fetchCardMarketSnapshot(nmIdRaw, options, deps) {
    const fetchJsonMaybe = deps?.fetchJsonMaybe;
    const fetchTimeoutMs = Number(deps?.fetchTimeoutMs) || 12000;
    const requestSignal = options?.requestSignal || null;
    const fastFail = options?.fastFail === true;

    const nmId = Number(nmIdRaw);
    if (!Number.isInteger(nmId) || nmId <= 0) {
      return createEmptyMarketSnapshot();
    }

    if (typeof fetchJsonMaybe !== "function") {
      return createEmptyMarketSnapshot();
    }

    const fastConfig = fastFail
      ? {
          attempts: 1,
          timeoutMs: Math.max(1600, Math.min(3200, fetchTimeoutMs)),
        }
      : {
          attempts: 2,
          timeoutMs: Math.max(2600, Math.min(8000, fetchTimeoutMs)),
        };
    const reconnectConfig = fastFail
      ? null
      : {
          attempts: 2,
          timeoutMs: Math.max(5000, fetchTimeoutMs),
        };

    const backend = await fetchMarketSnapshotViaBackend(
      nmId,
      requestSignal,
      fetchJsonMaybe,
      fastConfig,
      reconnectConfig,
    );

    if (backend.snapshot?.cardExists === false) {
      return backend.snapshot;
    }

    if (hasCoreMarketData(backend.snapshot)) {
      return backend.snapshot;
    }

    const direct = await fetchMarketSnapshotDirect(
      nmId,
      requestSignal,
      fetchJsonMaybe,
      fastConfig,
      reconnectConfig,
    );

    if (direct.snapshot?.cardExists === false) {
      return direct.snapshot;
    }

    if (hasAnyMarketData(direct.snapshot) || hasAnyMarketData(backend.snapshot)) {
      return withCoreMarketWarning(mergeMarketSnapshots(backend.snapshot, direct.snapshot));
    }

    const merged = withCoreMarketWarning(mergeMarketSnapshots(createEmptyMarketSnapshot(), direct.snapshot));
    merged.marketError = backend.error || direct.error || merged.marketError || "Рыночные данные временно недоступны";
    return merged;
  }

  global.WBMarketService = {
    fetchCardMarketSnapshot,
  };
})(window);

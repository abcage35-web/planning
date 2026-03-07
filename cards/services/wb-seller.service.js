(function initWBSellerService(global) {
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

  function normalizeNmIdCandidate(value) {
    if (typeof value === "number" && Number.isInteger(value) && value >= 100000) {
      return String(value);
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (/^\d{6,}$/.test(trimmed)) {
        return trimmed;
      }
    }

    return null;
  }

  function extractNmIdFromSellerItem(item) {
    const candidates = [
      item?.id,
      item?.nmId,
      item?.nm_id,
      item?.nm,
      item?.nmID,
      item?.productId,
      item?.product_id,
      item?.wbId,
      item?.wb_id,
    ];

    for (const candidate of candidates) {
      const normalized = normalizeNmIdCandidate(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return null;
  }

  function extractStockFromSellerItem(item) {
    const directKeys = [
      "totalQuantity",
      "quantity",
      "qty",
      "totalQty",
      "total_quantity",
      "availableQuantity",
      "available_quantity",
      "stock",
      "stocks",
      "balance",
    ];

    for (const key of directKeys) {
      const value = toFiniteNumber(item?.[key]);
      if (value !== null) {
        return {
          stockValue: value,
          inStock: value > 0,
        };
      }
    }

    const nestedArrays = [item?.sizes, item?.stocks, item?.warehouseStocks, item?.warehouse_stocks];
    for (const nested of nestedArrays) {
      if (!Array.isArray(nested)) {
        continue;
      }

      let sum = 0;
      let found = false;

      for (const element of nested) {
        if (!element || typeof element !== "object") {
          continue;
        }

        const nestedKeys = ["qty", "quantity", "qnt", "stock", "balance", "count", "totalQty"];
        for (const key of nestedKeys) {
          const value = toFiniteNumber(element?.[key]);
          if (value !== null) {
            sum += value;
            found = true;
            break;
          }
        }

        if (Array.isArray(element?.stocks)) {
          for (const stock of element.stocks) {
            const value = toFiniteNumber(stock?.qty ?? stock?.quantity ?? stock?.balance ?? stock?.stock);
            if (value !== null) {
              sum += value;
              found = true;
            }
          }
        }
      }

      if (found) {
        return {
          stockValue: sum,
          inStock: sum > 0,
        };
      }
    }

    if (typeof item?.soldOut === "boolean") {
      return {
        stockValue: null,
        inStock: !item.soldOut,
      };
    }

    if (typeof item?.sold_out === "boolean") {
      return {
        stockValue: null,
        inStock: !item.sold_out,
      };
    }

    if (typeof item?.inStock === "boolean") {
      return {
        stockValue: null,
        inStock: item.inStock,
      };
    }

    if (typeof item?.in_stock === "boolean") {
      return {
        stockValue: null,
        inStock: item.in_stock,
      };
    }

    return {
      stockValue: null,
      inStock: null,
    };
  }

  function extractPriceFromSellerItem(item) {
    const sizes = Array.isArray(item?.sizes) ? item.sizes : [];
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
        toRubFromMinorUnits(item?.salePriceU) ??
        toRubFromMinorUnits(item?.salePrice) ??
        toRubFromMinorUnits(item?.priceU);
    }
    if (basePrice === null) {
      basePrice = toRubFromMinorUnits(item?.priceU) ?? toRubFromMinorUnits(item?.price);
    }

    return {
      currentPrice: Number.isFinite(currentPrice) ? currentPrice : null,
      basePrice: Number.isFinite(basePrice) ? basePrice : null,
    };
  }

  function extractSellerProductsFromPayload(payload, supplierId, normalizeSupplierId) {
    const arrays = [
      payload?.data?.products,
      payload?.products,
      payload?.data?.cards,
      payload?.cards,
      payload?.data?.items,
      payload?.items,
      payload?.data?.goods,
      payload?.goods,
    ];

    const source = arrays.find(Array.isArray) || [];
    const output = [];

    for (const item of source) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const nmId = extractNmIdFromSellerItem(item);
      if (!nmId) {
        continue;
      }

      const detectedSupplierId = normalizeSupplierId(
        item?.supplierId ?? item?.supplier_id ?? item?.supplierID ?? item?.supplier,
      );

      if (detectedSupplierId && String(detectedSupplierId) !== String(supplierId)) {
        continue;
      }

      const stock = extractStockFromSellerItem(item);
      const price = extractPriceFromSellerItem(item);

      output.push({
        nmId,
        supplierId: detectedSupplierId || String(supplierId),
        stockValue: stock.stockValue,
        inStock: stock.inStock,
        currentPrice: price.currentPrice,
        basePrice: price.basePrice,
        name: String(item?.name || item?.title || "").trim(),
        category: String(item?.subject || item?.category || item?.subj_name || "").trim(),
        brand: String(item?.brand || item?.brand_name || "").trim(),
      });
    }

    return output;
  }

  function isLikelyBlockedSellerPayload(payload) {
    if (!payload || typeof payload !== "object") {
      return true;
    }

    if (Array.isArray(payload)) {
      return payload.length === 0;
    }

    const keys = Object.keys(payload);
    if (keys.length === 0) {
      return true;
    }

    if (keys.length <= 2 && "search_result" in payload) {
      return true;
    }

    return false;
  }

  async function fetchSellerProducts(seller, deps) {
    const endpointTemplates = Array.isArray(deps?.endpointTemplates) ? deps.endpointTemplates : [];
    const maxPages = Number.isInteger(deps?.maxPages) ? deps.maxPages : 120;
    const fetchJsonMaybe = deps?.fetchJsonMaybe;
    const normalizeSupplierId = deps?.normalizeSupplierId;

    if (!seller || typeof seller !== "object") {
      throw new Error("Некорректные данные продавца");
    }
    if (endpointTemplates.length === 0 || typeof fetchJsonMaybe !== "function" || typeof normalizeSupplierId !== "function") {
      throw new Error("Seller service не инициализирован");
    }

    const endpointErrors = [];

    for (const makeUrl of endpointTemplates) {
      const byNmId = new Map();
      const seenPageSignatures = new Set();
      let firstPageError = "";

      for (let page = 1; page <= maxPages; page += 1) {
        const url = makeUrl({ supplierId: seller.supplierId, page });
        const response = await fetchJsonMaybe(url);

        if (!response.ok) {
          if (page === 1) {
            firstPageError = response.message || "ошибка запроса";
          }
          break;
        }

        const products = extractSellerProductsFromPayload(response.data, seller.supplierId, normalizeSupplierId);

        if (products.length === 0) {
          if (page === 1 && isLikelyBlockedSellerPayload(response.data)) {
            firstPageError = "WB ограничил выдачу каталога (антибот / x-pow)";
          }
          break;
        }

        const signature = products
          .slice(0, 8)
          .map((item) => item.nmId)
          .join(",");
        if (signature && seenPageSignatures.has(signature)) {
          break;
        }
        seenPageSignatures.add(signature);

        for (const item of products) {
          const existing = byNmId.get(item.nmId);
          if (!existing) {
            byNmId.set(item.nmId, item);
            continue;
          }

          if (!Number.isFinite(existing.stockValue) && Number.isFinite(item.stockValue)) {
            existing.stockValue = item.stockValue;
            existing.inStock = item.stockValue > 0;
          }

          if (existing.inStock === null && typeof item.inStock === "boolean") {
            existing.inStock = item.inStock;
          }

          if (!Number.isFinite(existing.currentPrice) && Number.isFinite(item.currentPrice)) {
            existing.currentPrice = item.currentPrice;
          }
          if (!Number.isFinite(existing.basePrice) && Number.isFinite(item.basePrice)) {
            existing.basePrice = item.basePrice;
          }
        }
      }

      const collected = Array.from(byNmId.values());
      if (collected.length > 0) {
        return collected;
      }

      endpointErrors.push(firstPageError || "нет данных");
    }

    throw new Error(
      `Не удалось загрузить товары продавца (${endpointErrors.filter(Boolean).join("; ") || "нет доступа"})`,
    );
  }

  global.WBSellerService = {
    fetchSellerProducts,
  };
})(window);

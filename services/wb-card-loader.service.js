/*
 * Stage 1 split from app.js:
 * карточки, загрузка, сеть, basket-host и проверки дублей.
 */

const singleRowRefreshQueue = [];
const singleRowRefreshQueuedIds = new Set();
let singleRowRefreshQueueRunning = false;
let singleRowRefreshActiveRowId = "";
const singleRowRefreshProgress = {
  startedAt: 0,
  total: 0,
  completed: 0,
  source: "manual",
  actionKey: "row-refresh",
  mode: "full",
};

function createRow(nmId, initial = {}) {
  return {
    id: `row-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    nmId: String(nmId),
    cabinet: initial.cabinet || "",
    supplierId: initial.supplierId || null,
    stockValue: initial.stockValue ?? null,
    inStock: typeof initial.inStock === "boolean" ? initial.inStock : null,
    stockSource: initial.stockSource || "",
    currentPrice: Number.isFinite(initial.currentPrice) ? Math.max(0, Math.round(initial.currentPrice)) : null,
    basePrice: Number.isFinite(initial.basePrice) ? Math.max(0, Math.round(initial.basePrice)) : null,
    priceSource: initial.priceSource || "",
    loading: false,
    queuedForRefresh: false,
    error: "",
    data: initial.data || null,
    updatedAt: initial.updatedAt || null,
    updateLogs: normalizeRowUpdateLogs(initial.updateLogs),
  };
}

function normalizeRowUpdateLogs(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((entry) => normalizeRowUpdateLogEntry(entry))
    .filter(Boolean)
    .slice(-UPDATE_LOG_LIMIT);
}

function normalizeRowUpdateLogEntry(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const atRaw = String(raw.at || "").trim();
  const atDate = atRaw ? new Date(atRaw) : null;
  const at = atDate && !Number.isNaN(atDate.getTime()) ? atDate.toISOString() : new Date().toISOString();
  const source = String(raw.source || "").trim().toLowerCase() === "system" ? "system" : "manual";
  const modeRaw = String(raw.mode || "").trim();
  const mode = modeRaw || "full";
  const actionKey = String(raw.actionKey || "").trim() || "row-refresh";
  const status = String(raw.status || "").trim().toLowerCase() === "error" ? "error" : "success";
  const error = String(raw.error || "").trim();
  const changes = Array.isArray(raw.changes)
    ? raw.changes
        .map((change) => normalizeRowUpdateLogChange(change))
        .filter(Boolean)
        .slice(0, 40)
    : [];

  return {
    id:
      String(raw.id || "").trim() ||
      `upd-${Math.floor(new Date(at).getTime())}-${Math.random().toString(16).slice(2, 8)}`,
    at,
    source,
    mode,
    actionKey,
    status,
    error,
    changes,
  };
}

function normalizeRowUpdateLogChange(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const field = String(raw.field || "").trim();
  if (!field) {
    return null;
  }

  return {
    field,
    label: String(raw.label || field),
    beforeText: String(raw.beforeText || "").trim(),
    afterText: String(raw.afterText || "").trim(),
  };
}

function normalizeNmIdsForSnapshot(valuesRaw, sourceNmIdRaw = null) {
  const values = Array.isArray(valuesRaw) ? valuesRaw : [];
  const sourceNmId = String(sourceNmIdRaw || "").trim();
  const seen = new Set();
  const output = [];

  for (const value of values) {
    let nmId = "";
    if (typeof value === "number" && Number.isInteger(value) && value >= 100000) {
      nmId = String(value);
    } else if (typeof value === "string" && /^\d{6,}$/.test(value.trim())) {
      nmId = value.trim();
    }

    if (!nmId || (sourceNmId && nmId === sourceNmId) || seen.has(nmId)) {
      continue;
    }
    seen.add(nmId);
    output.push(nmId);
  }

  return output.sort((a, b) => Number(a) - Number(b));
}

function formatNmIdListForLog(valuesRaw) {
  const values = normalizeNmIdsForSnapshot(valuesRaw);
  if (values.length <= 0) {
    return "—";
  }
  if (values.length <= 12) {
    return values.join(", ");
  }
  return `${values.slice(0, 12).join(", ")}, ... (+${values.length - 12})`;
}

function buildNmIdListDiff(beforeRaw, afterRaw) {
  const before = normalizeNmIdsForSnapshot(beforeRaw);
  const after = normalizeNmIdsForSnapshot(afterRaw);
  const beforeSet = new Set(before);
  const afterSet = new Set(after);

  const added = after.filter((nmId) => !beforeSet.has(nmId));
  const removed = before.filter((nmId) => !afterSet.has(nmId));

  return { added, removed };
}

function captureRowUpdateSnapshot(row) {
  const data = row?.data || null;
  const recommendationKnownCount = Number.isInteger(data?.recommendationKnownCount)
    ? data.recommendationKnownCount
    : Array.isArray(data?.recommendationRefs)
      ? data.recommendationRefs.length
      : 0;
  const richCount = Number.isInteger(data?.richBlockCount)
    ? data.richBlockCount
    : Number.isInteger(data?.richDetails?.blockCount)
      ? data.richDetails.blockCount
      : null;
  const listingSlidesCount = Array.isArray(data?.slides) ? data.slides.length : 0;
  const richSlidesCount = Array.isArray(data?.richDetails?.media) ? data.richDetails.media.length : 0;
  const colorNmIds = normalizeNmIdsForSnapshot(Array.isArray(data?.colorNmIds) ? data.colorNmIds : [], row?.nmId);
  const colorCount = colorNmIds.length;

  return {
    hasData: Boolean(data),
    error: String(row?.error || "").trim(),
    hasRich: data?.hasRich === true ? true : data?.hasRich === false ? false : null,
    richCount: Number.isFinite(richCount) ? Number(richCount) : null,
    hasRecommendations:
      data?.hasSellerRecommendations === true ? true : data?.hasSellerRecommendations === false ? false : null,
    recommendationKnownCount: Number.isFinite(recommendationKnownCount) ? Number(recommendationKnownCount) : 0,
    hasVideo: getVideoValue(data),
    hasAutoplay: getAutoplayValue(data),
    hasTags: getTagsValue(data),
    coverDuplicate: getCoverDuplicateValue(data),
    listingSlidesCount,
    richSlidesCount,
    colorNmIds,
    colorCount,
    stockValue: Number.isFinite(row?.stockValue) ? Math.max(0, Math.round(row.stockValue)) : null,
    inStock: typeof row?.inStock === "boolean" ? row.inStock : null,
    currentPrice: Number.isFinite(row?.currentPrice) ? Math.max(0, Math.round(row.currentPrice)) : null,
    basePrice: Number.isFinite(row?.basePrice) ? Math.max(0, Math.round(row.basePrice)) : null,
    rating: Number.isFinite(data?.rating) ? Math.round(Number(data.rating) * 10) / 10 : null,
    reviewCount: Number.isFinite(data?.reviewCount) ? Math.max(0, Math.round(data.reviewCount)) : null,
  };
}

function getModeLabel(modeRaw) {
  const mode = String(modeRaw || "").trim();
  if (mode === "content-only") {
    return "Контент";
  }
  return "Полное";
}

function getActionLabel(actionKeyRaw) {
  const actionKey = String(actionKeyRaw || "").trim();
  if (actionKey === "problem" || actionKey === "problem-retry") {
    return "Проблемные";
  }
  if (actionKey === "all") {
    return "Карточка";
  }
  if (actionKey === "row-refresh") {
    return "Строка";
  }
  if (actionKey === "preview-refresh") {
    return "Листинг";
  }
  if (actionKey === "rich-refresh") {
    return "Рич";
  }
  if (actionKey === "variants-refresh") {
    return "Склейки";
  }
  return "Обновление";
}

function formatSnapshotValue(field, value) {
  if (field === "error") {
    return value ? String(value) : "нет";
  }

  if (field === "stockValue") {
    return Number.isFinite(value) ? `${Math.max(0, Math.round(value))} шт` : "Н/Д";
  }

  if (field === "currentPrice" || field === "basePrice") {
    return Number.isFinite(value) ? `${formatRub(value)} р` : "Н/Д";
  }

  if (field === "rating") {
    return Number.isFinite(value)
      ? `${(Math.round(Number(value) * 10) / 10).toFixed(1).replace(".", ",")}`
      : "Н/Д";
  }

  if (field === "reviewCount") {
    return Number.isFinite(value) ? String(Math.max(0, Math.round(value))) : "Н/Д";
  }

  if (
    field === "hasData" ||
    field === "hasRich" ||
    field === "hasRecommendations" ||
    field === "hasVideo" ||
    field === "hasAutoplay" ||
    field === "hasTags" ||
    field === "coverDuplicate" ||
    field === "inStock"
  ) {
    if (value === true) {
      return "Да";
    }
    if (value === false) {
      return "Нет";
    }
    return "Н/Д";
  }

  if (
    field === "richCount" ||
    field === "recommendationKnownCount" ||
    field === "listingSlidesCount" ||
    field === "richSlidesCount" ||
    field === "colorCount"
  ) {
    return Number.isFinite(value) ? String(Math.max(0, Math.round(value))) : "Н/Д";
  }

  if (field === "colorNmIds") {
    return formatNmIdListForLog(value);
  }

  return value === null || value === undefined || value === "" ? "Н/Д" : String(value);
}

function snapshotsAreEqual(a, b) {
  if (Number.isNaN(a) && Number.isNaN(b)) {
    return true;
  }
  return a === b;
}

function getRowUpdateChanges(beforeSnapshot, afterSnapshot) {
  const fieldMap = [
    { key: "hasData", label: "Данные карточки" },
    { key: "error", label: "Ошибка" },
    { key: "hasRecommendations", label: "Рекомендации" },
    { key: "recommendationKnownCount", label: "Кол-во рекомендаций" },
    { key: "hasRich", label: "Рич-контент" },
    { key: "richCount", label: "Рич-блоков" },
    { key: "hasVideo", label: "Видео" },
    { key: "hasAutoplay", label: "Автоплей" },
    { key: "hasTags", label: "Тэги" },
    { key: "coverDuplicate", label: "Дубль обложки" },
    { key: "listingSlidesCount", label: "Слайдов листинга" },
    { key: "richSlidesCount", label: "Слайдов рича" },
    { key: "colorCount", label: "Кол-во склеек" },
    { key: "stockValue", label: "Остаток" },
    { key: "inStock", label: "Наличие" },
    { key: "currentPrice", label: "Текущая цена" },
    { key: "rating", label: "Рейтинг" },
    { key: "reviewCount", label: "Отзывы" },
  ];

  const changes = [];
  const colorDiff = buildNmIdListDiff(beforeSnapshot?.colorNmIds, afterSnapshot?.colorNmIds);
  if (colorDiff.added.length > 0) {
    changes.push({
      field: "colorNmIdsAdded",
      label: "Склейка: добавлены артикулы",
      beforeText: "—",
      afterText: formatNmIdListForLog(colorDiff.added),
    });
  }
  if (colorDiff.removed.length > 0) {
    changes.push({
      field: "colorNmIdsRemoved",
      label: "Склейка: удалены артикулы",
      beforeText: formatNmIdListForLog(colorDiff.removed),
      afterText: "—",
    });
  }

  for (const field of fieldMap) {
    const before = beforeSnapshot?.[field.key];
    const after = afterSnapshot?.[field.key];
    if (snapshotsAreEqual(before, after)) {
      continue;
    }
    changes.push({
      field: field.key,
      label: field.label,
      beforeText: formatSnapshotValue(field.key, before),
      afterText: formatSnapshotValue(field.key, after),
    });
  }

  return changes;
}

function appendRowUpdateLog(row, payload = {}) {
  if (!row || typeof row !== "object") {
    return;
  }
  const logEntry = normalizeRowUpdateLogEntry(payload);
  if (!logEntry) {
    return;
  }
  row.updateLogs = normalizeRowUpdateLogs([...(Array.isArray(row.updateLogs) ? row.updateLogs : []), logEntry]);
}

function getRowById(rowId) {
  return state.rows.find((row) => row.id === rowId);
}

function getRowByNmId(nmId) {
  return state.rows.find((row) => String(row.nmId) === String(nmId));
}

function removeSingleRowRefreshFromQueue(rowIdRaw) {
  const rowId = String(rowIdRaw || "").trim();
  if (!rowId) {
    return;
  }

  if (singleRowRefreshQueuedIds.has(rowId)) {
    singleRowRefreshQueuedIds.delete(rowId);
    for (let index = singleRowRefreshQueue.length - 1; index >= 0; index -= 1) {
      if (singleRowRefreshQueue[index]?.rowId === rowId) {
        singleRowRefreshQueue.splice(index, 1);
      }
    }
  }

  const row = getRowById(rowId);
  if (row) {
    row.queuedForRefresh = false;
  }
}

function clearSingleRowRefreshQueue() {
  for (const item of singleRowRefreshQueue) {
    const row = getRowById(item?.rowId);
    if (row) {
      row.queuedForRefresh = false;
    }
  }
  singleRowRefreshQueue.length = 0;
  singleRowRefreshQueuedIds.clear();
}

function getSingleRowQueueTotalEstimate() {
  const activeCount = singleRowRefreshActiveRowId ? 1 : 0;
  return Math.max(0, singleRowRefreshProgress.completed + activeCount + singleRowRefreshQueue.length);
}

function syncSingleRowQueueProgressTotal() {
  const estimateTotal = getSingleRowQueueTotalEstimate();
  if (estimateTotal > singleRowRefreshProgress.total) {
    singleRowRefreshProgress.total = estimateTotal;
  }
  if (singleRowRefreshProgress.total <= 0 && estimateTotal > 0) {
    singleRowRefreshProgress.total = estimateTotal;
  }
}

function updateSingleRowQueueBulkProgress(reset = false) {
  if (singleRowRefreshProgress.startedAt <= 0) {
    singleRowRefreshProgress.startedAt = Date.now();
  }

  syncSingleRowQueueProgressTotal();
  const total = Math.max(0, singleRowRefreshProgress.total);
  const completed = Math.max(0, Math.min(total || Number.MAX_SAFE_INTEGER, singleRowRefreshProgress.completed));
  const cancelRequested =
    typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested();

  setBulkLoading(
    true,
    `Обновляю товары (очередь) (${completed}/${total})...`,
    singleRowRefreshProgress.actionKey,
    {
      reset,
      total,
      completed,
      cancellable: true,
      cancelRequested,
      concurrency: 1,
      startedAt: singleRowRefreshProgress.startedAt,
    },
  );
}

async function processSingleRowRefreshQueue() {
  if (singleRowRefreshQueueRunning) {
    return;
  }

  if (singleRowRefreshQueue.length <= 0) {
    return;
  }

  singleRowRefreshQueueRunning = true;
  let canceled = false;

  try {
    const firstTask = singleRowRefreshQueue[0];
    const firstOptions = firstTask?.options && typeof firstTask.options === "object" ? firstTask.options : {};
    singleRowRefreshProgress.startedAt = Date.now();
    singleRowRefreshProgress.completed = 0;
    singleRowRefreshProgress.total = Math.max(1, singleRowRefreshQueue.length);
    singleRowRefreshProgress.source = String(firstOptions.source || "manual").trim() || "manual";
    singleRowRefreshProgress.actionKey = String(firstOptions.actionKey || "row-refresh").trim() || "row-refresh";
    singleRowRefreshProgress.mode = String(firstOptions.mode || "full").trim() || "full";
    updateSingleRowQueueBulkProgress(true);

    while (singleRowRefreshQueue.length > 0) {
      if (typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested()) {
        canceled = true;
        break;
      }

      const task = singleRowRefreshQueue.shift();
      if (!task) {
        continue;
      }

      const rowId = String(task.rowId || "").trim();
      const options = task.options && typeof task.options === "object" ? { ...task.options } : {};
      singleRowRefreshQueuedIds.delete(rowId);

      const row = getRowById(rowId);
      if (!row) {
        continue;
      }

      row.queuedForRefresh = false;
      singleRowRefreshActiveRowId = rowId;
      render();

      try {
        const mode = String(options.mode || "full").trim() || "full";
        const source = String(options.source || singleRowRefreshProgress.source || "manual").trim() || "manual";
        const forceHostProbe = options.forceHostProbe === true;
        const actionKey =
          String(options.actionKey || singleRowRefreshProgress.actionKey || "row-refresh").trim() || "row-refresh";
        const abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
        state.singleRowAbortController = abortController;

        await loadRow(rowId, {
          silentStart: false,
          forceHostProbe,
          mode,
          source,
          actionKey,
          recordProblemSnapshot: false,
          requestSignal: abortController ? abortController.signal : null,
        });
      } finally {
        if (state.singleRowAbortController) {
          state.singleRowAbortController = null;
        }
        singleRowRefreshProgress.completed += 1;
        singleRowRefreshActiveRowId = "";
        if (!(typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested())) {
          updateSingleRowQueueBulkProgress(false);
        }
      }

      if (typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested()) {
        canceled = true;
        break;
      }
    }
  } finally {
    if (canceled) {
      clearSingleRowRefreshQueue();
    }

    state.lastSyncAt = new Date().toISOString();
    if (typeof recordProblemSnapshot === "function") {
      recordProblemSnapshot({
        source: singleRowRefreshProgress.source,
        actionKey: singleRowRefreshProgress.actionKey,
        mode: singleRowRefreshProgress.mode,
      });
    }

    const completed = Math.max(0, singleRowRefreshProgress.completed);
    const total = Math.max(completed, singleRowRefreshProgress.total);

    setBulkLoading(
      false,
      canceled ? `Обновление остановлено (${completed}/${total})` : "Обновление завершено",
      singleRowRefreshProgress.actionKey,
      {
        total,
        completed,
        canceled,
        concurrency: 1,
      },
    );

    singleRowRefreshActiveRowId = "";
    singleRowRefreshQueueRunning = false;
    singleRowRefreshProgress.startedAt = 0;
    singleRowRefreshProgress.total = 0;
    singleRowRefreshProgress.completed = 0;
    singleRowRefreshProgress.source = "manual";
    singleRowRefreshProgress.actionKey = "row-refresh";
    singleRowRefreshProgress.mode = "full";
    render();
  }
}

function enqueueSingleRowWithProgress(rowIdRaw, options = {}) {
  const rowId = String(rowIdRaw || "").trim();
  if (!rowId) {
    return false;
  }

  const row = getRowById(rowId);
  if (!row) {
    return false;
  }

  if (state.isBulkLoading && !singleRowRefreshQueueRunning && !singleRowRefreshActiveRowId) {
    return false;
  }

  if (row.loading || singleRowRefreshActiveRowId === rowId || singleRowRefreshQueuedIds.has(rowId)) {
    return false;
  }

  singleRowRefreshQueue.push({
    rowId,
    options: options && typeof options === "object" ? { ...options } : {},
  });
  singleRowRefreshQueuedIds.add(rowId);
  row.queuedForRefresh = true;

  if (singleRowRefreshQueueRunning) {
    syncSingleRowQueueProgressTotal();
    updateSingleRowQueueBulkProgress(false);
  }

  render();
  void processSingleRowRefreshQueue();
  return true;
}

function removeRow(rowId) {
  removeSingleRowRefreshFromQueue(rowId);
  state.rows = state.rows.filter((row) => row.id !== rowId);
  render();
}

function upsertRowsFromNmIds(nmIds) {
  const createdIds = [];

  for (const nmIdRaw of nmIds) {
    const nmId = String(nmIdRaw);
    let row = getRowByNmId(nmId);
    if (!row) {
      row = createRow(nmId);
      state.rows.push(row);
      createdIds.push(row.id);
    }
  }

  renderCabinetFilterOptions();
  return createdIds;
}

function mergeStockIntoRow(row, stock) {
  if (!row || !stock) {
    return;
  }

  if (Number.isFinite(stock.stockValue)) {
    row.stockValue = Math.max(0, Math.round(stock.stockValue));
    row.inStock = row.stockValue > 0;
    row.stockSource = stock.source || row.stockSource;
    return;
  }

  if (typeof stock.inStock === "boolean") {
    row.inStock = stock.inStock;
    row.stockSource = stock.source || row.stockSource;
  }
}

function mergePriceIntoRow(row, price) {
  if (!row || !price || typeof price !== "object") {
    return;
  }

  if (Number.isFinite(price.currentPrice)) {
    row.currentPrice = Math.max(0, Math.round(price.currentPrice));
    row.priceSource = price.source || row.priceSource;
  }

  if (Number.isFinite(price.basePrice)) {
    row.basePrice = Math.max(0, Math.round(price.basePrice));
  }
}

function isTrustedMarketSource(sourceRaw) {
  const source = String(sourceRaw || "").trim().toLowerCase();
  return source === "card-v4";
}

function applyMarketStabilityGuard(payload, previousData, row) {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const previous = previousData && typeof previousData === "object" ? previousData : null;
  const trustedStockSource = isTrustedMarketSource(payload.stockSource);
  const trustedPriceSource = isTrustedMarketSource(payload.priceSource);
  const hasTrustedMarketSource = trustedStockSource || trustedPriceSource;

  if (!previous) {
    // Для новых карточек принимаем рыночные значения только из прямого card-v4.
    if (!trustedStockSource) {
      payload.stockValue = null;
      payload.inStock = null;
      payload.stockSource = "";
    }

    if (!trustedPriceSource) {
      payload.currentPrice = null;
      payload.basePrice = null;
      payload.priceSource = "";
    }

    if (!hasTrustedMarketSource) {
      payload.rating = null;
      payload.reviewCount = null;
    }

    return;
  }
  if (!trustedStockSource) {
    const previousStockSource = String(previous.stockSource || row?.stockSource || "").trim();
    const previousStockTrusted = isTrustedMarketSource(previousStockSource);

    if (!previousStockTrusted) {
      payload.stockValue = null;
      payload.inStock = null;
      payload.stockSource = "";
    } else {
      const previousStockValue = Number.isFinite(previous.stockValue)
        ? Math.max(0, Math.round(previous.stockValue))
        : Number.isFinite(row?.stockValue)
          ? Math.max(0, Math.round(row.stockValue))
          : null;
      const previousInStock =
        typeof previous.inStock === "boolean"
          ? previous.inStock
          : typeof row?.inStock === "boolean"
            ? row.inStock
            : null;

      if (Number.isFinite(previousStockValue)) {
        payload.stockValue = previousStockValue;
        payload.inStock = previousStockValue > 0;
      } else if (typeof previousInStock === "boolean") {
        payload.stockValue = null;
        payload.inStock = previousInStock;
      }

      payload.stockSource = String(previous.stockSource || row?.stockSource || payload.stockSource || "");
    }
  }

  if (!trustedPriceSource) {
    const previousPriceSource = String(previous.priceSource || row?.priceSource || "").trim();
    const previousPriceTrusted = isTrustedMarketSource(previousPriceSource);

    if (!previousPriceTrusted) {
      payload.currentPrice = null;
      payload.basePrice = null;
      payload.priceSource = "";
    } else {
      const previousCurrentPrice = Number.isFinite(previous.currentPrice)
        ? Math.max(0, Math.round(previous.currentPrice))
        : Number.isFinite(row?.currentPrice)
          ? Math.max(0, Math.round(row.currentPrice))
          : null;
      const previousBasePrice = Number.isFinite(previous.basePrice)
        ? Math.max(0, Math.round(previous.basePrice))
        : Number.isFinite(row?.basePrice)
          ? Math.max(0, Math.round(row.basePrice))
          : null;

      if (Number.isFinite(previousCurrentPrice)) {
        payload.currentPrice = previousCurrentPrice;
      }
      if (Number.isFinite(previousBasePrice)) {
        payload.basePrice = previousBasePrice;
      }

      payload.priceSource = String(previous.priceSource || row?.priceSource || payload.priceSource || "");
    }
  }

  const previousStockSource = String(previous.stockSource || row?.stockSource || "").trim();
  const previousPriceSource = String(previous.priceSource || row?.priceSource || "").trim();
  const previousHadTrustedMarketSource =
    isTrustedMarketSource(previousStockSource) || isTrustedMarketSource(previousPriceSource);

  if (!Number.isFinite(payload.rating) && Number.isFinite(previous.rating) && previousHadTrustedMarketSource) {
    payload.rating = Math.round(Number(previous.rating) * 10) / 10;
  }

  if (
    !Number.isFinite(payload.reviewCount) &&
    Number.isFinite(previous.reviewCount) &&
    previousHadTrustedMarketSource
  ) {
    payload.reviewCount = Math.max(0, Math.round(previous.reviewCount));
  }
}

async function loadRowsByIds(rowIds, options = {}) {
  const {
    loadingText = "Обновляю карточки",
    mode = "full",
    actionKey = "all",
    source = "manual",
  } = options;

  if (!Array.isArray(rowIds) || rowIds.length === 0) {
    return;
  }

  const uniqueIds = Array.from(new Set(rowIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return;
  }

  let completed = 0;
  let canceled = false;
  let total = uniqueIds.length;
  setBulkLoading(true, `${loadingText} (0/${total})...`, actionKey, {
    reset: true,
    total,
    completed: 0,
    cancellable: true,
    concurrency: BULK_CONCURRENCY,
  });

  await runWithConcurrency(
    uniqueIds,
    BULK_CONCURRENCY,
    async (rowId) => {
      if (typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested()) {
        canceled = true;
        return;
      }

      await loadRow(rowId, {
        silentStart: true,
        mode,
        source,
        actionKey,
        recordProblemSnapshot: false,
      });
      completed += 1;
      const cancelRequested =
        typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested();
      setBulkLoading(true, `${loadingText} (${completed}/${total})...`, actionKey, {
        total,
        completed,
        cancellable: true,
        cancelRequested,
        concurrency: BULK_CONCURRENCY,
      });
    },
    {
      shouldStop: () => typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested(),
    },
  );

  if (typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested()) {
    canceled = true;
  }

  if (!canceled) {
    const retryIds = uniqueIds.filter((rowId) => {
      const row = getRowById(rowId);
      return Boolean(row?.error && isRetriableRowError(row.error));
    });
    if (retryIds.length > 0) {
      total += retryIds.length;
      setBulkLoading(true, `${loadingText} · повтор (0/${retryIds.length})...`, actionKey, {
        total,
        completed,
        cancellable: true,
        concurrency: BULK_CONCURRENCY,
      });

      await sleep(1100);
      for (let index = 0; index < retryIds.length; index += 1) {
        if (typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested()) {
          canceled = true;
          break;
        }
        await loadRow(retryIds[index], {
          silentStart: true,
          mode,
          source,
          actionKey: `${actionKey}-retry`,
          recordProblemSnapshot: false,
        });
        completed += 1;
        const cancelRequested =
          typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested();
        setBulkLoading(true, `${loadingText} · повтор (${index + 1}/${retryIds.length})...`, actionKey, {
          total,
          completed,
          cancellable: true,
          cancelRequested,
          concurrency: BULK_CONCURRENCY,
        });
      }
    }
  }

  state.lastSyncAt = new Date().toISOString();
  if (typeof recordProblemSnapshot === "function") {
    recordProblemSnapshot({
      source,
      actionKey,
      mode,
    });
  }
  setBulkLoading(
    false,
    canceled ? `Обновление остановлено (${completed}/${total})` : "Обновление завершено",
    actionKey,
    {
      total,
      completed,
      canceled,
      concurrency: BULK_CONCURRENCY,
    },
  );
  render();
}

async function loadSingleRowWithProgress(rowId, options = {}) {
  const row = getRowById(rowId);
  if (!row || row.loading || state.isBulkLoading) {
    return {
      started: false,
      canceled: false,
    };
  }

  row.queuedForRefresh = false;

  const source = String(options.source || "manual").trim() || "manual";
  const actionKey = String(options.actionKey || "row-refresh").trim() || "row-refresh";
  const mode = String(options.mode || "full").trim() || "full";
  const forceHostProbe = options.forceHostProbe === true;
  const loadingText = String(options.loadingText || `Обновляю артикул ${row.nmId}`).trim();

  let canceled = false;
  const startedAt = Date.now();
  const abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
  state.singleRowAbortController = abortController;

  setBulkLoading(true, `${loadingText} (0/1)...`, actionKey, {
    reset: true,
    total: 1,
    completed: 0,
    cancellable: true,
    startedAt,
    concurrency: 1,
  });

  try {
    if (typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested()) {
      canceled = true;
    } else {
      await loadRow(rowId, {
        silentStart: false,
        forceHostProbe,
        mode,
        source,
        actionKey,
        recordProblemSnapshot: false,
        requestSignal: abortController ? abortController.signal : null,
      });

      canceled = typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested();

      if (!canceled) {
        setBulkLoading(true, `${loadingText} (1/1)...`, actionKey, {
          total: 1,
          completed: 1,
          cancellable: true,
          concurrency: 1,
        });
      }

      state.lastSyncAt = new Date().toISOString();
      if (typeof recordProblemSnapshot === "function") {
        recordProblemSnapshot({
          source,
          actionKey,
          mode,
        });
      }
    }
  } finally {
    if (state.singleRowAbortController === abortController) {
      state.singleRowAbortController = null;
    }

    setBulkLoading(
      false,
      canceled ? "Обновление остановлено (0/1)" : "Обновление завершено",
      actionKey,
      {
        total: 1,
        completed: canceled ? 0 : 1,
        canceled,
        concurrency: 1,
      },
    );
    render();
  }

  return {
    started: true,
    canceled,
  };
}

async function loadRow(
  rowId,
  {
    silentStart = false,
    forceHostProbe = false,
    mode = "full",
    source = "manual",
    actionKey = "row-refresh",
    recordProblemSnapshot = true,
    requestSignal = null,
  } = {},
) {
  const row = getRowById(rowId);
  if (!row || row.loading) {
    return;
  }

  const beforeSnapshot = captureRowUpdateSnapshot(row);
  const previousData = row.data && typeof row.data === "object" ? row.data : null;

  row.loading = true;
  row.error = "";
  let canceledByUser = false;

  if (!silentStart) {
    render();
  } else {
    renderSummary();
  }

  try {
    if (requestSignal && requestSignal.aborted) {
      canceledByUser = true;
      return;
    }

    const loadMode = String(mode || "full").trim() || "full";
    const payload = await fetchCardPayload(row.nmId, {
      forceHostProbe,
      mode: loadMode,
      requestSignal,
      previousCoverDuplicate:
        previousData && typeof previousData.coverSlideDuplicate === "boolean"
          ? previousData.coverSlideDuplicate
          : null,
      previousPhotoCount:
        previousData && Number.isFinite(previousData.photoCount)
          ? Math.max(0, Math.round(previousData.photoCount))
          : null,
    });
    if (requestSignal && requestSignal.aborted) {
      canceledByUser = true;
      throw new Error("Обновление остановлено пользователем");
    }
    const target = getRowById(rowId);
    if (!target) {
      return;
    }

    const targetPreviousData = target.data && typeof target.data === "object" ? target.data : null;
    applyMarketStabilityGuard(payload, targetPreviousData, target);

    target.updatedAt = new Date().toISOString();
    target.error = "";
    target.data = payload;

    if (payload.supplierId) {
      target.supplierId = String(payload.supplierId);
    }

    const cabinetFromMap = getCabinetBySupplierId(target.supplierId);
    if (cabinetFromMap) {
      target.cabinet = cabinetFromMap;
    }

    if (loadMode === "full") {
      mergeStockIntoRow(target, {
        stockValue: payload.stockValue,
        inStock: payload.inStock,
        source: payload.stockSource || "card-v4",
      });

      mergePriceIntoRow(target, {
        currentPrice: payload.currentPrice,
        basePrice: payload.basePrice,
        source: payload.priceSource || "card-v4",
      });
    } else if (loadMode === "content-only" && targetPreviousData) {
      target.data.stockValue = Number.isFinite(targetPreviousData.stockValue)
        ? targetPreviousData.stockValue
        : target.stockValue;
      target.data.inStock = typeof targetPreviousData.inStock === "boolean" ? targetPreviousData.inStock : target.inStock;
      target.data.stockSource = String(targetPreviousData.stockSource || target.stockSource || "");
      target.data.currentPrice = Number.isFinite(targetPreviousData.currentPrice)
        ? targetPreviousData.currentPrice
        : target.currentPrice;
      target.data.basePrice = Number.isFinite(targetPreviousData.basePrice)
        ? targetPreviousData.basePrice
        : target.basePrice;
      target.data.priceSource = String(targetPreviousData.priceSource || target.priceSource || "");
      target.data.rating = Number.isFinite(targetPreviousData.rating)
        ? Math.round(Number(targetPreviousData.rating) * 10) / 10
        : null;
      target.data.reviewCount = Number.isFinite(targetPreviousData.reviewCount)
        ? Math.max(0, Math.round(targetPreviousData.reviewCount))
        : null;
    }

    if (typeof prefetchColorVariantsForRow === "function") {
      // Предзагрузка склеек не должна блокировать основное обновление карточки.
      // Иначе карточка может "висеть" из-за внешних артикулов вне текущей базы.
      Promise.resolve()
        .then(() =>
          prefetchColorVariantsForRow(rowId, {
            forceRefresh: forceHostProbe === true,
            requestSignal,
            localOnly: true,
          }),
        )
        .catch(() => {
          // Склейки — вспомогательные данные; ошибки предзагрузки не должны ронять обновление строки.
        });
    }
  } catch (error) {
    const target = getRowById(rowId);
    if (!target) {
      return;
    }

    const errorMessage = error instanceof Error ? error.message : String(error);
    const aborted = canceledByUser || (requestSignal && requestSignal.aborted) || isUpdateCanceledError(error);

    if (aborted) {
      canceledByUser = true;
      target.error = "";
    } else {
      target.error = errorMessage;
    }
  } finally {
    const target = getRowById(rowId);
    if (target) {
      const afterSnapshot = captureRowUpdateSnapshot(target);
      const changes = getRowUpdateChanges(beforeSnapshot, afterSnapshot);
      appendRowUpdateLog(target, {
        at: new Date().toISOString(),
        source,
        mode,
        actionKey,
        status: target.error ? "error" : "success",
        error: target.error || "",
        changes,
      });
      target.loading = false;
    }

    state.lastSyncAt = new Date().toISOString();
    if (recordProblemSnapshot && typeof recordProblemSnapshot === "function") {
      recordProblemSnapshot({
        source,
        actionKey,
        mode,
      });
    }
    persistState();
    render();
  }
}

function getCabinetBySupplierId(supplierIdRaw) {
  const supplierId = normalizeSupplierId(supplierIdRaw);
  if (!supplierId) {
    return "";
  }

  const seller = getSellerSettings().find((item) => String(item.supplierId) === String(supplierId));
  return seller?.cabinet || "";
}

async function fetchCardPayload(nmIdRaw, options = {}) {
  const forceHostProbe = Boolean(options.forceHostProbe);
  const mode = String(options.mode || "full").trim() || "full";
  const requestSignal = options.requestSignal || null;
  const nmId = Number(nmIdRaw);
  if (!Number.isInteger(nmId) || nmId <= 0) {
    throw new Error("Некорректный артикул");
  }

  const vol = Math.floor(nmId / 100000);
  const part = Math.floor(nmId / 1000);

  const shouldLoadMarket = mode !== "content-only";
  const loadByHost = async (hostSuffix) => {
    const base = `https://basket-${hostSuffix}.wbbasket.ru/vol${vol}/part${part}/${nmId}`;
    const cardPromise = fetchJson(
      `${base}/info/ru/card.json`,
      { signal: requestSignal },
      { attempts: 2, timeoutMs: FAST_CARD_FETCH_TIMEOUT_MS },
    );
    const marketPromise = shouldLoadMarket
      ? fetchCardMarketSnapshot(nmId, { basketBase: base, requestSignal })
      : Promise.resolve(createEmptyMarketSnapshot());

    const [card, marketSnapshot] = await Promise.all([cardPromise, marketPromise]);
    if (requestSignal && requestSignal.aborted) {
      throw new Error("Обновление остановлено пользователем");
    }

    return {
      hostSuffix,
      base,
      card,
      marketSnapshot,
    };
  };

  let resolved = null;
  try {
    resolved = await loadByHost(
      await resolveBasketHost({
        nmId,
        vol,
        part,
        forceProbe: forceHostProbe,
        requestSignal,
      }),
    );
  } catch (error) {
    if (isUpdateCanceledError(error) || (requestSignal && requestSignal.aborted)) {
      throw new Error("Обновление остановлено пользователем");
    }
    if (forceHostProbe) {
      throw error;
    }
    resolved = await loadByHost(
      await resolveBasketHost({
        nmId,
        vol,
        part,
        forceProbe: true,
        requestSignal,
      }),
    );
  }

  if (!resolved || !resolved.card || typeof resolved.card !== "object") {
    throw new Error("Не удалось загрузить данные карточки");
  }

  const hostSuffix = resolved.hostSuffix;
  const base = resolved.base;
  const card = resolved.card;
  const marketSnapshot = resolved.marketSnapshot;

  const hasSellerRecommendations = card?.has_seller_recommendations === true;
  const hasRich = card?.has_rich === true;

  let richBlockCount = null;
  let recommendationRefs = [];
  let richDetails = null;

  if (hasRich || hasSellerRecommendations) {
    try {
      const rich = await fetchJson(
        `${base}/info/ru/rich.json`,
        { signal: requestSignal },
        { attempts: 1, timeoutMs: FAST_RICH_FETCH_TIMEOUT_MS },
      );
      if (hasRich) {
        richBlockCount = Array.isArray(rich?.content) ? rich.content.length : 0;
      }
      recommendationRefs = extractRecommendationRefsFromRich(rich, nmId);
      richDetails = extractRichDetailsFromPayload(rich);
    } catch (error) {
      if (isUpdateCanceledError(error) || (requestSignal && requestSignal.aborted)) {
        throw new Error("Обновление остановлено пользователем");
      }
      if (hasRich) {
        richBlockCount = 0;
      }
      recommendationRefs = [];
      richDetails = null;
    }
  }

  const normalizedRichRefs = normalizeRecommendationRefs(recommendationRefs, nmId);
  const colorNmIds = normalizeColorNmIds(card?.full_colors, card?.colors, nmId);

  const photoCount = Number(card?.media?.photo_count) || 0;
  const slides = [];
  for (let index = 1; index <= photoCount; index += 1) {
    slides.push(`${base}/images/big/${index}.webp`);
  }

  let coverSlideDuplicate = null;
  const previousPhotoCount = Number.isFinite(options.previousPhotoCount)
    ? Math.max(0, Math.round(options.previousPhotoCount))
    : null;
  const previousCoverDuplicate =
    typeof options.previousCoverDuplicate === "boolean" ? options.previousCoverDuplicate : null;

  if (
    previousPhotoCount !== null &&
    previousPhotoCount === photoCount &&
    typeof previousCoverDuplicate === "boolean"
  ) {
    coverSlideDuplicate = previousCoverDuplicate;
  } else {
    coverSlideDuplicate = await detectCoverSlideDuplicate(slides, { requestSignal });
  }

  return {
    hostSuffix,
    supplierId: normalizeSupplierId(card?.selling?.supplier_id),
    cardCode: normalizeCardCode(card?.vendor_code ?? card?.vendorCode),
    link: `https://www.wildberries.ru/catalog/${nmId}/detail.aspx`,
    name: card?.imt_name || card?.slug || "-",
    category: card?.subj_name || "-",
    brand: card?.selling?.brand_name || "-",
    hasVideo: toNullableBoolean(card?.media?.has_video),
    hasSellerRecommendations: card?.has_seller_recommendations === true,
    recommendationRefs: normalizedRichRefs,
    recommendationRefsFromRich: normalizedRichRefs.slice(0, RECOMMENDATION_IDS_LIST_LIMIT),
    recommendationRefsFromApi: [],
    recommendationKnownCount: normalizedRichRefs.length,
    recommendationResolvedRefs: normalizedRichRefs.slice(0, RECOMMENDATION_IDS_LIST_LIMIT),
    recommendationRefsTruncated: normalizedRichRefs.length > RECOMMENDATION_IDS_LIST_LIMIT,
    recommendationRefsFromRichTruncated: normalizedRichRefs.length > RECOMMENDATION_IDS_LIST_LIMIT,
    recommendationRefsFromApiTruncated: false,
    recommendationDetails: null,
    recommendationDetailsError: "",
    recommendationsResolvedAt: null,
    hasRich,
    richBlockCount,
    richDetails,
    hasAutoplay: card?.media?.is_autoplaying_video === true,
    hasTags: toNullableBoolean(card?.enable_tags),
    coverSlideDuplicate,
    colorNmIds,
    colorCount: colorNmIds.length,
    slides,
    photoCount,
    cardUpdatedAt: card?.update_date || null,
    stockValue: marketSnapshot.stockValue,
    inStock: marketSnapshot.inStock,
    stockSource: marketSnapshot.stockSource,
    currentPrice: marketSnapshot.currentPrice,
    basePrice: marketSnapshot.basePrice,
    priceSource: marketSnapshot.priceSource,
    rating: Number.isFinite(marketSnapshot.rating) ? marketSnapshot.rating : null,
    reviewCount: Number.isFinite(marketSnapshot.reviewCount)
      ? Math.max(0, Math.round(marketSnapshot.reviewCount))
      : null,
  };
}

async function fetchCardMarketSnapshot(nmIdRaw, options = {}) {
  const marketService = window.WBMarketService;
  if (!marketService || typeof marketService.fetchCardMarketSnapshot !== "function") {
    return createEmptyMarketSnapshot();
  }

  const requestSignal = options.requestSignal || null;
  if (requestSignal && requestSignal.aborted) {
    throw new Error("Обновление остановлено пользователем");
  }
  const snapshot = await marketService.fetchCardMarketSnapshot(nmIdRaw, options, {
    fetchJsonMaybe: (url, config = {}) => fetchJsonMaybe(url, { signal: requestSignal }, config),
    fetchWithRetry: (url, fetchOptions = {}, config = {}) =>
      fetchWithRetry(url, { ...fetchOptions, signal: requestSignal }, config),
    fetchTimeoutMs: FAST_CARD_FETCH_TIMEOUT_MS,
  });
  if (requestSignal && requestSignal.aborted) {
    throw new Error("Обновление остановлено пользователем");
  }
  return snapshot;
}

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

function toNullableBoolean(value) {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  return null;
}

function normalizeRowData(dataRaw) {
  if (!dataRaw || typeof dataRaw !== "object") {
    return null;
  }

  const data = { ...dataRaw };
  data.hasSellerRecommendations = data.hasSellerRecommendations === true;
  data.hasAutoplay = data.hasAutoplay === true;
  data.richDetails = normalizeRichDetails(data.richDetails);
  data.stockValue = Number.isFinite(data.stockValue) ? Math.max(0, Math.round(data.stockValue)) : null;
  data.inStock = typeof data.inStock === "boolean" ? data.inStock : null;
  data.stockSource = String(data.stockSource || "");
  data.currentPrice = Number.isFinite(data.currentPrice) ? Math.max(0, Math.round(data.currentPrice)) : null;
  data.basePrice = Number.isFinite(data.basePrice) ? Math.max(0, Math.round(data.basePrice)) : null;
  data.priceSource = String(data.priceSource || "");
  data.rating = Number.isFinite(data.rating) ? Math.round(Number(data.rating) * 10) / 10 : null;
  data.reviewCount = Number.isFinite(data.reviewCount) ? Math.max(0, Math.round(data.reviewCount)) : null;
  data.cardCode = normalizeCardCode(data.cardCode ?? data.vendorCode ?? data.vendor_code);
  data.coverSlideDuplicate =
    data.coverSlideDuplicate === true ? true : data.coverSlideDuplicate === false ? false : null;
  if (data.coverSlideDuplicate === null) {
    const slides = Array.isArray(data.slides) ? data.slides : [];
    if (slides.length === 1) {
      data.coverSlideDuplicate = false;
    }
  }
  const colorNmIds = normalizeColorNmIds(data.colorNmIds || data.full_colors || data.fullColors, data.colors);
  data.colorNmIds = colorNmIds;
  data.colorCount = colorNmIds.length;

  const richRefs = normalizeRecommendationRefs(data.recommendationRefsFromRich || data.recommendationRefs);
  const apiRefs = normalizeRecommendationRefs(data.recommendationRefsFromApi);
  const resolvedRefs = normalizeRecommendationRefs(data.recommendationResolvedRefs);

  data.recommendationRefs = richRefs;
  data.recommendationRefsFromRich = richRefs;
  data.recommendationRefsFromApi = apiRefs;
  data.recommendationResolvedRefs =
    resolvedRefs.length > 0 ? resolvedRefs : normalizeRecommendationRefs([...apiRefs, ...richRefs]);
  data.recommendationRefsFromRichTruncated =
    data.recommendationRefsFromRichTruncated === true ||
    (Number.isInteger(data.recommendationKnownCount) && data.recommendationKnownCount > RECOMMENDATION_IDS_LIST_LIMIT && richRefs.length >= RECOMMENDATION_IDS_LIST_LIMIT);
  data.recommendationRefsFromApiTruncated = data.recommendationRefsFromApiTruncated === true;

  return data;
}

function normalizeColorNmIds(rawFullColors, rawColors, currentNmIdRaw = null) {
  const ids = [];
  const seen = new Set();

  const addCandidate = (value) => {
    let nmId = "";
    if (typeof value === "number" && Number.isInteger(value) && value >= 100000) {
      nmId = String(value);
    } else if (typeof value === "string" && /^\d{6,}$/.test(value.trim())) {
      nmId = value.trim();
    } else if (value && typeof value === "object") {
      const objectNmId =
        value.nm_id ??
        value.nmId ??
        value.id ??
        value.nm ??
        value.nmid ??
        value.productId ??
        value.product_id ??
        null;
      addCandidate(objectNmId);
      return;
    }

    if (!nmId || seen.has(nmId)) {
      return;
    }

    seen.add(nmId);
    ids.push(nmId);
  };

  if (Array.isArray(rawFullColors)) {
    for (const item of rawFullColors) {
      addCandidate(item);
    }
  }

  if (Array.isArray(rawColors)) {
    for (const item of rawColors) {
      addCandidate(item);
    }
  }

  const currentNmId =
    typeof currentNmIdRaw === "number" && Number.isInteger(currentNmIdRaw) && currentNmIdRaw >= 100000
      ? String(currentNmIdRaw)
      : typeof currentNmIdRaw === "string" && /^\d{6,}$/.test(currentNmIdRaw.trim())
        ? currentNmIdRaw.trim()
        : "";

  if (currentNmId) {
    const ownIndex = ids.indexOf(currentNmId);
    if (ownIndex >= 0) {
      ids.splice(ownIndex, 1);
    }
  }

  return ids.slice(0, 240);
}

function normalizeRichDetails(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const blockCount = Number.isInteger(raw.blockCount) ? Math.max(0, raw.blockCount) : 0;
  const media = Array.isArray(raw.media)
    ? orderRichMediaUrls(raw.media.map((item) => String(item || "").trim()).filter(Boolean)).slice(0, 60)
    : [];
  const links = Array.isArray(raw.links)
    ? raw.links.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 80)
    : [];
  const snippets = Array.isArray(raw.snippets)
    ? raw.snippets.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 80)
    : [];

  return { blockCount, media, links, snippets };
}

function orderRichMediaUrls(urls) {
  if (!Array.isArray(urls) || urls.length <= 1) {
    return Array.isArray(urls) ? urls : [];
  }

  // В WB имена файлов не гарантируют текущий визуальный порядок после перестановок в кабинете.
  // Поэтому оставляем порядок из rich.content и не сортируем по номеру в имени файла.
  const seen = new Set();
  const ordered = [];
  for (const item of urls) {
    const url = String(item || "").trim();
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    ordered.push(url);
  }
  return ordered;
}

function extractRichMediaOrder(urlRaw) {
  const url = String(urlRaw || "");
  if (!url) {
    return null;
  }

  const fromFilename = url.match(/(?:^|\/)(\d{1,4})\.(?:webp|jpg|jpeg|png|gif|avif)(?:\?.*)?$/i);
  if (fromFilename?.[1]) {
    return Number(fromFilename[1]);
  }

  const fromSlideToken = url.match(/(?:slide|frame|image)[_-]?(\d{1,4})/i);
  if (fromSlideToken?.[1]) {
    return Number(fromSlideToken[1]);
  }

  return null;
}

function normalizeSupplierId(value) {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }

  if (typeof value === "string") {
    const normalized = value.trim();
    if (/^\d+$/.test(normalized)) {
      return normalized;
    }
  }

  return null;
}

function normalizeCardCode(valueRaw) {
  const value = String(valueRaw || "").trim();
  if (!value) {
    return "";
  }
  return value.replace(/\s+/g, "").slice(0, 36).toUpperCase();
}

async function resolveBasketHost({ nmId, vol, part, forceProbe = false, requestSignal = null }) {
  const volKey = String(vol);
  const cached = state.basketByVol[volKey];

  if (cached && !forceProbe) {
    const alive = await checkHost(cached, nmId, vol, part, requestSignal, { fast: true });
    if (alive) {
      return cached;
    }
  }

  const probeEnd = forceProbe ? Math.max(BASKET_END, 120) : BASKET_END;
  const candidates = [];
  if (cached) {
    candidates.push(cached);
  }
  for (let host = BASKET_START; host <= probeEnd; host += 1) {
    const suffix = String(host).padStart(2, "0");
    if (!candidates.includes(suffix)) {
      candidates.push(suffix);
    }
  }

  let resolved = null;

  for (const suffix of candidates) {
    if (requestSignal && requestSignal.aborted) {
      throw new Error("Обновление остановлено пользователем");
    }
    if (await checkHost(suffix, nmId, vol, part, requestSignal, { fast: true })) {
      resolved = suffix;
      break;
    }
  }

  // fallback: более надежная (медленная) проверка, если быстрый проход ничего не нашел
  if (!resolved) {
    for (const suffix of candidates) {
      if (requestSignal && requestSignal.aborted) {
        throw new Error("Обновление остановлено пользователем");
      }
      if (await checkHost(suffix, nmId, vol, part, requestSignal, { fast: false })) {
        resolved = suffix;
        break;
      }
      await sleep(HOST_PROBE_PAUSE_MS);
    }
  }

  if (!resolved) {
    if (cached && forceProbe) {
      delete state.basketByVol[volKey];
      persistState();
    }
    throw new Error("Не удалось определить basket-хост");
  }

  state.basketByVol[volKey] = resolved;
  persistState();
  return resolved;
}

async function checkHost(hostSuffix, nmId, vol, part, requestSignal = null, options = {}) {
  const probeUrl = `https://basket-${hostSuffix}.wbbasket.ru/vol${vol}/part${part}/${nmId}/images/c246x328/1.webp`;
  const fast = options && options.fast === true;
  const timeoutMs = fast ? Math.max(1000, Number(FAST_HOST_PROBE_TIMEOUT_MS) || 1800) : 8000;
  const attempts = fast ? Math.max(1, Number(FAST_HOST_PROBE_ATTEMPTS) || 1) : 2;

  try {
    const response = await fetchWithRetry(
      probeUrl,
      {
        method: "HEAD",
        mode: "cors",
        cache: "no-store",
        signal: requestSignal,
      },
      { attempts, timeoutMs },
    );
    if (response.ok) {
      return true;
    }

    if (response.status === 405 || response.status === 403) {
      const fallback = await fetchWithRetry(
        probeUrl,
        {
          method: "GET",
          mode: "cors",
          cache: "no-store",
          signal: requestSignal,
        },
        { attempts, timeoutMs },
      );
      return fallback.ok;
    }

    return false;
  } catch {
    if (requestSignal && requestSignal.aborted) {
      throw new Error("Обновление остановлено пользователем");
    }
    return false;
  }
}

function sleep(ms) {
  const timeout = Math.max(0, Number(ms) || 0);
  return new Promise((resolve) => {
    setTimeout(resolve, timeout);
  });
}

function isRetriableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function parseRetryAfterMs(value) {
  if (!value) {
    return null;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const absolute = Date.parse(value);
  if (Number.isNaN(absolute)) {
    return null;
  }

  const delta = absolute - Date.now();
  if (delta <= 0) {
    return 0;
  }

  return delta;
}

function getRetryDelayMs(attempt, retryAfterMs = null) {
  if (Number.isFinite(retryAfterMs) && retryAfterMs >= 0) {
    return Math.min(FETCH_RETRY_MAX_DELAY_MS, Math.round(retryAfterMs));
  }

  const exp = FETCH_RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 240);
  return Math.min(FETCH_RETRY_MAX_DELAY_MS, exp + jitter);
}

function normalizeFetchError(error) {
  if (error && typeof error === "object" && error.name === "AbortError") {
    return new Error("Превышено время ожидания ответа источника");
  }
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function isUpdateCanceledError(error) {
  const message = String(error?.message || error || "");
  return String(error?.name || "").trim() === "AbortError" || /остановлен[ао]\s+пользователем/i.test(message);
}

async function fetchWithRetry(url, options = {}, config = {}) {
  const attempts = Math.max(1, Number(config.attempts) || FETCH_RETRY_ATTEMPTS);
  const timeoutMs = Math.max(1000, Number(config.timeoutMs) || FETCH_TIMEOUT_MS);
  const externalSignal = options?.signal || null;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timer = null;
    let removeExternalAbortListener = null;

    try {
      if (controller) {
        timer = setTimeout(() => controller.abort(), timeoutMs);

        if (externalSignal) {
          if (externalSignal.aborted) {
            controller.abort();
          } else {
            const onExternalAbort = () => {
              controller.abort();
            };
            externalSignal.addEventListener("abort", onExternalAbort, { once: true });
            removeExternalAbortListener = () => {
              externalSignal.removeEventListener("abort", onExternalAbort);
            };
          }
        }
      }

      const response = await fetch(url, {
        ...options,
        signal: controller ? controller.signal : externalSignal,
      });

      if (!response.ok && isRetriableStatus(response.status) && attempt < attempts) {
        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
        await sleep(getRetryDelayMs(attempt, retryAfterMs));
        continue;
      }

      return response;
    } catch (error) {
      if (externalSignal && externalSignal.aborted) {
        throw new Error("Обновление остановлено пользователем");
      }
      lastError = normalizeFetchError(error);
      if (attempt >= attempts) {
        throw lastError;
      }
      await sleep(getRetryDelayMs(attempt));
    } finally {
      if (typeof removeExternalAbortListener === "function") {
        removeExternalAbortListener();
      }
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  throw lastError || new Error("Не удалось выполнить запрос");
}

function httpStatusErrorMessage(status) {
  if (status === 429) {
    return "HTTP 429: WB ограничил частоту запросов";
  }
  if (status === 403 || status === 405) {
    return `HTTP ${status}: доступ к источнику ограничен`;
  }
  if (status >= 500) {
    return `HTTP ${status}: сервер WB временно недоступен`;
  }
  return `HTTP ${status}`;
}

function isLikelyHtmlPayload(text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized.startsWith("<!doctype html") || normalized.startsWith("<html") || normalized.includes("<body");
}

async function fetchJson(url, options = {}, config = {}) {
  const requestOptions = options && typeof options === "object" ? options : {};
  const response = await fetchWithRetry(url, {
    method: "GET",
    mode: "cors",
    cache: "no-store",
    ...requestOptions,
  }, config);

  if (!response.ok) {
    throw new Error(httpStatusErrorMessage(response.status));
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    if (isLikelyHtmlPayload(text) || text.toLowerCase().includes("x-pow")) {
      throw new Error("WB вернул HTML вместо JSON (антибот / x-pow)");
    }
    throw new Error("Ответ источника не похож на JSON");
  }
}

async function fetchJsonMaybe(url, options = {}, config = {}) {
  const requestOptions = options && typeof options === "object" ? options : {};
  const retryConfig = config && typeof config === "object" ? config : {};
  try {
    const response = await fetchWithRetry(
      url,
      {
        method: "GET",
        mode: "cors",
        cache: "no-store",
        ...requestOptions,
      },
      { attempts: 2, ...retryConfig },
    );

    const text = await response.text();

    if (!response.ok) {
      return {
        ok: false,
        message: httpStatusErrorMessage(response.status),
      };
    }

    try {
      const data = JSON.parse(text);
      return {
        ok: true,
        data,
      };
    } catch {
      if (isLikelyHtmlPayload(text) || text.toLowerCase().includes("x-pow")) {
        return {
          ok: false,
          message: "WB вернул HTML вместо JSON (антибот / x-pow)",
        };
      }
      return {
        ok: false,
        message: "Ответ не JSON",
      };
    }
  } catch (error) {
    const normalized = normalizeFetchError(error);
    return {
      ok: false,
      message: normalized.message,
    };
  }
}

async function detectCoverSlideDuplicate(slides, options = {}) {
  const requestSignal = options.requestSignal || null;
  if (requestSignal && requestSignal.aborted) {
    throw new Error("Обновление остановлено пользователем");
  }
  if (!Array.isArray(slides) || slides.length <= 0) {
    return null;
  }
  if (slides.length === 1) {
    return false;
  }

  const firstThumb = toSlideThumbUrl(slides[0]);
  const secondThumb = toSlideThumbUrl(slides[1]);
  if (!firstThumb || !secondThumb) {
    return null;
  }

  const [metaA, metaB] = await Promise.all([
    fetchImageMeta(firstThumb, { requestSignal }),
    fetchImageMeta(secondThumb, { requestSignal }),
  ]);
  if (requestSignal && requestSignal.aborted) {
    throw new Error("Обновление остановлено пользователем");
  }
  if (metaA && metaB) {
    if (metaA.etag && metaB.etag && metaA.etag === metaB.etag) {
      return true;
    }

    if (Number.isFinite(metaA.contentLength) && Number.isFinite(metaB.contentLength)) {
      if (metaA.contentLength !== metaB.contentLength) {
        return false;
      }
    }
  }

  try {
    const [hashA, hashB] = await Promise.all([
      hashRemoteImage(firstThumb, { requestSignal }),
      hashRemoteImage(secondThumb, { requestSignal }),
    ]);
    if (requestSignal && requestSignal.aborted) {
      throw new Error("Обновление остановлено пользователем");
    }
    if (!hashA || !hashB) {
      return null;
    }
    return hashA === hashB;
  } catch (error) {
    if (isUpdateCanceledError(error) || (requestSignal && requestSignal.aborted)) {
      throw new Error("Обновление остановлено пользователем");
    }
    return null;
  }
}

async function fetchImageMeta(url, options = {}) {
  const requestSignal = options.requestSignal || null;
  try {
    const response = await fetchWithRetry(
      url,
      {
        method: "HEAD",
        mode: "cors",
        cache: "no-store",
        signal: requestSignal,
      },
      { attempts: 2, timeoutMs: Math.min(FETCH_TIMEOUT_MS, DUPLICATE_CHECK_TIMEOUT_MS) },
    );
    if (!response.ok) {
      return null;
    }

    const etag = String(response.headers.get("etag") || "").trim();
    const contentLength = Number(response.headers.get("content-length"));
    return {
      etag: etag || "",
      contentLength: Number.isFinite(contentLength) ? contentLength : null,
    };
  } catch (error) {
    if (isUpdateCanceledError(error) || (requestSignal && requestSignal.aborted)) {
      throw new Error("Обновление остановлено пользователем");
    }
    return null;
  }
}

async function hashRemoteImage(url, options = {}) {
  const requestSignal = options.requestSignal || null;
  const response = await fetchWithRetry(
    url,
    {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      signal: requestSignal,
    },
    { attempts: 2, timeoutMs: DUPLICATE_CHECK_TIMEOUT_MS },
  );

  if (!response.ok) {
    throw new Error(httpStatusErrorMessage(response.status));
  }

  const buffer = await response.arrayBuffer();
  return sha256Hex(buffer);
}

async function sha256Hex(buffer) {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || !cryptoApi.subtle) {
    return "";
  }

  const digest = await cryptoApi.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return hex;
}

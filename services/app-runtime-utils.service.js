function ensureBulkProgressState() {
  if (!state.bulkProgress || typeof state.bulkProgress !== "object") {
    state.bulkProgress = {
      active: false,
      actionKey: "all",
      loadingText: "",
      total: 0,
      completed: 0,
      startedAt: 0,
      hideTimer: 0,
      tickTimer: 0,
      singleEstimateMs: 10000,
      lastSingleDurationMs: 0,
      concurrency: 1,
      lastCompletedAt: 0,
      etaAnchorAt: 0,
      etaAnchorMs: NaN,
      etaCheckpointCompleted: 0,
      finalState: "idle",
      cancelRequested: false,
    };
  }

  if (!Number.isFinite(state.bulkProgress.tickTimer)) {
    state.bulkProgress.tickTimer = 0;
  }
  if (!Number.isFinite(state.bulkProgress.singleEstimateMs)) {
    state.bulkProgress.singleEstimateMs = 10000;
  }
  if (!Number.isFinite(state.bulkProgress.lastSingleDurationMs)) {
    state.bulkProgress.lastSingleDurationMs = 0;
  }
  if (!Number.isFinite(state.bulkProgress.concurrency)) {
    state.bulkProgress.concurrency = 1;
  }
  if (!Number.isFinite(state.bulkProgress.lastCompletedAt)) {
    state.bulkProgress.lastCompletedAt = 0;
  }
  if (!Number.isFinite(state.bulkProgress.etaAnchorAt)) {
    state.bulkProgress.etaAnchorAt = 0;
  }
  if (
    !Number.isFinite(state.bulkProgress.etaCheckpointCompleted) ||
    state.bulkProgress.etaCheckpointCompleted < 0
  ) {
    state.bulkProgress.etaCheckpointCompleted = 0;
  }
  if (!Number.isFinite(state.bulkProgress.etaAnchorMs) || state.bulkProgress.etaAnchorMs < 0) {
    state.bulkProgress.etaAnchorMs = NaN;
  }

  return state.bulkProgress;
}

function clearBulkProgressHideTimer(progress = ensureBulkProgressState()) {
  if (progress.hideTimer) {
    clearTimeout(progress.hideTimer);
    progress.hideTimer = 0;
  }
}

function clearBulkProgressTickTimer(progress = ensureBulkProgressState()) {
  if (progress.tickTimer) {
    clearTimeout(progress.tickTimer);
    progress.tickTimer = 0;
  }
}

function normalizeSingleEstimateMs(valueRaw) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value) || value <= 0) {
    return 10000;
  }
  return Math.max(3500, Math.min(45000, Math.round(value)));
}

function normalizeBulkConcurrency(valueRaw) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }
  return Math.max(1, Math.min(8, Math.round(value)));
}

function ensureBulkSingleEstimate(progress = ensureBulkProgressState()) {
  progress.singleEstimateMs = normalizeSingleEstimateMs(progress.singleEstimateMs);
  return progress.singleEstimateMs;
}

function getBulkEstimatedItemMs(progress, elapsedMs, completed) {
  const baseEstimateMs = ensureBulkSingleEstimate(progress);
  if (!(completed > 0) || !(elapsedMs > 280)) {
    return baseEstimateMs;
  }

  const concurrency = normalizeBulkConcurrency(progress.concurrency);
  const inferredMs = (Math.max(1, elapsedMs) * concurrency) / Math.max(1, completed);
  if (!Number.isFinite(inferredMs) || inferredMs <= 0) {
    return baseEstimateMs;
  }

  return normalizeSingleEstimateMs(baseEstimateMs * 0.35 + inferredMs * 0.65);
}

function getBulkEstimatedRemainingMs(progress, elapsedMs, completed, total) {
  if (!(total > 0) || completed >= total) {
    return 0;
  }

  const concurrency = normalizeBulkConcurrency(progress.concurrency);
  const estimateMs = getBulkEstimatedItemMs(progress, elapsedMs, completed);
  const remainingItems = Math.max(0, total - completed);
  const queueMs = (remainingItems * Math.max(1200, estimateMs)) / Math.max(1, concurrency);
  const overheadMs = remainingItems > 0 ? Math.min(5000, remainingItems * 260) : 0;
  return Math.max(900, Math.round(queueMs + overheadMs));
}

function getBulkEtaRemainingMs(progress, nowMs = Date.now()) {
  if (
    !Number.isFinite(progress.etaAnchorMs) ||
    progress.etaAnchorMs < 0 ||
    !Number.isFinite(progress.etaAnchorAt) ||
    progress.etaAnchorAt <= 0
  ) {
    return NaN;
  }

  const elapsedFromAnchor = Math.max(0, nowMs - progress.etaAnchorAt);
  return progress.etaAnchorMs - elapsedFromAnchor;
}

function refreshBulkEtaAnchor(progress, elapsedMs, completed, total, options = {}) {
  const force = options && options.force === true;
  const allowIncrease = options && options.allowIncrease === true;
  if (!(total > 0)) {
    progress.etaAnchorAt = 0;
    progress.etaAnchorMs = NaN;
    progress.etaCheckpointCompleted = Math.max(0, Math.round(Number(completed) || 0));
    return;
  }

  if (completed >= total) {
    progress.etaAnchorAt = Date.now();
    progress.etaAnchorMs = 0;
    progress.etaCheckpointCompleted = total;
    return;
  }

  const normalizedCompleted = Math.max(0, Math.round(Number(completed) || 0));
  const shouldRecalculate =
    force ||
    !Number.isFinite(progress.etaAnchorMs) ||
    progress.etaAnchorMs <= 0 ||
    normalizedCompleted !== progress.etaCheckpointCompleted;

  if (!shouldRecalculate) {
    return;
  }

  const now = Date.now();
  const predictedMs = getBulkEstimatedRemainingMs(progress, elapsedMs, normalizedCompleted, total);
  const prevRemainingMs = getBulkEtaRemainingMs(progress, now);

  let nextMs = predictedMs;
  if (Number.isFinite(prevRemainingMs) && prevRemainingMs > 0) {
    if (nextMs > prevRemainingMs) {
      if (allowIncrease) {
        const increase = nextMs - prevRemainingMs;
        nextMs = prevRemainingMs + Math.min(120000, increase * 0.9);
      } else {
        nextMs = prevRemainingMs;
      }
    } else {
      const decrease = prevRemainingMs - nextMs;
      nextMs = prevRemainingMs - decrease * 0.82;
    }
  }

  if (total > 1 && normalizedCompleted < total) {
    nextMs = Math.max(3500, nextMs);
  }

  progress.etaAnchorAt = now;
  progress.etaAnchorMs = Math.max(1000, Math.round(nextMs));
  progress.etaCheckpointCompleted = normalizedCompleted;
}

function getSingleProgressVisualRatio(progress, elapsedMs, completed, total) {
  if (total !== 1) {
    return total > 0 ? Math.min(1, completed / total) : 0;
  }
  if (completed >= 1) {
    return 1;
  }
  const estimateMs = ensureBulkSingleEstimate(progress);
  const tauMs = Math.max(1200, estimateMs / 3);
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const easedRatio = 1 - Math.exp(-elapsed / tauMs);
  return Math.max(0, Math.min(0.97, easedRatio));
}

function getSingleProgressEtaSeconds(progress, elapsedMs, completed, total) {
  if (total !== 1) {
    return NaN;
  }
  if (completed >= 1) {
    return 0;
  }
  const estimateMs = ensureBulkSingleEstimate(progress);
  const elapsed = Math.max(0, Number(elapsedMs) || 0);
  const projectedTotalMs = Math.max(estimateMs, elapsed + Math.round(estimateMs * 0.22));
  const remainingMs = Math.max(900, projectedTotalMs - elapsed);
  return remainingMs / 1000;
}

function getBulkProgressVisualRatio(progress, elapsedMs, completed, total) {
  if (total <= 0) {
    return 0;
  }
  if (completed >= total) {
    return 1;
  }
  if (total === 1) {
    return getSingleProgressVisualRatio(progress, elapsedMs, completed, total);
  }

  const estimateMs = getBulkEstimatedItemMs(progress, elapsedMs, completed);
  const stepStartAt = Number(progress.lastCompletedAt) > 0 ? progress.lastCompletedAt : progress.startedAt;
  const stepElapsedMs = stepStartAt > 0 ? Math.max(0, Date.now() - stepStartAt) : 0;
  const stepRatio = Math.min(0.96, stepElapsedMs / Math.max(1200, estimateMs));
  const visualCompleted = Math.max(completed, Math.min(total - 0.01, completed + stepRatio));
  return Math.max(0, Math.min(1, visualCompleted / total));
}

function getBulkProgressEtaSeconds(progress, elapsedMs, completed, total) {
  if (total <= 0) {
    return NaN;
  }
  if (completed >= total) {
    return 0;
  }
  if (total === 1) {
    return getSingleProgressEtaSeconds(progress, elapsedMs, completed, total);
  }

  refreshBulkEtaAnchor(progress, elapsedMs, completed, total, { force: false });
  const remainingMs = getBulkEtaRemainingMs(progress);
  if (!Number.isFinite(remainingMs)) {
    return NaN;
  }

  if (remainingMs <= 1200) {
    return 1;
  }

  return remainingMs / 1000;
}

function ensureBulkProgressTickTimer(progress = ensureBulkProgressState()) {
  const shouldTick = progress.active === true && Number(progress.total) > 0 && progress.finalState === "idle";
  if (!shouldTick) {
    clearBulkProgressTickTimer(progress);
    return;
  }
  if (progress.tickTimer) {
    return;
  }

  progress.tickTimer = setTimeout(() => {
    const current = ensureBulkProgressState();
    current.tickTimer = 0;
    if (!(current.active === true && Number(current.total) > 0 && current.finalState === "idle")) {
      return;
    }
    renderBulkProgressToast();
    ensureBulkProgressTickTimer(current);
  }, 120);
}

function formatBulkEta(totalSecondsRaw) {
  const totalSeconds = Number(totalSecondsRaw);
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "меньше 1с";
  }

  const rounded = Math.max(1, Math.round(totalSeconds));
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  if (minutes <= 0) {
    return `${seconds}с`;
  }
  if (minutes < 60) {
    return `${minutes}м ${seconds}с`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return `${hours}ч ${restMinutes}м`;
}

function renderBulkProgressToast() {
  const progress = ensureBulkProgressState();
  if (!el.bulkProgressToast) {
    return;
  }

  const total = Math.max(0, Math.round(Number(progress.total) || 0));
  const completedRaw = Math.max(0, Math.round(Number(progress.completed) || 0));
  const completed = total > 0 ? Math.min(total, completedRaw) : completedRaw;
  const elapsedMs = progress.startedAt > 0 ? Math.max(0, Date.now() - progress.startedAt) : 0;
  const ratio =
    progress.active === true
      ? getBulkProgressVisualRatio(progress, elapsedMs, completed, total)
      : total > 0
        ? Math.min(1, completed / total)
        : 0;
  const ringPercent = Math.max(0, Math.min(100, ratio * 100));
  const percent = Math.round(ringPercent);

  if (el.bulkProgressRing) {
    el.bulkProgressRing.style.setProperty("--bulk-progress", `${ringPercent.toFixed(2)}%`);
  }
  if (el.bulkProgressPercent) {
    el.bulkProgressPercent.textContent = `${percent}%`;
  }
  if (el.bulkProgressTitle) {
    el.bulkProgressTitle.textContent = progress.loadingText || "Обновляю карточки…";
  }

  if (el.bulkProgressMeta) {
    const countText = total > 0 ? `${completed}/${total}` : `${completed}`;
    if (progress.finalState === "done") {
      el.bulkProgressMeta.textContent = `${countText} · завершено`;
    } else if (progress.finalState === "canceled") {
      el.bulkProgressMeta.textContent = `${countText} · остановлено`;
    } else if (progress.cancelRequested) {
      el.bulkProgressMeta.textContent = `${countText} · останавливаю…`;
    } else if (progress.active === true && total > 0 && progress.startedAt > 0) {
      const etaSeconds = getBulkProgressEtaSeconds(progress, elapsedMs, completed, total);
      if (Number.isFinite(etaSeconds) && etaSeconds >= 0) {
        if (total > 1 && completed > 0 && completed < total && etaSeconds <= 5) {
          el.bulkProgressMeta.textContent = `${countText} · почти готово`;
        } else {
          const etaPrefix = total > 1 && completed === 0 ? "оценка ~" : "осталось ~";
          el.bulkProgressMeta.textContent = `${countText} · ${etaPrefix}${formatBulkEta(etaSeconds)}`;
        }
      } else {
        el.bulkProgressMeta.textContent = `${countText} · расчёт времени…`;
      }
    } else {
      el.bulkProgressMeta.textContent = `${countText} · расчёт времени…`;
    }
  }

  if (el.bulkCancelBtn) {
    el.bulkCancelBtn.hidden = progress.active !== true;
    el.bulkCancelBtn.disabled = progress.cancelRequested === true;
    el.bulkCancelBtn.textContent = progress.cancelRequested ? "Останавливаю…" : "Прервать";
  }

  const shouldShow = progress.active || progress.finalState === "done" || progress.finalState === "canceled";
  if (shouldShow) {
    ensureBulkProgressTickTimer(progress);
    el.bulkProgressToast.hidden = false;
    requestAnimationFrame(() => {
      if (el.bulkProgressToast) {
        el.bulkProgressToast.classList.add("is-visible");
      }
    });
    return;
  }

  el.bulkProgressToast.classList.remove("is-visible");
  clearBulkProgressTickTimer(progress);
  setTimeout(() => {
    const current = ensureBulkProgressState();
    if (!current.active && current.finalState === "idle" && el.bulkProgressToast) {
      el.bulkProgressToast.hidden = true;
    }
  }, 260);
}

function isBulkLoadingCancelRequested() {
  return state.bulkCancelRequested === true;
}

function requestBulkLoadingCancel() {
  if (!state.isBulkLoading) {
    return;
  }
  state.bulkCancelRequested = true;
  if (state.singleRowAbortController && typeof state.singleRowAbortController.abort === "function") {
    try {
      state.singleRowAbortController.abort();
    } catch {
      // noop
    }
  }
  const progress = ensureBulkProgressState();
  progress.cancelRequested = true;
  ensureBulkProgressTickTimer(progress);
  renderBulkProgressToast();
}

function setBulkLoading(isLoading, loadingText = "Обновляю карточки...", actionKey = "all", progressMeta = null) {
  state.isBulkLoading = isLoading;
  const labels =
    typeof BULK_ACTION_LABELS === "object" && BULK_ACTION_LABELS
      ? BULK_ACTION_LABELS
      : {
          all: "Обновить карточки",
          problem: "Обновить проблемные",
        };

  const progress = ensureBulkProgressState();
  const meta = progressMeta && typeof progressMeta === "object" ? progressMeta : {};

  if (el.loadAllBtn) {
    el.loadAllBtn.textContent = state.isBulkLoading && actionKey === "all" ? loadingText : labels.all;
  }
  if (!state.isBulkLoading && el.loadProblemBtn) {
    const hasProblems = getProblemRowIds().length;
    el.loadProblemBtn.textContent = hasProblems > 0 ? `${labels.problem} (${hasProblems})` : labels.problem;
  }

  if (isLoading) {
    clearBulkProgressHideTimer(progress);
    const shouldReset = meta.reset === true || progress.active !== true || progress.actionKey !== actionKey;
    const prevCompleted = Math.max(0, Math.round(Number(progress.completed) || 0));
    const prevTotal = Math.max(0, Math.round(Number(progress.total) || 0));
    if (shouldReset) {
      clearBulkProgressTickTimer(progress);
      progress.startedAt = Date.now();
      progress.completed = 0;
      progress.total = 0;
      progress.cancelRequested = false;
      progress.finalState = "idle";
      state.bulkCancelRequested = false;
      progress.concurrency = normalizeBulkConcurrency(meta.concurrency);
      progress.lastCompletedAt = progress.startedAt;
      progress.etaAnchorAt = progress.startedAt;
      progress.etaAnchorMs = NaN;
      progress.etaCheckpointCompleted = 0;
    }

    progress.active = true;
    progress.actionKey = String(actionKey || "all");
    progress.loadingText = String(loadingText || labels[actionKey] || labels.all || "Обновляю карточки…");

    if (Number.isFinite(meta.startedAt)) {
      progress.startedAt = Math.max(0, Math.round(meta.startedAt));
    }
    if (Number.isFinite(meta.total)) {
      progress.total = Math.max(0, Math.round(meta.total));
    }
    if (Number.isFinite(meta.concurrency)) {
      progress.concurrency = normalizeBulkConcurrency(meta.concurrency);
    }
    if (Number.isFinite(meta.completed)) {
      const nextCompleted = Math.max(0, Math.round(meta.completed));
      if (nextCompleted > prevCompleted) {
        progress.lastCompletedAt = Date.now();
      }
      progress.completed = nextCompleted;
    }
    if (typeof meta.cancelRequested === "boolean") {
      progress.cancelRequested = meta.cancelRequested;
    } else {
      progress.cancelRequested = state.bulkCancelRequested === true;
    }
    progress.finalState = "idle";
    progress.singleEstimateMs = ensureBulkSingleEstimate(progress);
    const elapsedMs = progress.startedAt > 0 ? Math.max(0, Date.now() - progress.startedAt) : 0;
    const totalChanged = progress.total !== prevTotal;
    const shouldRefreshEta = shouldReset || progress.completed !== prevCompleted || totalChanged;
    refreshBulkEtaAnchor(progress, elapsedMs, progress.completed, progress.total, {
      force: shouldRefreshEta,
      allowIncrease: progress.total > prevTotal,
    });
    if (progress.total > 0) {
      ensureBulkProgressTickTimer(progress);
    } else {
      clearBulkProgressTickTimer(progress);
    }
    renderBulkProgressToast();
  } else {
    clearBulkProgressTickTimer(progress);
    progress.active = false;
    progress.actionKey = String(actionKey || progress.actionKey || "all");
    progress.loadingText = String(loadingText || labels[actionKey] || labels.all || "Обновление завершено");
    if (Number.isFinite(meta.total)) {
      progress.total = Math.max(0, Math.round(meta.total));
    }
    if (Number.isFinite(meta.concurrency)) {
      progress.concurrency = normalizeBulkConcurrency(meta.concurrency);
    }
    if (Number.isFinite(meta.completed)) {
      progress.completed = Math.max(0, Math.round(meta.completed));
    }
    const canceled = meta.canceled === true || state.bulkCancelRequested === true;
    if (!canceled && progress.total === 1 && progress.startedAt > 0) {
      const elapsedMs = Math.max(0, Date.now() - progress.startedAt);
      if (elapsedMs > 400) {
        progress.lastSingleDurationMs = Math.round(elapsedMs);
        const currentEstimate = ensureBulkSingleEstimate(progress);
        progress.singleEstimateMs = normalizeSingleEstimateMs(currentEstimate * 0.7 + elapsedMs * 0.3);
      }
    } else if (!canceled && progress.total > 1 && progress.startedAt > 0 && progress.completed > 0) {
      const elapsedMs = Math.max(0, Date.now() - progress.startedAt);
      if (elapsedMs > 800) {
        const concurrency = normalizeBulkConcurrency(progress.concurrency);
        const inferredMs = (elapsedMs * concurrency) / Math.max(1, progress.completed);
        if (Number.isFinite(inferredMs) && inferredMs > 450) {
          const currentEstimate = ensureBulkSingleEstimate(progress);
          progress.singleEstimateMs = normalizeSingleEstimateMs(currentEstimate * 0.8 + inferredMs * 0.2);
        }
      }
    }
    progress.cancelRequested = false;
    progress.finalState = canceled ? "canceled" : "done";
    progress.etaAnchorAt = 0;
    progress.etaAnchorMs = NaN;
    progress.etaCheckpointCompleted = Math.max(0, Math.round(progress.completed || 0));
    state.bulkCancelRequested = false;
    if (state.singleRowAbortController && typeof state.singleRowAbortController.abort === "function") {
      state.singleRowAbortController = null;
    }
    renderBulkProgressToast();

    clearBulkProgressHideTimer(progress);
    progress.hideTimer = setTimeout(() => {
      const current = ensureBulkProgressState();
      current.finalState = "idle";
      current.cancelRequested = false;
      renderBulkProgressToast();
    }, BULK_TOAST_HIDE_DELAY_MS);
  }

  syncButtonState();
}

function syncButtonState() {
  const disabled = state.isBulkLoading;
  el.loadAllBtn.disabled = disabled;
  if (el.loadProblemBtn) {
    const hasProblems = getProblemRowIds().length > 0;
    el.loadProblemBtn.disabled = disabled || !hasProblems;
  }
  if (el.addSingleBtn) {
    el.addSingleBtn.disabled = disabled;
  }
  el.addBulkBtn.disabled = disabled;
  el.clearBtn.disabled = disabled;
  if (el.rowsLimitSelect) {
    el.rowsLimitSelect.disabled = disabled;
  }
  if (el.autoplayLimitInput) {
    el.autoplayLimitInput.disabled = disabled;
  }
  for (const input of document.querySelectorAll(
    "[data-autoplay-global-limit], [data-cabinet-limit], [data-tags-global-limit], [data-tags-cabinet-limit]",
  )) {
    input.disabled = disabled;
  }
  renderRowsPagination();
  if (el.pagePrevBtn) {
    el.pagePrevBtn.disabled =
      disabled || (Number(state.pagination.filtered) || 0) === 0 || state.rowsPage <= 1;
  }
  if (el.pageNextBtn) {
    el.pageNextBtn.disabled =
      disabled ||
      (Number(state.pagination.filtered) || 0) === 0 ||
      state.rowsPage >= Math.max(1, Number(state.pagination.totalPages) || 1);
  }
  if (el.resetAllFiltersBtn) {
    el.resetAllFiltersBtn.disabled = disabled;
  }
  if (typeof updatePreviewRefreshButtonState === "function") {
    updatePreviewRefreshButtonState();
  }
  if (typeof updateRichRefreshButtonState === "function") {
    updateRichRefreshButtonState();
  }
  if (typeof updateRecommendationsRefreshButtonState === "function") {
    updateRecommendationsRefreshButtonState();
  }
}

async function runWithConcurrency(items, limit, worker, options = {}) {
  let pointer = 0;
  const shouldStop =
    typeof options === "function" ? options : options && typeof options.shouldStop === "function" ? options.shouldStop : null;

  async function runner() {
    while (pointer < items.length) {
      if (shouldStop && shouldStop()) {
        break;
      }
      const current = items[pointer];
      pointer += 1;
      if (shouldStop && shouldStop()) {
        break;
      }
      await worker(current);
    }
  }

  const workers = [];
  const count = Math.min(limit, items.length);
  for (let index = 0; index < count; index += 1) {
    workers.push(runner());
  }

  await Promise.all(workers);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function buildStatePayload(savedAtRaw = null, overrides = {}) {
  const overridesObject = overrides && typeof overrides === "object" ? overrides : {};
  const sourceRows = Array.isArray(overridesObject.rows) ? overridesObject.rows : state.rows;
  const sourceUpdateSnapshots = Array.isArray(overridesObject.updateSnapshots)
    ? overridesObject.updateSnapshots
    : state.updateSnapshots;
  const sourceBasketByVol =
    overridesObject.basketByVol && typeof overridesObject.basketByVol === "object"
      ? overridesObject.basketByVol
      : state.basketByVol;
  const sourceLastSyncAt =
    overridesObject.lastSyncAt === null || overridesObject.lastSyncAt === undefined
      ? state.lastSyncAt
      : overridesObject.lastSyncAt;

  const savedAtDate = savedAtRaw ? new Date(savedAtRaw) : new Date();
  const savedAt = Number.isNaN(savedAtDate.getTime()) ? new Date().toISOString() : savedAtDate.toISOString();
  return {
    savedAt,
    rows: sourceRows.map((row) => ({
      id: row.id,
      nmId: row.nmId,
      cabinet: row.cabinet,
      supplierId: row.supplierId,
      stockValue: row.stockValue,
      inStock: row.inStock,
      stockSource: row.stockSource,
      currentPrice: row.currentPrice,
      basePrice: row.basePrice,
      priceSource: row.priceSource,
      error: row.error,
      data: row.data,
      updatedAt: row.updatedAt,
      updateLogs: normalizeRowUpdateLogs(row.updateLogs),
    })),
    basketByVol: sourceBasketByVol,
    lastSyncAt: sourceLastSyncAt,
    filters: state.filters,
    controlsCollapsed: state.controlsCollapsed,
    rowsLimit: state.rowsLimit,
    autoplayLimitPerCabinet: state.autoplayLimitPerCabinet,
    autoplayLimitByCabinet: state.autoplayLimitByCabinet,
    tagsLimitPerCabinet: state.tagsLimitPerCabinet,
    tagsLimitByCabinet: state.tagsLimitByCabinet,
    onlyErrors: state.onlyErrors,
    notLoadedOnly: state.notLoadedOnly,
    checksFiltersOpen: state.checksFiltersOpen,
    globalFiltersCollapsed: state.globalFiltersCollapsed,
    globalCategoriesOpen: state.globalCategoriesOpen,
    categorySearchQuery: state.categorySearchQuery,
    globalColumnsOpen: state.globalColumnsOpen,
    filterCountMode: state.filterCountMode,
    rowHistoryHideNoChanges: state.rowHistoryHideNoChanges,
    autoplayProblemOnly: state.autoplayProblemOnly,
    tagsProblemOnly: state.tagsProblemOnly,
    sellerSettings: state.sellerSettings,
    colorVariantsCache: state.colorVariantsCache,
    updateSnapshots: normalizeProblemSnapshots(sourceUpdateSnapshots),
    chartCabinetFilter: state.chartCabinetFilter,
  };
}

function persistStateLocalPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function readLocalStatePayload() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function getShadowPendingStorageKey() {
  return `${STORAGE_KEY}:shadow-pending-v1`;
}

function persistShadowPendingPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return;
  }
  try {
    localStorage.setItem(getShadowPendingStorageKey(), JSON.stringify(payload));
  } catch {
    // noop
  }
}

function readShadowPendingPayload() {
  let raw = "";
  try {
    raw = String(localStorage.getItem(getShadowPendingStorageKey()) || "");
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function clearShadowPendingPayload() {
  try {
    localStorage.removeItem(getShadowPendingStorageKey());
  } catch {
    // noop
  }
}

function getStatePayloadSavedAtMs(payload) {
  if (!payload || typeof payload !== "object") {
    return 0;
  }
  const savedAtRaw = String(payload.savedAt || payload.lastSyncAt || "").trim();
  if (!savedAtRaw) {
    return 0;
  }
  const savedAtMs = new Date(savedAtRaw).getTime();
  return Number.isFinite(savedAtMs) ? savedAtMs : 0;
}

function pickStatePayload(...payloadsRaw) {
  const payloads = payloadsRaw.filter((payload) => payload && typeof payload === "object");
  if (payloads.length <= 0) {
    return null;
  }

  let best = payloads[0];
  let bestMs = getStatePayloadSavedAtMs(best);
  for (let index = 1; index < payloads.length; index += 1) {
    const candidate = payloads[index];
    const candidateMs = getStatePayloadSavedAtMs(candidate);
    if (candidateMs > bestMs) {
      best = candidate;
      bestMs = candidateMs;
    }
  }

  return best;
}

function applyParsedState(parsed) {
  const rows = Array.isArray(parsed.rows) ? parsed.rows : [];

  state.rows = rows.map((row) => ({
    id: row.id || `row-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    nmId: String(row.nmId || "").trim(),
    cabinet: String(row.cabinet || "").trim(),
    supplierId: normalizeSupplierId(row.supplierId),
    stockValue: Number.isFinite(row.stockValue) ? row.stockValue : null,
    inStock: typeof row.inStock === "boolean" ? row.inStock : null,
    stockSource: String(row.stockSource || ""),
    currentPrice: Number.isFinite(row.currentPrice)
      ? row.currentPrice
      : Number.isFinite(row?.data?.currentPrice)
        ? row.data.currentPrice
        : null,
    basePrice: Number.isFinite(row.basePrice)
      ? row.basePrice
      : Number.isFinite(row?.data?.basePrice)
        ? row.data.basePrice
        : null,
    priceSource: String(row.priceSource || ""),
    loading: false,
    queuedForRefresh: false,
    error: row.error ? String(row.error) : "",
    data: normalizeRowData(row.data),
    updatedAt: row.updatedAt || null,
    updateLogs: normalizeRowUpdateLogs(row.updateLogs),
  }));

  state.basketByVol = parsed.basketByVol && typeof parsed.basketByVol === "object" ? parsed.basketByVol : {};
  state.lastSyncAt = parsed.lastSyncAt || null;
  state.controlsCollapsed = Boolean(parsed.controlsCollapsed);
  state.rowsLimit = normalizeRowsLimit(parsed.rowsLimit);
  state.autoplayLimitPerCabinet = normalizeAutoplayLimit(parsed.autoplayLimitPerCabinet);
  state.autoplayLimitByCabinet = normalizeAutoplayLimitMap(parsed.autoplayLimitByCabinet);
  state.tagsLimitPerCabinet = normalizeTagsLimit(parsed.tagsLimitPerCabinet);
  state.tagsLimitByCabinet = normalizeTagsLimitMap(parsed.tagsLimitByCabinet);
  state.onlyErrors = Boolean(parsed.onlyErrors);
  state.notLoadedOnly = Boolean(parsed.notLoadedOnly);
  state.checksFiltersOpen = Boolean(parsed.checksFiltersOpen);
  state.globalFiltersCollapsed = Boolean(parsed.globalFiltersCollapsed);
  state.globalCategoriesOpen = Boolean(parsed.globalCategoriesOpen);
  state.categorySearchQuery = String(parsed.categorySearchQuery || "").slice(0, 120);
  state.globalColumnsOpen = Boolean(parsed.globalColumnsOpen);
  state.filterCountMode =
    typeof normalizeFilterCountMode === "function"
      ? normalizeFilterCountMode(parsed.filterCountMode)
      : String(parsed.filterCountMode || "problems") === "rows"
        ? "rows"
        : "problems";
  state.rowHistoryHideNoChanges = Boolean(parsed.rowHistoryHideNoChanges);
  state.autoplayProblemOnly = Boolean(parsed.autoplayProblemOnly);
  state.tagsProblemOnly = Boolean(parsed.tagsProblemOnly);
  state.sellerSettings = normalizeSellerSettings(parsed.sellerSettings);
  state.colorVariantsCache = normalizeColorVariantCache(parsed.colorVariantsCache);
  state.updateSnapshots = normalizeProblemSnapshots(parsed.updateSnapshots);
  state.chartCabinetFilter =
    typeof normalizeProblemsChartCabinetFilter === "function"
      ? normalizeProblemsChartCabinetFilter(parsed.chartCabinetFilter, state.updateSnapshots)
      : normalizeDashboardCabinet(parsed.chartCabinetFilter, state.rows);
  state.rowsPage = 1;

  state.filters = {
    ...FILTER_DEFAULTS,
    ...(parsed.filters && typeof parsed.filters === "object" ? parsed.filters : {}),
  };
  if (state.filters.recommendations === "na") {
    state.filters.recommendations = "no";
  }
  if (state.filters.autoplay === "na") {
    state.filters.autoplay = "no";
  }
  if (state.filters.video === "na") {
    state.filters.video = "no";
  }
  if (state.filters.tags === "na") {
    state.filters.tags = "no";
  }
  state.filters.cabinet = normalizeDashboardCabinet(state.filters.cabinet, state.rows);
  state.filters.categoryGroup = normalizeCategoryGroupValue(state.filters.categoryGroup, state.rows);
}

function resetStateToDefaults() {
  state.rows = [];
  state.basketByVol = {};
  state.lastSyncAt = null;
  state.controlsCollapsed = false;
  state.rowsLimit = ROWS_LIMIT_DEFAULT;
  state.autoplayLimitPerCabinet = AUTOPLAY_LIMIT_DEFAULT;
  state.autoplayLimitByCabinet = {};
  state.tagsLimitPerCabinet = TAGS_LIMIT_DEFAULT;
  state.tagsLimitByCabinet = {};
  state.onlyErrors = false;
  state.notLoadedOnly = false;
  state.checksFiltersOpen = false;
  state.globalFiltersCollapsed = false;
  state.globalCategoriesOpen = false;
  state.categorySearchQuery = "";
  state.globalColumnsOpen = false;
  state.filterCountMode = "problems";
  state.autoplayProblemOnly = false;
  state.tagsProblemOnly = false;
  state.rowHistoryHideNoChanges = false;
  state.sellerSettings = createDefaultSellerSettings();
  state.colorVariantsCache = {};
  state.updateSnapshots = [];
  state.chartCabinetFilter = "all";
  state.rowsPage = 1;
  state.filters = { ...FILTER_DEFAULTS };
}

function persistState() {
  const payload = buildStatePayload();
  persistStateLocalPayload(payload);
  if (typeof queueCloudStateSync === "function") {
    queueCloudStateSync(payload);
  }
}

async function restoreState() {
  const localPayload = readLocalStatePayload();
  let remotePayload = null;
  const shadowPendingPayload = readShadowPendingPayload();

  if (typeof loadCloudStatePayload === "function") {
    try {
      remotePayload = await loadCloudStatePayload();
    } catch {
      remotePayload = null;
    }
  }

  const payload = pickStatePayload(localPayload, remotePayload, shadowPendingPayload);
  if (!payload) {
    return;
  }

  try {
    applyParsedState(payload);
  } catch {
    resetStateToDefaults();
    return;
  }

  if (payload === shadowPendingPayload) {
    clearShadowPendingPayload();
    persistStateLocalPayload(payload);
    if (typeof queueCloudStateSync === "function") {
      queueCloudStateSync(payload);
    }
  } else if (payload === remotePayload) {
    persistStateLocalPayload(payload);
  } else if (payload === localPayload && typeof queueCloudStateSync === "function") {
    const localMs = getStatePayloadSavedAtMs(localPayload);
    const remoteMs = getStatePayloadSavedAtMs(remotePayload);
    if (!remotePayload || localMs >= remoteMs) {
      queueCloudStateSync(localPayload);
    }
  }
}

function normalizeProblemSnapshots(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  const normalized = raw
    .map((entry) => normalizeProblemSnapshotEntry(entry))
    .filter(Boolean)
    .slice(-PROBLEM_SNAPSHOT_LIMIT);

  return normalized.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

function normalizeProblemSnapshotEntry(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const atRaw = String(raw.at || "").trim();
  const atDate = atRaw ? new Date(atRaw) : null;
  const at = atDate && !Number.isNaN(atDate.getTime()) ? atDate.toISOString() : new Date().toISOString();
  const source = String(raw.source || "").trim().toLowerCase() === "system" ? "system" : "manual";
  const actionKey = String(raw.actionKey || "").trim() || "all";
  const modeRaw = String(raw.mode || "").trim();
  const mode = modeRaw || "full";

  const problemsRaw = raw.problems && typeof raw.problems === "object" ? raw.problems : {};
  const problems = {
    recommendationsNo: Number(problemsRaw.recommendationsNo) || 0,
    richNo: Number(problemsRaw.richNo) || 0,
    videoNo: Number(problemsRaw.videoNo) || 0,
    autoplayNo: Number(problemsRaw.autoplayNo) || 0,
    autoplayOver: Number(problemsRaw.autoplayOver) || 0,
    tagsNo: Number(problemsRaw.tagsNo) || 0,
    tagsOver: Number(problemsRaw.tagsOver) || 0,
    coverDuplicate: Number(problemsRaw.coverDuplicate) || 0,
    total: Number(problemsRaw.total) || 0,
  };

  const cabinetsRaw = Array.isArray(raw.cabinets) ? raw.cabinets : [];
  const cabinets = cabinetsRaw
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const cabinet = String(item.cabinet || "").trim();
      if (!cabinet) {
        return null;
      }
      const itemProblemsRaw = item.problems && typeof item.problems === "object" ? item.problems : {};
      return {
        cabinet,
        totalRows: Number(item.totalRows) || 0,
        loadedRows: Number(item.loadedRows) || 0,
        errorRows: Number(item.errorRows) || 0,
        problems: {
          recommendationsNo: Number(itemProblemsRaw.recommendationsNo) || 0,
          richNo: Number(itemProblemsRaw.richNo) || 0,
          videoNo: Number(itemProblemsRaw.videoNo) || 0,
          autoplayNo: Number(itemProblemsRaw.autoplayNo) || 0,
          autoplayOver: Number(itemProblemsRaw.autoplayOver) || 0,
          tagsNo: Number(itemProblemsRaw.tagsNo) || 0,
          tagsOver: Number(itemProblemsRaw.tagsOver) || 0,
          coverDuplicate: Number(itemProblemsRaw.coverDuplicate) || 0,
          total: Number(itemProblemsRaw.total) || 0,
        },
      };
    })
    .filter(Boolean);

  return {
    id:
      String(raw.id || "").trim() ||
      `snap-${Math.floor(new Date(at).getTime())}-${Math.random().toString(16).slice(2, 8)}`,
    at,
    source,
    actionKey,
    mode,
    totalRows: Number(raw.totalRows) || 0,
    loadedRows: Number(raw.loadedRows) || 0,
    errorRows: Number(raw.errorRows) || 0,
    problems,
    cabinets,
  };
}

function toSlideThumbUrl(urlRaw) {
  const url = String(urlRaw || "").trim();
  if (!url) {
    return "";
  }
  return url
    .replace("/images/big/", "/images/c246x328/")
    .replace("/images/large/", "/images/c246x328/")
    .replace("/images/c516x688/", "/images/c246x328/");
}

function toSlidePreviewUrl(urlRaw) {
  const url = String(urlRaw || "").trim();
  if (!url) {
    return "";
  }
  return url
    .replace("/images/c246x328/", "/images/big/")
    .replace("/images/c516x688/", "/images/big/")
    .replace("/images/tm/", "/images/big/");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}

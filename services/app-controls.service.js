/*
 * Stage 2 split from app.js:
 * фильтры, лимиты, кабинеты и bulk-обработчики.
 */

const SHADOW_UPDATE_MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const SHADOW_UPDATE_SLOTS_MSK = [0, 12];
const SHADOW_UPDATE_LOCK_TTL_MS = 45 * 60 * 1000;
const SHADOW_UPDATE_RECHECK_DELAY_MS = 90 * 1000;
const SHADOW_UPDATE_INIT_DELAY_MS = 1800;
const SHADOW_UPDATE_LOCK_KEY_SUFFIX = "shadow-update-lock-v1";
const SHADOW_UPDATE_LAST_SLOT_KEY_SUFFIX = "shadow-update-last-slot-msk-v1";

const shadowUpdateScheduler = {
  started: false,
  inFlight: false,
  timer: 0,
  runningSlotKey: "",
  lockToken: "",
  tabId: `tab-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
};

function pad2(value) {
  return String(Math.max(0, Number(value) || 0)).padStart(2, "0");
}

function getShadowUpdateStoragePrefix() {
  const key = typeof STORAGE_KEY === "string" ? STORAGE_KEY.trim() : "";
  return key || "wb-dashboard-v2";
}

function getShadowUpdateLockKey() {
  return `${getShadowUpdateStoragePrefix()}:${SHADOW_UPDATE_LOCK_KEY_SUFFIX}`;
}

function getShadowUpdateLastSlotKey() {
  return `${getShadowUpdateStoragePrefix()}:${SHADOW_UPDATE_LAST_SLOT_KEY_SUFFIX}`;
}

function isValidShadowSlotKey(valueRaw) {
  return /^\d{4}-\d{2}-\d{2}T(?:00|12):00\+03$/.test(String(valueRaw || "").trim());
}

function getMskDateParts(nowMs = Date.now()) {
  const mskDate = new Date(Number(nowMs) + SHADOW_UPDATE_MSK_OFFSET_MS);
  return {
    year: mskDate.getUTCFullYear(),
    monthIndex: mskDate.getUTCMonth(),
    month: mskDate.getUTCMonth() + 1,
    day: mskDate.getUTCDate(),
    hour: mskDate.getUTCHours(),
  };
}

function buildMskSlotKey(year, month, day, hour) {
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:00+03`;
}

function toUtcMsFromMsk(year, monthIndex, day, hour) {
  return Date.UTC(year, monthIndex, day, hour, 0, 0, 0) - SHADOW_UPDATE_MSK_OFFSET_MS;
}

function getCurrentMskSlotInfo(nowMs = Date.now()) {
  const parts = getMskDateParts(nowMs);
  const slotHour = parts.hour >= 12 ? 12 : 0;
  return {
    slotKey: buildMskSlotKey(parts.year, parts.month, parts.day, slotHour),
    slotHour,
    slotStartMs: toUtcMsFromMsk(parts.year, parts.monthIndex, parts.day, slotHour),
  };
}

function getNextMskSlotStartMs(nowMs = Date.now()) {
  const parts = getMskDateParts(nowMs);
  const candidates = [
    ...SHADOW_UPDATE_SLOTS_MSK.map((hour) => toUtcMsFromMsk(parts.year, parts.monthIndex, parts.day, hour)),
    ...SHADOW_UPDATE_SLOTS_MSK.map((hour) => toUtcMsFromMsk(parts.year, parts.monthIndex, parts.day + 1, hour)),
  ];
  const minFutureMs = Number(nowMs) + 1000;
  for (const candidate of candidates) {
    if (candidate > minFutureMs) {
      return candidate;
    }
  }
  return Number(nowMs) + 6 * 60 * 60 * 1000;
}

function readShadowLastSlotKey() {
  try {
    const raw = String(localStorage.getItem(getShadowUpdateLastSlotKey()) || "").trim();
    return isValidShadowSlotKey(raw) ? raw : "";
  } catch {
    return "";
  }
}

function writeShadowLastSlotKey(slotKeyRaw) {
  const slotKey = String(slotKeyRaw || "").trim();
  if (!isValidShadowSlotKey(slotKey)) {
    return;
  }
  try {
    localStorage.setItem(getShadowUpdateLastSlotKey(), slotKey);
  } catch {
    // noop
  }
}

function readShadowLockState() {
  try {
    const raw = localStorage.getItem(getShadowUpdateLockKey());
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    const slotKey = String(parsed.slotKey || "").trim();
    const tabId = String(parsed.tabId || "").trim();
    const token = String(parsed.token || "").trim();
    const expiresAt = Number(parsed.expiresAt);
    if (!slotKey || !token || !tabId || !Number.isFinite(expiresAt)) {
      return null;
    }
    return { slotKey, tabId, token, expiresAt };
  } catch {
    return null;
  }
}

function acquireShadowUpdateLock(slotKeyRaw) {
  const slotKey = String(slotKeyRaw || "").trim();
  if (!isValidShadowSlotKey(slotKey)) {
    return "";
  }

  const now = Date.now();
  const current = readShadowLockState();
  if (
    current &&
    current.slotKey === slotKey &&
    current.expiresAt > now &&
    current.tabId &&
    current.tabId !== shadowUpdateScheduler.tabId
  ) {
    return "";
  }

  const token = `${shadowUpdateScheduler.tabId}-${now}-${Math.random().toString(16).slice(2, 8)}`;
  const lockPayload = {
    slotKey,
    tabId: shadowUpdateScheduler.tabId,
    token,
    expiresAt: now + SHADOW_UPDATE_LOCK_TTL_MS,
  };

  try {
    localStorage.setItem(getShadowUpdateLockKey(), JSON.stringify(lockPayload));
    const check = readShadowLockState();
    if (check && check.token === token && check.tabId === shadowUpdateScheduler.tabId) {
      return token;
    }
  } catch {
    return "";
  }

  return "";
}

function releaseShadowUpdateLock(tokenRaw) {
  const token = String(tokenRaw || "").trim();
  if (!token) {
    return;
  }

  try {
    const current = readShadowLockState();
    if (current && current.token === token) {
      localStorage.removeItem(getShadowUpdateLockKey());
    }
  } catch {
    // noop
  }
}

function clearShadowUpdateTimer() {
  if (!shadowUpdateScheduler.timer) {
    return;
  }
  clearTimeout(shadowUpdateScheduler.timer);
  shadowUpdateScheduler.timer = 0;
}

function scheduleShadowUpdateCheck(options = {}) {
  if (!shadowUpdateScheduler.started) {
    return;
  }
  clearShadowUpdateTimer();

  const customDelayMs = Number(options.delayMs);
  const delayMs = Number.isFinite(customDelayMs)
    ? Math.max(1000, Math.round(customDelayMs))
    : Math.max(1000, getNextMskSlotStartMs(Date.now()) - Date.now() + 1500);

  shadowUpdateScheduler.timer = setTimeout(() => {
    shadowUpdateScheduler.timer = 0;
    maybeRunShadowScheduledUpdate("timer").catch(() => {
      scheduleShadowUpdateCheck({ delayMs: SHADOW_UPDATE_RECHECK_DELAY_MS });
    });
  }, delayMs);
}

function getShadowRowIds() {
  return Array.isArray(state.rows) ? state.rows.map((row) => row?.id).filter(Boolean) : [];
}

function deepCloneJson(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function cloneRowsForShadowUpdate(rowsRaw) {
  const rows = Array.isArray(rowsRaw) ? rowsRaw : [];
  return rows.map((row) => ({
    id: String(row?.id || ""),
    nmId: String(row?.nmId || "").trim(),
    cabinet: String(row?.cabinet || "").trim(),
    supplierId: normalizeSupplierId(row?.supplierId),
    stockValue: Number.isFinite(row?.stockValue) ? Math.max(0, Math.round(row.stockValue)) : null,
    inStock: typeof row?.inStock === "boolean" ? row.inStock : null,
    stockSource: String(row?.stockSource || ""),
    currentPrice: Number.isFinite(row?.currentPrice) ? Math.max(0, Math.round(row.currentPrice)) : null,
    basePrice: Number.isFinite(row?.basePrice) ? Math.max(0, Math.round(row.basePrice)) : null,
    priceSource: String(row?.priceSource || ""),
    loading: false,
    queuedForRefresh: false,
    error: String(row?.error || ""),
    data: row?.data && typeof row.data === "object" ? deepCloneJson(row.data) : null,
    updatedAt: row?.updatedAt || null,
    updateLogs: normalizeRowUpdateLogs(row?.updateLogs),
  }));
}

function findShadowRowById(shadowRows, rowIdRaw) {
  const rowId = String(rowIdRaw || "").trim();
  if (!rowId) {
    return null;
  }
  return shadowRows.find((row) => String(row?.id || "") === rowId) || null;
}

async function updateShadowRow(shadowRow, options = {}) {
  if (!shadowRow || typeof shadowRow !== "object" || !shadowRow.nmId) {
    return;
  }

  const actionKey = String(options.actionKey || "scheduled").trim() || "scheduled";
  const beforeSnapshot = captureRowUpdateSnapshot(shadowRow);
  const previousData = shadowRow.data && typeof shadowRow.data === "object" ? shadowRow.data : null;

  try {
    const payload = await fetchCardPayload(shadowRow.nmId, {
      mode: "full",
      previousCoverDuplicate:
        previousData && typeof previousData.coverSlideDuplicate === "boolean"
          ? previousData.coverSlideDuplicate
          : null,
      previousPhotoCount:
        previousData && Number.isFinite(previousData.photoCount)
          ? Math.max(0, Math.round(previousData.photoCount))
          : null,
    });

    applyMarketStabilityGuard(payload, previousData, shadowRow);
    shadowRow.updatedAt = new Date().toISOString();
    shadowRow.error = "";
    shadowRow.data = payload;

    if (payload.supplierId) {
      shadowRow.supplierId = String(payload.supplierId);
    }

    const cabinetFromMap = getCabinetBySupplierId(shadowRow.supplierId);
    if (cabinetFromMap) {
      shadowRow.cabinet = cabinetFromMap;
    }

    mergeStockIntoRow(shadowRow, {
      stockValue: payload.stockValue,
      inStock: payload.inStock,
      source: payload.stockSource || "card-v4",
    });
    mergePriceIntoRow(shadowRow, {
      currentPrice: payload.currentPrice,
      basePrice: payload.basePrice,
      source: payload.priceSource || "card-v4",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    shadowRow.error = errorMessage;
  } finally {
    const afterSnapshot = captureRowUpdateSnapshot(shadowRow);
    const changes = getRowUpdateChanges(beforeSnapshot, afterSnapshot);
    if (changes.length === 0 && afterSnapshot.marketError) {
      changes.push({
        field: "marketError",
        label: "Рынок: ошибка источника",
        beforeText: "повтор",
        afterText: afterSnapshot.marketError,
      });
    }
    appendRowUpdateLog(shadowRow, {
      at: new Date().toISOString(),
      source: "system",
      mode: "full",
      actionKey,
      status: shadowRow.error ? "error" : "success",
      error: shadowRow.error || "",
      changes,
    });
  }
}

async function runShadowRowsUpdate(shadowRows) {
  const rowIds = shadowRows.map((row) => row.id).filter(Boolean);
  if (rowIds.length === 0) {
    return;
  }

  await runWithConcurrency(
    rowIds,
    BULK_CONCURRENCY,
    async (rowId) => {
      const row = findShadowRowById(shadowRows, rowId);
      if (!row) {
        return;
      }
      await updateShadowRow(row, { actionKey: "scheduled" });
    },
  );

  const retryIds = rowIds.filter((rowId) => {
    const row = findShadowRowById(shadowRows, rowId);
    return Boolean(row?.error && isRetriableRowError(row.error));
  });

  if (retryIds.length <= 0) {
    return;
  }

  await sleep(900);
  await runWithConcurrency(
    retryIds,
    BULK_CONCURRENCY,
    async (rowId) => {
      const row = findShadowRowById(shadowRows, rowId);
      if (!row) {
        return;
      }
      await updateShadowRow(row, { actionKey: "scheduled-retry" });
    },
  );
}

function saveShadowPendingPayload(shadowRows) {
  if (!Array.isArray(shadowRows)) {
    return false;
  }

  const shadowLastSyncAt = new Date().toISOString();
  const nextSnapshots = normalizeProblemSnapshots([
    ...(Array.isArray(state.updateSnapshots) ? state.updateSnapshots : []),
    buildProblemSnapshot(shadowRows, {
      source: "system",
      actionKey: "scheduled",
      mode: "full",
      at: shadowLastSyncAt,
    }),
  ]);

  const payload =
    typeof buildStatePayload === "function"
      ? buildStatePayload(shadowLastSyncAt, {
          rows: shadowRows,
          lastSyncAt: shadowLastSyncAt,
          updateSnapshots: nextSnapshots,
        })
      : null;

  if (!payload || typeof payload !== "object") {
    return false;
  }

  if (typeof persistShadowPendingPayload === "function") {
    persistShadowPendingPayload(payload);
    return true;
  }

  return false;
}

async function maybeRunShadowScheduledUpdate(trigger = "timer") {
  if (!shadowUpdateScheduler.started || shadowUpdateScheduler.inFlight) {
    return;
  }

  const slot = getCurrentMskSlotInfo(Date.now());
  if (!slot || !isValidShadowSlotKey(slot.slotKey)) {
    scheduleShadowUpdateCheck({ delayMs: SHADOW_UPDATE_RECHECK_DELAY_MS });
    return;
  }

  const lastSlotKey = readShadowLastSlotKey();
  if (lastSlotKey === slot.slotKey) {
    scheduleShadowUpdateCheck();
    return;
  }

  if (state.isBulkLoading) {
    scheduleShadowUpdateCheck({ delayMs: SHADOW_UPDATE_RECHECK_DELAY_MS });
    return;
  }

  const rowIds = getShadowRowIds();
  if (rowIds.length === 0) {
    writeShadowLastSlotKey(slot.slotKey);
    scheduleShadowUpdateCheck();
    return;
  }

  const lockToken = acquireShadowUpdateLock(slot.slotKey);
  if (!lockToken) {
    scheduleShadowUpdateCheck({ delayMs: SHADOW_UPDATE_RECHECK_DELAY_MS });
    return;
  }

  shadowUpdateScheduler.inFlight = true;
  shadowUpdateScheduler.runningSlotKey = slot.slotKey;
  shadowUpdateScheduler.lockToken = lockToken;
  let canceled = false;
  let success = false;

  try {
    const shadowRows = cloneRowsForShadowUpdate(state.rows);
    await runShadowRowsUpdate(shadowRows);
    success = saveShadowPendingPayload(shadowRows);
    if (success) {
      writeShadowLastSlotKey(slot.slotKey);
    }
  } catch {
    canceled = true;
    scheduleShadowUpdateCheck({ delayMs: SHADOW_UPDATE_RECHECK_DELAY_MS });
  } finally {
    shadowUpdateScheduler.inFlight = false;
    shadowUpdateScheduler.runningSlotKey = "";
    releaseShadowUpdateLock(lockToken);
    shadowUpdateScheduler.lockToken = "";
    if (canceled || !success) {
      scheduleShadowUpdateCheck({ delayMs: SHADOW_UPDATE_RECHECK_DELAY_MS });
    } else {
      scheduleShadowUpdateCheck();
    }
  }
}

function handleShadowSchedulerVisibilityChange() {
  if (document.visibilityState !== "visible") {
    return;
  }
  maybeRunShadowScheduledUpdate("visibility").catch(() => {});
}

function handleShadowSchedulerFocus() {
  maybeRunShadowScheduledUpdate("focus").catch(() => {});
}

function initShadowUpdateScheduler() {
  if (shadowUpdateScheduler.started) {
    return;
  }

  shadowUpdateScheduler.started = true;
  document.addEventListener("visibilitychange", handleShadowSchedulerVisibilityChange);
  window.addEventListener("focus", handleShadowSchedulerFocus);

  scheduleShadowUpdateCheck({ delayMs: SHADOW_UPDATE_INIT_DELAY_MS });
}

function normalizeRowsLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return ROWS_LIMIT_DEFAULT;
  }

  return Math.min(ROWS_LIMIT_MAX, Math.max(ROWS_LIMIT_DEFAULT, parsed));
}

function normalizeAutoplayLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return AUTOPLAY_LIMIT_DEFAULT;
  }

  return Math.min(AUTOPLAY_LIMIT_MAX, Math.max(AUTOPLAY_LIMIT_MIN, parsed));
}

function normalizeAutoplayLimitMap(raw) {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const normalized = {};
  for (const [cabinetRaw, limitRaw] of Object.entries(raw)) {
    const cabinet = String(cabinetRaw || "").trim();
    if (!cabinet) {
      continue;
    }
    normalized[cabinet] = normalizeAutoplayLimit(limitRaw);
  }

  return normalized;
}

function normalizeTagsLimit(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    return TAGS_LIMIT_DEFAULT;
  }

  return Math.min(AUTOPLAY_LIMIT_MAX, Math.max(AUTOPLAY_LIMIT_MIN, parsed));
}

function normalizeTagsLimitMap(raw) {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const normalized = {};
  for (const [cabinetRaw, limitRaw] of Object.entries(raw)) {
    const cabinet = String(cabinetRaw || "").trim();
    if (!cabinet) {
      continue;
    }
    normalized[cabinet] = normalizeTagsLimit(limitRaw);
  }

  return normalized;
}

function createDefaultSellerSettings() {
  return DEFAULT_SELLER_SETTINGS.map((item) => ({
    supplierId: String(item.supplierId || "").trim(),
    cabinet: String(item.cabinet || "").trim(),
    url: String(item.url || "").trim(),
  }));
}

function buildSellerUrl(supplierIdRaw) {
  const supplierId = normalizeSupplierId(supplierIdRaw);
  return supplierId ? `https://www.wildberries.ru/seller/${supplierId}` : "";
}

function extractSellerIdFromInput(raw) {
  if (raw === null || raw === undefined) {
    return null;
  }
  const text = String(raw).trim();
  if (!text) {
    return null;
  }

  const fromUrl = text.match(/wildberries\.ru\/seller\/(\d{2,})/i);
  if (fromUrl?.[1]) {
    return normalizeSupplierId(fromUrl[1]);
  }

  const direct = text.match(/\b(\d{2,})\b/);
  if (direct?.[1]) {
    return normalizeSupplierId(direct[1]);
  }

  return null;
}

function normalizeSellerSettings(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const normalized = [];
  const seen = new Set();

  for (const item of source) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const supplierId = normalizeSupplierId(item.supplierId || extractSellerIdFromInput(item.url || ""));
    if (!supplierId || seen.has(supplierId)) {
      continue;
    }

    const cabinet = String(item.cabinet || "").trim().replace(/\s+/g, " ").slice(0, 64);
    if (!cabinet) {
      continue;
    }

    const urlRaw = String(item.url || "").trim();
    const url = /wildberries\.ru\/seller\/\d+/i.test(urlRaw) ? urlRaw : buildSellerUrl(supplierId);
    if (!url) {
      continue;
    }

    seen.add(supplierId);
    normalized.push({
      supplierId,
      cabinet,
      url,
    });

    if (normalized.length >= SELLER_SETTINGS_LIMIT) {
      break;
    }
  }

  if (normalized.length > 0) {
    return normalized;
  }
  return createDefaultSellerSettings();
}

function getSellerSettings() {
  const settings = normalizeSellerSettings(state.sellerSettings);
  state.sellerSettings = settings;
  return settings;
}

function normalizeColorVariantCache(raw) {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const now = Date.now();
  const out = {};
  for (const [nmIdRaw, entryRaw] of Object.entries(raw)) {
    const nmId = String(nmIdRaw || "").trim();
    if (!/^\d{6,}$/.test(nmId)) {
      continue;
    }
    if (!entryRaw || typeof entryRaw !== "object") {
      continue;
    }

    const updatedAt = Number(entryRaw.updatedAt);
    const data = entryRaw.data && typeof entryRaw.data === "object" ? entryRaw.data : null;
    if (!data || !Number.isFinite(updatedAt) || updatedAt <= 0) {
      continue;
    }

    if (now - updatedAt > COLOR_VARIANT_CACHE_TTL_MS * 3) {
      continue;
    }

    out[nmId] = {
      updatedAt,
      data: {
        nmId,
        link: String(data.link || `https://www.wildberries.ru/catalog/${nmId}/detail.aspx`),
        name: String(data.name || ""),
        category: String(data.category || ""),
        brand: String(data.brand || ""),
        cover: String(data.cover || ""),
        stockValue: Number.isFinite(data.stockValue) ? Math.max(0, Math.round(data.stockValue)) : null,
        inStock: typeof data.inStock === "boolean" ? data.inStock : null,
        currentPrice: Number.isFinite(data.currentPrice) ? Math.max(0, Math.round(data.currentPrice)) : null,
        rating: Number.isFinite(data.rating) ? Math.round(Number(data.rating) * 10) / 10 : null,
      },
    };
  }

  return out;
}

function applyAutoplayLimitControl() {
  state.autoplayLimitPerCabinet = normalizeAutoplayLimit(state.autoplayLimitPerCabinet);
  const globalLimit = state.autoplayLimitPerCabinet;
  const normalizedMap = normalizeAutoplayLimitMap(state.autoplayLimitByCabinet);
  const cleanedMap = {};
  for (const [cabinet, limitRaw] of Object.entries(normalizedMap)) {
    const normalizedLimit = normalizeAutoplayLimit(limitRaw);
    if (normalizedLimit !== globalLimit) {
      cleanedMap[cabinet] = normalizedLimit;
    }
  }
  state.autoplayLimitByCabinet = cleanedMap;
  const globalInputs = [];
  if (el.autoplayLimitInput) {
    globalInputs.push(el.autoplayLimitInput);
  }
  for (const input of document.querySelectorAll("[data-autoplay-global-limit]")) {
    globalInputs.push(input);
  }
  for (const input of globalInputs) {
    input.value = String(state.autoplayLimitPerCabinet);
  }
}

function handleAutoplayLimitChange(event) {
  const targetInput = event?.target?.closest?.("[data-autoplay-global-limit], #autoplayLimitInput");
  if (event && !targetInput) {
    return;
  }

  const input = targetInput || el.autoplayLimitInput || document.querySelector("[data-autoplay-global-limit]");
  if (!input) {
    return;
  }

  const previousGlobalLimit = normalizeAutoplayLimit(state.autoplayLimitPerCabinet);
  const nextGlobalLimit = normalizeAutoplayLimit(input.value);
  state.autoplayLimitPerCabinet = nextGlobalLimit;
  const normalizedMap = normalizeAutoplayLimitMap(state.autoplayLimitByCabinet);
  const migratedMap = {};
  for (const [cabinet, limitRaw] of Object.entries(normalizedMap)) {
    const normalizedLimit = normalizeAutoplayLimit(limitRaw);
    if (normalizedLimit === previousGlobalLimit || normalizedLimit === nextGlobalLimit) {
      continue;
    }
    migratedMap[cabinet] = normalizedLimit;
  }
  state.autoplayLimitByCabinet = migratedMap;
  applyAutoplayLimitControl();
  render();
}

function applyTagsLimitControl() {
  state.tagsLimitPerCabinet = normalizeTagsLimit(state.tagsLimitPerCabinet);
  const globalLimit = state.tagsLimitPerCabinet;
  const normalizedMap = normalizeTagsLimitMap(state.tagsLimitByCabinet);
  const cleanedMap = {};
  for (const [cabinet, limitRaw] of Object.entries(normalizedMap)) {
    const normalizedLimit = normalizeTagsLimit(limitRaw);
    if (normalizedLimit !== globalLimit) {
      cleanedMap[cabinet] = normalizedLimit;
    }
  }
  state.tagsLimitByCabinet = cleanedMap;
  for (const input of document.querySelectorAll("[data-tags-global-limit]")) {
    input.value = String(state.tagsLimitPerCabinet);
  }
}

function handleTagsLimitChange(event) {
  const targetInput = event?.target?.closest?.("[data-tags-global-limit]");
  if (event && !targetInput) {
    return;
  }

  const input = targetInput || document.querySelector("[data-tags-global-limit]");
  if (!input) {
    return;
  }

  const previousGlobalLimit = normalizeTagsLimit(state.tagsLimitPerCabinet);
  const nextGlobalLimit = normalizeTagsLimit(input.value);
  state.tagsLimitPerCabinet = nextGlobalLimit;
  const normalizedMap = normalizeTagsLimitMap(state.tagsLimitByCabinet);
  const migratedMap = {};
  for (const [cabinet, limitRaw] of Object.entries(normalizedMap)) {
    const normalizedLimit = normalizeTagsLimit(limitRaw);
    if (normalizedLimit === previousGlobalLimit || normalizedLimit === nextGlobalLimit) {
      continue;
    }
    migratedMap[cabinet] = normalizedLimit;
  }
  state.tagsLimitByCabinet = migratedMap;
  applyTagsLimitControl();
  render();
}

function handleAutoplayCabinetLimitChange(event) {
  const input = event.target?.closest?.("[data-cabinet-limit]");
  if (!input) {
    return;
  }

  const cabinet = String(input.dataset.cabinetLimit || "").trim();
  if (!cabinet) {
    return;
  }

  const raw = String(input.value || "").trim();
  if (!raw) {
    delete state.autoplayLimitByCabinet[cabinet];
    render();
    return;
  }

  const normalizedLimit = normalizeAutoplayLimit(raw);
  if (normalizedLimit === normalizeAutoplayLimit(state.autoplayLimitPerCabinet)) {
    delete state.autoplayLimitByCabinet[cabinet];
  } else {
    state.autoplayLimitByCabinet[cabinet] = normalizedLimit;
  }
  render();
}

function handleTagsCabinetLimitChange(event) {
  const input = event.target?.closest?.("[data-tags-cabinet-limit]");
  if (!input) {
    return;
  }

  const cabinet = String(input.dataset.tagsCabinetLimit || "").trim();
  if (!cabinet) {
    return;
  }

  const raw = String(input.value || "").trim();
  if (!raw) {
    delete state.tagsLimitByCabinet[cabinet];
    render();
    return;
  }

  const normalizedLimit = normalizeTagsLimit(raw);
  if (normalizedLimit === normalizeTagsLimit(state.tagsLimitPerCabinet)) {
    delete state.tagsLimitByCabinet[cabinet];
  } else {
    state.tagsLimitByCabinet[cabinet] = normalizedLimit;
  }
  render();
}

function applyRowsLimitControl() {
  state.rowsLimit = normalizeRowsLimit(state.rowsLimit);
  if (!el.rowsLimitSelect) {
    return;
  }

  const expected = String(state.rowsLimit);
  const optionExists = Array.from(el.rowsLimitSelect.options).some((option) => option.value === expected);
  if (optionExists) {
    el.rowsLimitSelect.value = expected;
  } else {
    el.rowsLimitSelect.value = String(ROWS_LIMIT_DEFAULT);
    state.rowsLimit = ROWS_LIMIT_DEFAULT;
  }
}

function handleRowsLimitChange() {
  if (!el.rowsLimitSelect) {
    return;
  }

  state.rowsLimit = normalizeRowsLimit(el.rowsLimitSelect.value);
  state.rowsPage = 1;
  applyRowsLimitControl();
  render();
}

function shiftRowsPage(delta) {
  const next = state.rowsPage + Number(delta || 0);
  const totalPages = Math.max(1, Number(state.pagination.totalPages) || 1);
  state.rowsPage = Math.max(1, Math.min(totalPages, next));
  render();
}

function handleGlobalCategorySearchInput() {
  if (!el.globalCategorySearchInput) {
    return;
  }

  const next = String(el.globalCategorySearchInput.value || "").slice(0, 120);
  if (next === state.categorySearchQuery) {
    return;
  }

  state.categorySearchQuery = next;
  renderGlobalCategoryFilters();
  persistState();
}

function handleResetAllFilters() {
  state.filters = { ...FILTER_DEFAULTS };
  state.onlyErrors = false;
  state.notLoadedOnly = false;
  state.checksFiltersOpen = false;
  state.autoplayProblemOnly = false;
  state.tagsProblemOnly = false;
  state.categorySearchQuery = "";
  if (el.globalCategorySearchInput) {
    el.globalCategorySearchInput.value = "";
  }
  state.rowsPage = 1;
  renderFilterInputs();
  render();
}

function handlePresetActionsClick(event) {
  const sellersBtn = event.target.closest("[data-action='open-sellers-settings']");
  if (sellersBtn) {
    event.preventDefault();
    openSellersModal();
    return;
  }

  const chartBtn = event.target.closest("[data-action='open-problems-chart']");
  if (chartBtn) {
    event.preventDefault();
    openProblemsChart();
    return;
  }

  const limitsBtn = event.target.closest("[data-action='open-limit-settings']");
  if (limitsBtn) {
    event.preventDefault();
    const kind = String(limitsBtn.dataset.limitKind || "autoplay").trim();
    openLimitsModal(kind === "tags" ? "tags" : "autoplay");
    return;
  }

  const dashboardCabinetBtn = event.target.closest("[data-action='toggle-dashboard-cabinet']");
  if (dashboardCabinetBtn) {
    event.preventDefault();
    const cabinet = String(dashboardCabinetBtn.dataset.dashboardCabinet || "all").trim();
    setDashboardCabinetFilter(cabinet, { toggle: true });
    return;
  }

  const categoryGroupBtn = event.target.closest("[data-action='toggle-category-group']");
  if (categoryGroupBtn) {
    event.preventDefault();
    const category = String(categoryGroupBtn.dataset.categoryGroup || "all");
    setCategoryGroupFilter(toggleCategoryGroupFilter(state.filters.categoryGroup, category, state.rows));
    return;
  }

  const toggleBtn = event.target.closest("[data-action='toggle-preset']");
  if (toggleBtn) {
    event.preventDefault();
    const presetId = String(toggleBtn.dataset.presetId || "").trim();
    if (presetId) {
      togglePresetFilter(presetId);
    }
    return;
  }

  const resetBtn = event.target.closest("[data-action='reset-all-filters']");
  if (resetBtn) {
    event.preventDefault();
    handleResetAllFilters();
  }
}

function handleAddBulk() {
  const nmIds = parseBulkInput(el.bulkInput.value);

  if (nmIds.length === 0) {
    window.alert("Не удалось распознать артикулы. Добавьте по одному значению в строке.");
    return;
  }

  upsertRowsFromNmIds(nmIds);
  el.bulkInput.value = "";
  render();
}

async function handleLoadAll() {
  if (state.rows.length === 0 || state.isBulkLoading) {
    return;
  }

  await loadFilteredRowsByMode({
    loadingText: "Обновляю карточки",
  });
}

async function loadFilteredRowsByMode({ loadingText = "Обновляю карточки" }) {
  const filteredRows = applyFilters(state.rows);
  if (filteredRows.length === 0) {
    window.alert("После фильтрации нет строк для обновления.");
    return;
  }

  const isFilteredSubset = filteredRows.length !== state.rows.length;
  const effectiveLoadingText = isFilteredSubset ? `${loadingText} (по фильтру)` : loadingText;
  await loadRowsByIds(
    filteredRows.map((row) => row.id),
    {
      loadingText: effectiveLoadingText,
      mode: "full",
      actionKey: "all",
      source: "manual",
    },
  );
}

function getProblemRowIds() {
  return state.rows.filter((row) => Boolean(row.error)).map((row) => row.id);
}

function handleBulkCancel() {
  if (!state.isBulkLoading) {
    return;
  }
  if (typeof requestBulkLoadingCancel === "function") {
    requestBulkLoadingCancel();
  }
}

async function handleLoadProblematic() {
  if (state.isBulkLoading) {
    return;
  }

  const problemRowIds = getProblemRowIds();
  if (problemRowIds.length === 0) {
    window.alert("Проблемных карточек с ошибками загрузки сейчас нет.");
    return;
  }

  if (el.loadProblemBtn) {
    el.loadProblemBtn.textContent = "Обновляю проблемные...";
  }

  const total = problemRowIds.length;
  let completed = 0;
  let canceled = false;

  try {
    setBulkLoading(true, `Обновляю проблемные (0/${total})...`, "problem", {
      reset: true,
      total,
      completed: 0,
      cancellable: true,
      concurrency: 1,
    });

    for (let index = 0; index < total; index += 1) {
      if (typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested()) {
        canceled = true;
        break;
      }
      const rowId = problemRowIds[index];
      if (el.loadProblemBtn) {
        el.loadProblemBtn.textContent = `Проблемные: ${index + 1}/${total}`;
      }
      await loadRow(rowId, {
        forceHostProbe: true,
        source: "manual",
        actionKey: "problem",
        recordProblemSnapshot: false,
      });
      const freshRow = getRowById(rowId);
      if (
        freshRow?.error &&
        isRetriableRowError(freshRow.error) &&
        !(typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested())
      ) {
        await sleep(720);
        await loadRow(rowId, {
          forceHostProbe: true,
          source: "manual",
          actionKey: "problem-retry",
          recordProblemSnapshot: false,
        });
      }

      completed += 1;
      const cancelRequested =
        typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested();
      setBulkLoading(true, `Обновляю проблемные (${completed}/${total})...`, "problem", {
        total,
        completed,
        cancellable: true,
        cancelRequested,
        concurrency: 1,
      });

      if (cancelRequested) {
        canceled = true;
        break;
      }

      if (index < total - 1) {
        await sleep(160);
      }
    }

    if (typeof isBulkLoadingCancelRequested === "function" && isBulkLoadingCancelRequested()) {
      canceled = true;
    }

    state.lastSyncAt = new Date().toISOString();
    if (typeof recordProblemSnapshot === "function") {
      recordProblemSnapshot({
        source: "manual",
        actionKey: "problem",
        mode: "full",
      });
    }
  } finally {
    setBulkLoading(
      false,
      canceled ? `Обновление остановлено (${completed}/${total})` : "Обновление завершено",
      "problem",
      {
        total,
        completed,
        canceled,
        concurrency: 1,
      },
    );
    renderSummary();
    syncButtonState();
  }
}

function openSellersModal() {
  if (!el.sellersModal) {
    return;
  }
  el.sellersModal.hidden = false;
  renderSellersModalContent();
}

function closeSellersModal() {
  if (!el.sellersModal) {
    return;
  }
  el.sellersModal.hidden = true;
}

function renderSellersModalContent() {
  if (!el.sellersContent) {
    return;
  }

  const settings = getSellerSettings();
  const reservedSupplierIds = new Set(
    (Array.isArray(DEFAULT_SELLER_SETTINGS) ? DEFAULT_SELLER_SETTINGS : [])
      .map((item) => normalizeSupplierId(item?.supplierId))
      .filter(Boolean),
  );
  const rowsHtml =
    settings.length > 0
      ? settings
          .map(
            (item) => {
              const supplierId = normalizeSupplierId(item?.supplierId || "");
              const isReserved = supplierId ? reservedSupplierIds.has(supplierId) : false;
              const removeControl = isReserved
                ? '<span class="seller-settings-reserved-label">Зарезервирован</span>'
                : `<button
          class="btn btn-mini btn-danger seller-settings-remove-btn"
          type="button"
          data-action="remove-seller-setting"
          data-supplier-id="${escapeAttr(item.supplierId)}"
        >Удалить</button>`;

              return `<article class="seller-settings-row">
      <div class="seller-settings-row-main">
        <p class="seller-settings-cabinet">${escapeHtml(item.cabinet)}</p>
        <p class="seller-settings-id mono">${escapeHtml(item.supplierId)}</p>
      </div>
      <div class="seller-settings-row-actions">
        <a class="seller-settings-link" href="${escapeAttr(item.url)}" target="_blank" rel="noopener noreferrer">Открыть</a>
        ${removeControl}
      </div>
    </article>`;
            },
          )
          .join("")
      : '<div class="recommendation-empty">Список кабинетов пуст.</div>';

  el.sellersContent.innerHTML = `
    <div class="seller-settings-list">${rowsHtml}</div>
    <form class="seller-settings-form" data-action="add-seller-form">
      <label class="field">
        <span>Название кабинета</span>
        <input name="cabinetName" type="text" required placeholder="Например: Паша 3" maxlength="64" />
      </label>
      <label class="field">
        <span>Ссылка на продавца или ID</span>
        <input
          name="sellerRef"
          type="text"
          required
          placeholder="https://www.wildberries.ru/seller/123456"
          inputmode="url"
        />
      </label>
      <div class="seller-settings-form-actions">
        <button class="btn btn-primary" type="submit">Добавить кабинет</button>
        <button class="btn btn-mini" type="button" data-action="reset-seller-settings">Сбросить к дефолту</button>
      </div>
    </form>
  `;
}

function handleSellerSettingsSubmit(event) {
  const form = event.target?.closest?.("form[data-action='add-seller-form']");
  if (!form) {
    return;
  }

  event.preventDefault();
  const cabinetInput = form.elements.namedItem("cabinetName");
  const sellerRefInput = form.elements.namedItem("sellerRef");
  const cabinetName = String(cabinetInput?.value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 64);
  const sellerRef = String(sellerRefInput?.value || "").trim();
  const supplierId = extractSellerIdFromInput(sellerRef);

  if (!cabinetName) {
    window.alert("Введите название кабинета.");
    return;
  }
  if (!supplierId) {
    window.alert("Не удалось определить ID продавца из ссылки.");
    return;
  }

  const settings = getSellerSettings().slice();
  const nextItem = {
    supplierId,
    cabinet: cabinetName,
    url: buildSellerUrl(supplierId),
  };

  const existingIndex = settings.findIndex((item) => String(item.supplierId) === supplierId);
  if (existingIndex >= 0) {
    settings[existingIndex] = nextItem;
  } else {
    settings.push(nextItem);
  }
  state.sellerSettings = normalizeSellerSettings(settings);

  for (const row of state.rows) {
    if (normalizeSupplierId(row?.supplierId) === supplierId) {
      row.cabinet = cabinetName;
    }
  }

  form.reset();
  render();
  renderSellersModalContent();
}

function handleSellerSettingsClick(event) {
  const removeBtn = event.target?.closest?.("[data-action='remove-seller-setting']");
  if (removeBtn) {
    const supplierId = normalizeSupplierId(removeBtn.dataset.supplierId || "");
    if (!supplierId) {
      return;
    }
    const reservedSupplierIds = new Set(
      (Array.isArray(DEFAULT_SELLER_SETTINGS) ? DEFAULT_SELLER_SETTINGS : [])
        .map((item) => normalizeSupplierId(item?.supplierId))
        .filter(Boolean),
    );
    if (reservedSupplierIds.has(supplierId)) {
      window.alert("Этот кабинет зарезервирован и не может быть удален.");
      return;
    }
    const currentSettings = getSellerSettings();
    const nextSettings = currentSettings.filter((item) => String(item.supplierId) !== supplierId);
    state.sellerSettings = normalizeSellerSettings(nextSettings);
    for (const row of state.rows) {
      if (normalizeSupplierId(row?.supplierId) === supplierId) {
        row.cabinet = "";
      }
    }
    render();
    renderSellersModalContent();
    return;
  }

  const resetBtn = event.target?.closest?.("[data-action='reset-seller-settings']");
  if (resetBtn) {
    state.sellerSettings = createDefaultSellerSettings();
    for (const row of state.rows) {
      const cabinet = getCabinetBySupplierId(row?.supplierId);
      if (cabinet) {
        row.cabinet = cabinet;
      }
    }
    render();
    renderSellersModalContent();
  }
}

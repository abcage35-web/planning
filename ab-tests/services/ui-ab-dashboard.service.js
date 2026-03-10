const AB_DASHBOARD_SHEET_ID = "1FS-XeiQA5IIB420mDAUlEGW09HoZWU0Sqtpk6i1jcEQ";
const AB_DASHBOARD_FETCH_TIMEOUT_MS = 32000;
const AB_FILTER_DATE_FROM_DEFAULT = "2025-01-01";
const AB_TEST_LIMIT_OPTIONS = Object.freeze([50, 100, 150, 200, 250, 300]);
const AB_MATRIX_METRIC_COL_WIDTH = 160;
const AB_MATRIX_VARIANT_COL_WIDTH = 112;
const AB_DASHBOARD_SOURCE_SHEETS = Object.freeze({
  catalog: { gid: "795894762", label: "Каталог товаров" },
  technical: { gid: "763001257", label: "AB-выгрузка" },
  results: { gid: "185346508", label: "Результаты обложек" },
});
const AB_STATUS_MAP = Object.freeze({
  WIN: "good",
  GOOD: "good",
  EXCELLENT: "good",
  LOOSE: "bad",
  LOSE: "bad",
  BAD: "bad",
  NORMAL: "neutral",
  "НОРМ": "neutral",
  "?": "unknown",
});
const AB_FUNNEL_STAGE_STYLES = Object.freeze({
  ctr: { colorFrom: "#3B82F6", colorTo: "#60A5FA" },
  price: { colorFrom: "#8B5CF6", colorTo: "#A78BFA" },
  ctrcr1: { colorFrom: "#F59E0B", colorTo: "#FBBF24" },
  overall: { colorFrom: "#10B981", colorTo: "#34D399" },
});

function abGetTodayDateInputValue() {
  const date = new Date();
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function abCreateDefaultFilters() {
  return {
    search: "",
    cabinet: "all",
    verdict: "all",
    stage: "all",
    limit: String(AB_TEST_LIMIT_OPTIONS[0]),
    dateFrom: AB_FILTER_DATE_FROM_DEFAULT,
    dateTo: abGetTodayDateInputValue(),
    view: "tests",
  };
}

const abDashboardStore = {
  loading: false,
  loaded: false,
  error: "",
  fetchedAt: null,
  data: null,
  promise: null,
  filters: abCreateDefaultFilters(),
  listenersBound: false,
};

function getAbDashboardContentEl() {
  return document.getElementById("abTestsContent");
}

function getAbDashboardMetaEl() {
  return document.getElementById("abTestsMetaLine");
}

function abEscapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function abEscapeAttr(value) {
  return abEscapeHtml(value).replaceAll("\n", " ");
}

function abParseDateLiteral(valueRaw) {
  const value = String(valueRaw || "").trim();
  if (!value) {
    return null;
  }

  const match = value.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
  if (!match) {
    const dottedMatch = value.match(
      /^(\d{2})\.(\d{2})\.(\d{2}|\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (dottedMatch) {
      const day = Number(dottedMatch[1]);
      const month = Number(dottedMatch[2]) - 1;
      const yearText = dottedMatch[3];
      const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
      const hours = Number(dottedMatch[4] || 0);
      const minutes = Number(dottedMatch[5] || 0);
      const seconds = Number(dottedMatch[6] || 0);
      const dottedDate = new Date(year, month, day, hours, minutes, seconds);
      return Number.isNaN(dottedDate.getTime()) ? null : dottedDate.toISOString();
    }

    const direct = new Date(value);
    return Number.isNaN(direct.getTime()) ? null : direct.toISOString();
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hours = Number(match[4] || 0);
  const minutes = Number(match[5] || 0);
  const seconds = Number(match[6] || 0);

  const date = new Date(year, month, day, hours, minutes, seconds);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function abToNumber(valueRaw) {
  if (valueRaw === null || valueRaw === undefined || valueRaw === "") {
    return null;
  }
  if (typeof valueRaw === "number") {
    return Number.isFinite(valueRaw) ? valueRaw : null;
  }

  const text = String(valueRaw)
    .trim()
    .replace(/[\s\u00A0]/g, "")
    .replace(/,/g, ".")
    .replace(/%/g, "");

  if (!text || !/^-?\d*(?:\.\d+)?$/.test(text)) {
    return null;
  }

  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function abToInt(valueRaw) {
  const num = abToNumber(valueRaw);
  if (!Number.isFinite(num)) {
    return null;
  }
  return Math.round(num);
}

function abFormatInt(valueRaw) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return "—";
  }
  return new Intl.NumberFormat("ru-RU").format(Math.round(value));
}

function abFormatPercent(valueRaw, digits = 2) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(digits).replace(".", ",")}%`;
}

function abFormatFractionToPercent(valueRaw, digits = 2) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return "—";
  }
  return abFormatPercent(value * 100, digits);
}

function abFormatSignedPercentFraction(valueRaw, digits = 0) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return "—";
  }
  const percent = value * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(digits).replace(".", ",")}%`;
}

function abFormatHours(valueRaw) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return "—";
  }
  return `${value.toFixed(1).replace(".", ",")} ч`;
}

function abNormalizeNumericId(valueRaw) {
  const value = abToInt(valueRaw);
  if (!Number.isFinite(value)) {
    const digits = String(valueRaw ?? "").match(/\d{3,}/);
    return digits ? digits[0] : "";
  }
  return String(value);
}

function abFormatSourceDateTime(valueRaw) {
  const text = String(valueRaw || "").trim();
  if (!text) {
    return "";
  }
  if (text.includes("\n")) {
    return text;
  }
  const iso = abParseDateLiteral(valueRaw);
  if (!iso) {
    return text;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function abFormatVariantDateTime(valueRaw) {
  const iso = typeof valueRaw === "string" && valueRaw.includes("T") ? valueRaw : abParseDateLiteral(valueRaw);
  if (!iso) {
    return { date: "", time: "" };
  }
  const date = new Date(iso);
  const pad = (value) => String(value).padStart(2, "0");
  return {
    date: `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${String(date.getFullYear()).slice(-2)}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function abFormatCompactPeriodDateTime(isoRaw) {
  const iso = String(isoRaw || "").trim();
  if (!iso) {
    return "—";
  }
  const parts = abFormatVariantDateTime(iso);
  if (!parts.date) {
    return "—";
  }
  return `${parts.date} (${parts.time || "—"})`;
}

function abResolveCabinet(testNameRaw) {
  const testName = String(testNameRaw || "").trim();
  if (!testName) {
    return "?";
  }
  if (/^\s*С\s*\//u.test(testName) || /Сытин/u.test(testName)) {
    return "Сытин";
  }
  if (/^\s*П\s*\//u.test(testName) || /Карпачев/u.test(testName)) {
    return "Карпачев";
  }
  return "?";
}

function abFiniteNumber(valueRaw) {
  const value = Number(valueRaw);
  return Number.isFinite(value) ? value : null;
}

function abSafeDivide(numeratorRaw, denominatorRaw) {
  const numerator = abFiniteNumber(numeratorRaw);
  const denominator = abFiniteNumber(denominatorRaw);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function abFormatPlainNumber(valueRaw) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return "—";
  }
  const hasFraction = Math.abs(value % 1) > 0.0001;
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(value);
}

function abNormalizeStatus(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw) {
    return "unknown";
  }
  const key = raw.toUpperCase();
  if (Object.prototype.hasOwnProperty.call(AB_STATUS_MAP, key)) {
    return AB_STATUS_MAP[key];
  }
  if (key.includes("WIN") || key.includes("GOOD") || key.includes("ХОРОШ")) {
    return "good";
  }
  if (key.includes("LOOSE") || key.includes("LOSE") || key.includes("BAD") || key.includes("ПЛОХ")) {
    return "bad";
  }
  if (key.includes("NORM") || key.includes("NORMAL") || key.includes("СРЕД")) {
    return "neutral";
  }
  return "unknown";
}

function abStatusLabel(statusKind) {
  switch (statusKind) {
    case "good":
      return "Хорошо";
    case "bad":
      return "Плохо";
    case "neutral":
      return "Норм";
    default:
      return "—";
  }
}

function abStatusPill(rawValue, compact = false, labelOverride = "") {
  const raw = String(rawValue || "").trim();
  const kind = abNormalizeStatus(raw);
  const label = String(labelOverride || "").trim() || abStatusLabel(kind);
  const cls = `ab-status-pill is-${abEscapeAttr(kind)}${compact ? " is-compact" : ""}`;
  if (!raw && label === "—") {
    return `<span class="${cls}">—</span>`;
  }
  return `<span class="${cls}" title="${abEscapeAttr(raw || label)}">${abEscapeHtml(label)}</span>`;
}

function abRenderIcon(name, className = "") {
  if (typeof renderIcon === "function") {
    return renderIcon(name, className).trim();
  }
  return "";
}

function abParseGvizResponse(textRaw) {
  const text = String(textRaw || "");
  const marker = "google.visualization.Query.setResponse(";
  const start = text.indexOf(marker);
  if (start < 0) {
    throw new Error("Формат ответа Google Sheets не распознан.");
  }

  const jsonStart = start + marker.length;
  const end = text.lastIndexOf(");");
  if (end <= jsonStart) {
    throw new Error("JSON-пакет Google Sheets не найден.");
  }

  const jsonText = text.slice(jsonStart, end).trim();
  const parsed = JSON.parse(jsonText);
  const table = parsed?.table;
  if (!table || typeof table !== "object") {
    throw new Error("В ответе Google Sheets отсутствует table.");
  }

  return table;
}

async function abFetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || AB_DASHBOARD_FETCH_TIMEOUT_MS));

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Google Sheets вернул ${response.status}.`);
    }
    return await response.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("Превышено время ожидания ответа Google Sheets.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function abBuildSourceMetaText(fetchedLabel = "") {
  const labels = Object.values(AB_DASHBOARD_SOURCE_SHEETS)
    .map((item) => String(item?.label || "").trim())
    .filter(Boolean)
    .join(", ");
  return `Источники: таблица «Тесты CTR» · ${labels}.${fetchedLabel ? ` Обновлено: ${fetchedLabel}` : ""}`;
}

async function fetchAbSheetRaw(sheetConfig) {
  const gid = String(sheetConfig?.gid || "").trim();
  if (!gid) {
    throw new Error("Не задан gid листа Google Sheets.");
  }
  const url = new URL(`https://docs.google.com/spreadsheets/d/${AB_DASHBOARD_SHEET_ID}/gviz/tq`);
  url.searchParams.set("gid", gid);
  url.searchParams.set("tqx", "out:json");
  const responseText = await abFetchWithTimeout(url.toString(), AB_DASHBOARD_FETCH_TIMEOUT_MS);
  const table = abParseGvizResponse(responseText);

  const cols = Array.isArray(table.cols) ? table.cols : [];
  const colIds = cols.map((col, index) => String(col?.id || `COL_${index + 1}`));
  const rowsRaw = Array.isArray(table.rows) ? table.rows : [];

  const rows = rowsRaw.map((rowRaw, rowIndex) => {
    const list = Array.isArray(rowRaw?.c) ? rowRaw.c : [];
    const mapped = { __rowIndex: rowIndex + 1 };
    for (let i = 0; i < colIds.length; i += 1) {
      const cell = list[i];
      if (!cell || (!Object.prototype.hasOwnProperty.call(cell, "v") && !Object.prototype.hasOwnProperty.call(cell, "f"))) {
        mapped[colIds[i]] = { v: "", f: "" };
        continue;
      }
      mapped[colIds[i]] = {
        v: Object.prototype.hasOwnProperty.call(cell, "v") ? cell.v : "",
        f: Object.prototype.hasOwnProperty.call(cell, "f") ? cell.f : "",
      };
    }
    return mapped;
  });

  return {
    cols,
    colIds,
    rows,
  };
}

function abCell(row, id) {
  if (!row || typeof row !== "object") {
    return { v: "", f: "" };
  }
  const cell = row[id];
  if (!cell || typeof cell !== "object") {
    return { v: "", f: "" };
  }
  return cell;
}

function abCellRaw(row, id) {
  return abCell(row, id).v;
}

function abCellText(row, id) {
  const cell = abCell(row, id);
  const formatted = String(cell.f || "").trim();
  if (formatted) {
    return formatted;
  }

  const value = cell.v;
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  return String(value).trim();
}

function abNormalizeTestId(valueRaw) {
  const digits = String(valueRaw ?? "").match(/\d{3,}/);
  return digits ? digits[0] : "";
}

function abParseResultIndex(resultsSheet) {
  const rows = Array.isArray(resultsSheet?.rows) ? resultsSheet.rows : [];
  const map = new Map();

  for (const row of rows) {
    const testId = abNormalizeTestId(abCellRaw(row, "A"));
    if (!testId) {
      continue;
    }

    const coverUrl = String(abCellText(row, "C") || "").trim();
    if (!coverUrl) {
      continue;
    }

    const decisionRaw = abCellText(row, "E");
    const ctrNum = abToNumber(abCellRaw(row, "F"));
    const views = Math.max(0, Number(abToInt(abCellRaw(row, "G")) || 0));
    const clicks = Math.max(0, Number(abToInt(abCellRaw(row, "H")) || 0));

    const installedRaw = abCellRaw(row, "D");
    const installedAt = abParseDateLiteral(installedRaw);
    const installedLabel = String(abCell(row, "D").f || "").trim();

    const shouldInclude = views > 0;
    if (!shouldInclude) {
      continue;
    }

    if (!map.has(testId)) {
      map.set(testId, []);
    }

    map.get(testId).push({
      coverUrl,
      decisionRaw,
      decisionKind: abNormalizeStatus(decisionRaw),
      ctr: Number.isFinite(ctrNum) ? ctrNum : null,
      views,
      clicks,
      installedAt,
      installedLabel,
      rowIndex: Number(row.__rowIndex || 0),
    });
  }

  for (const [testId, list] of map.entries()) {
    list.sort((a, b) => {
      const aMs = a.installedAt ? new Date(a.installedAt).getTime() : 0;
      const bMs = b.installedAt ? new Date(b.installedAt).getTime() : 0;
      if (aMs !== bMs) {
        return aMs - bMs;
      }
      return Number(a.rowIndex || 0) - Number(b.rowIndex || 0);
    });
    map.set(testId, list);
  }

  return map;
}

function abBuildCatalogIndex(catalogSheet) {
  const rows = Array.isArray(catalogSheet?.rows) ? catalogSheet.rows : [];
  const map = new Map();

  for (const row of rows) {
    const article = abNormalizeNumericId(abCellRaw(row, "C"));
    if (!article) {
      continue;
    }
    if (map.has(article)) {
      continue;
    }
    map.set(article, {
      crmId: abNormalizeNumericId(abCellRaw(row, "A")),
      offerId: String(abCellText(row, "D") || "").trim(),
      productName: String(abCellText(row, "E") || "").trim(),
      wbUrl: String(abCellText(row, "F") || "").trim(),
    });
  }

  return map;
}

function abResolveCtrDecisionRaw(boostCtr) {
  if (!Number.isFinite(boostCtr)) {
    return "?";
  }
  return boostCtr > 0 ? "WIN" : "LOOSE";
}

function abResolveCtrCr1DecisionRaw(boostCtrCr1) {
  if (!Number.isFinite(boostCtrCr1)) {
    return "?";
  }
  return boostCtrCr1 >= 0.1 ? "WIN" : "LOOSE";
}

function abResolvePriceDecisionRaw(priceBeforeDelta, priceDuringDelta, priceAfterDelta) {
  const deltas = [priceBeforeDelta, priceDuringDelta, priceAfterDelta];
  if (deltas.some((value) => !Number.isFinite(value))) {
    return "?";
  }
  return deltas.every((value) => Math.abs(value) <= 0.06) ? "WIN" : "LOOSE";
}

function abBuildPriceDeltaMetrics(priceBefore, priceDuring, priceAfter) {
  const prices = [priceBefore, priceDuring, priceAfter].filter((value) => Number.isFinite(value));
  if (!prices.length) {
    return {
      priceDeltaBefore: null,
      priceDeltaDuring: null,
      priceDeltaAfter: null,
      minPriceDelta: null,
      maxPriceDelta: null,
    };
  }

  const averagePrice = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  if (!Number.isFinite(averagePrice) || averagePrice === 0) {
    return {
      priceDeltaBefore: null,
      priceDeltaDuring: null,
      priceDeltaAfter: null,
      minPriceDelta: null,
      maxPriceDelta: null,
    };
  }

  const normalizeDelta = (value) => (Number.isFinite(value) ? value / averagePrice - 1 : null);
  const priceDeltaBefore = normalizeDelta(priceBefore);
  const priceDeltaDuring = normalizeDelta(priceDuring);
  const priceDeltaAfter = normalizeDelta(priceAfter);
  const preparedDeltas = [priceDeltaBefore, priceDeltaDuring, priceDeltaAfter].filter((value) => Number.isFinite(value));

  return {
    priceDeltaBefore,
    priceDeltaDuring,
    priceDeltaAfter,
    minPriceDelta: preparedDeltas.length ? Math.min(...preparedDeltas) : null,
    maxPriceDelta: preparedDeltas.length ? Math.max(...preparedDeltas) : null,
  };
}

function abResolveOverallDecisionRaw(decisions) {
  const prepared = (Array.isArray(decisions) ? decisions : []).map((item) => String(item || "").trim().toUpperCase());
  if (!prepared.length || prepared.some((item) => !item || item === "?")) {
    return "?";
  }
  return prepared.every((item) => item === "WIN") ? "WIN" : "LOOSE";
}

function abBuildComputedReportLines(metrics) {
  const lines = [];
  lines.push(`Буст CTR : ${abFormatFractionToPercent(metrics.boostCtr, 0)}`);
  lines.push(`Изначальный CTR : ${abFormatFractionToPercent(metrics.oldCtr, 2)}`);
  lines.push(`Лучший CTR : ${abFormatFractionToPercent(metrics.maxCtr, 2)}`);
  lines.push(" ");
  lines.push(`Буст CTR*CR1 : ${abFormatFractionToPercent(metrics.boostCtrCr1, 0)}`);
  lines.push(`CTR*CR1 до : ${abFormatFractionToPercent(metrics.ctrCr1Before, 2)}`);
  lines.push(`CTR*CR1 после : ${abFormatFractionToPercent(metrics.ctrCr1After, 2)}`);
  lines.push(" ");
  lines.push(`Мин. изменение цены : ${abFormatFractionToPercent(metrics.minPriceDelta, 2)}`);
  lines.push(`Макс. изменение цены : ${abFormatFractionToPercent(metrics.maxPriceDelta, 2)}`);
  return lines.filter((line) => line.trim() || line === " ");
}

function abBuildVariantCards(resultsList, endedAtIso = "") {
  const testEndedMs = endedAtIso ? new Date(endedAtIso).getTime() : NaN;
  const prepared = (Array.isArray(resultsList) ? resultsList : []).map((item, index, list) => {
    const ctrValue = Number.isFinite(item.views) && item.views > 0 ? item.clicks / item.views : item.ctr;
    const next = list[index + 1] || null;
    const nextInstalledMs = next?.installedAt ? new Date(next.installedAt).getTime() : NaN;
    const currentInstalledMs = item.installedAt ? new Date(item.installedAt).getTime() : NaN;
    const endMs = Number.isFinite(nextInstalledMs) ? nextInstalledMs : testEndedMs;
    const installedAtParts = item.installedAt ? abFormatVariantDateTime(item.installedAt) : { date: "", time: "" };
    const hoursValue =
      Number.isFinite(currentInstalledMs) && Number.isFinite(endMs)
        ? (endMs - currentInstalledMs) / 3600000
        : null;

    return {
      index: index + 1,
      imageUrl: item.coverUrl,
      viewsValue: item.views,
      clicksValue: item.clicks,
      ctrValue,
      installedAtIso: item.installedAt || "",
      views: abFormatInt(item.views),
      clicks: abFormatInt(item.clicks),
      ctr: Number.isFinite(ctrValue) ? abFormatFractionToPercent(ctrValue, 2) : "—",
      installedAtDate: installedAtParts.date || "—",
      installedAtTime: installedAtParts.time || "",
      hours: Number.isFinite(hoursValue) && hoursValue >= 0 ? abFormatHours(hoursValue) : "—",
    };
  });

  if (prepared.length) {
    const baseCtr = Number.isFinite(prepared[0]?.ctrValue) && prepared[0].ctrValue !== 0 ? prepared[0].ctrValue : null;
    const bestCtr = prepared.reduce((max, item) => {
      return Number.isFinite(item.ctrValue) && item.ctrValue > max ? item.ctrValue : max;
    }, Number.NEGATIVE_INFINITY);
    const tolerance = 1e-9;
    return prepared.map((item) => ({
      ...item,
      isBest: Number.isFinite(bestCtr) && Number.isFinite(item.ctrValue) ? Math.abs(item.ctrValue - bestCtr) <= tolerance : false,
      ctrBoostValue:
        item.index > 1 && Number.isFinite(baseCtr) && Number.isFinite(item.ctrValue) ? item.ctrValue / baseCtr - 1 : null,
      ctrBoostText:
        item.index > 1 && Number.isFinite(baseCtr) && Number.isFinite(item.ctrValue)
          ? abFormatSignedPercentFraction(item.ctrValue / baseCtr - 1, 0)
          : "",
      ctrBoostKind:
        item.index > 1 && Number.isFinite(baseCtr) && Number.isFinite(item.ctrValue)
          ? item.ctrValue / baseCtr - 1 > 0
            ? "good"
            : item.ctrValue / baseCtr - 1 < 0
              ? "bad"
              : "neutral"
          : "",
    }));
  }

  return [
    {
      index: 1,
      imageUrl: "",
      viewsValue: null,
      clicksValue: null,
      ctrValue: null,
      installedAtIso: "",
      views: "—",
      clicks: "—",
      ctr: "—",
      installedAtDate: "—",
      installedAtTime: "",
      hours: "—",
      isBest: false,
      ctrBoostValue: null,
      ctrBoostText: "",
      ctrBoostKind: "",
    },
  ];
}

function abBuildComputedMetricsBlock(sourceRow, variants) {
  const variantCtrValues = variants.map((item) => item.ctrValue).filter((value) => Number.isFinite(value));
  const oldCtr = Number.isFinite(variantCtrValues[0]) ? variantCtrValues[0] : abToNumber(abCellRaw(sourceRow, "R"));
  const challengerCtrValues = variantCtrValues.slice(1);
  const maxCtr = challengerCtrValues.length ? Math.max(...challengerCtrValues) : oldCtr;
  const boostCtr = Number.isFinite(oldCtr) && oldCtr !== 0 && Number.isFinite(maxCtr) ? maxCtr / oldCtr - 1 : null;

  const ctrBefore = abToNumber(abCellRaw(sourceRow, "R"));
  const ctrAfter = abToNumber(abCellRaw(sourceRow, "V"));
  const cr1Before = abToNumber(abCellRaw(sourceRow, "S"));
  const cr1After = abToNumber(abCellRaw(sourceRow, "W"));
  const cr2Before = abToNumber(abCellRaw(sourceRow, "T"));
  const cr2After = abToNumber(abCellRaw(sourceRow, "X"));

  const ctrCr1Before = Number.isFinite(ctrBefore) && Number.isFinite(cr1Before) ? ctrBefore * cr1Before : abToNumber(abCellRaw(sourceRow, "Q"));
  const ctrCr1After = Number.isFinite(ctrAfter) && Number.isFinite(cr1After) ? ctrAfter * cr1After : abToNumber(abCellRaw(sourceRow, "U"));
  const boostCtrCr1 =
    Number.isFinite(ctrCr1Before) && ctrCr1Before !== 0 && Number.isFinite(ctrCr1After) ? ctrCr1After / ctrCr1Before - 1 : -1;

  const priceBefore = abToNumber(abCellRaw(sourceRow, "AU"));
  const priceDuring = abToNumber(abCellRaw(sourceRow, "AV"));
  const priceAfter = abToNumber(abCellRaw(sourceRow, "AW"));
  const { priceDeltaBefore, priceDeltaDuring, priceDeltaAfter, minPriceDelta, maxPriceDelta } = abBuildPriceDeltaMetrics(
    priceBefore,
    priceDuring,
    priceAfter,
  );

  const priceDecisionRaw = abResolvePriceDecisionRaw(priceDeltaBefore, priceDeltaDuring, priceDeltaAfter);
  const ctrDecisionRaw = abResolveCtrDecisionRaw(boostCtr);
  const ctrCr1DecisionRaw = abResolveCtrCr1DecisionRaw(boostCtrCr1);
  const overallDecisionRaw = abResolveOverallDecisionRaw([ctrDecisionRaw, priceDecisionRaw, ctrCr1DecisionRaw]);

  return {
    oldCtr,
    maxCtr,
    boostCtr,
    ctrBefore,
    ctrAfter,
    cr1Before,
    cr1After,
    cr2Before,
    cr2After,
    ctrCr1Before,
    ctrCr1After,
    boostCtrCr1,
    priceBefore,
    priceDuring,
    priceAfter,
    priceDeltaBefore,
    priceDeltaDuring,
    priceDeltaAfter,
    minPriceDelta,
    maxPriceDelta,
    priceDecisionRaw,
    ctrDecisionRaw,
    ctrCr1DecisionRaw,
    overallDecisionRaw,
  };
}

function abBuildComputedTestCard(sourceRow, resultsByTest, catalogIndex) {
  const testId = abNormalizeTestId(abCellRaw(sourceRow, "E"));
  if (!testId) {
    return null;
  }

  const article = abNormalizeNumericId(abCellRaw(sourceRow, "A"));
  const catalog = catalogIndex.get(article) || null;
  const testTitle = String(abCellText(sourceRow, "AY") || "").trim();
  const productName = String(abCellText(sourceRow, "AX") || "").trim() || catalog?.productName || testTitle || "—";
  const wbUrl = String(abCellText(sourceRow, "B") || "").trim() || catalog?.wbUrl || "";
  const xwayUrl = String(abCellText(sourceRow, "F") || "").trim();
  const startedAtIso = abParseDateLiteral(abCellRaw(sourceRow, "M"));
  const endedAtIso = abParseDateLiteral(abCellRaw(sourceRow, "O"));

  const variants = abBuildVariantCards(resultsByTest.get(testId), endedAtIso);
  const metricsBlock = abBuildComputedMetricsBlock(sourceRow, variants);

  const metrics = [
    {
      checkName: "Тест CTR",
      label: "Буст CTR",
      valueText: abFormatFractionToPercent(metricsBlock.boostCtr, 0),
      statusRaw: metricsBlock.ctrDecisionRaw,
      statusKind: abNormalizeStatus(metricsBlock.ctrDecisionRaw),
    },
    {
      checkName: "Тест CTR*CR1",
      label: "Буст CTR*CR1",
      valueText: abFormatFractionToPercent(metricsBlock.boostCtrCr1, 0),
      statusRaw: metricsBlock.ctrCr1DecisionRaw,
      statusKind: abNormalizeStatus(metricsBlock.ctrCr1DecisionRaw),
    },
    {
      checkName: "Тест изм. цены",
      label: "Old CTR",
      valueText: abFormatFractionToPercent(metricsBlock.oldCtr, 2),
      statusRaw: metricsBlock.priceDecisionRaw,
      statusKind: abNormalizeStatus(metricsBlock.priceDecisionRaw),
    },
    {
      checkName: "",
      label: "Max CTR",
      valueText: abFormatFractionToPercent(metricsBlock.maxCtr, 2),
      statusRaw: "",
      statusKind: "unknown",
    },
    {
      checkName: "Подсчет CTR*CR1",
      label: "CTR*CR1 до",
      valueText: abFormatFractionToPercent(metricsBlock.ctrCr1Before, 2),
      statusRaw: "",
      statusKind: "unknown",
    },
    {
      checkName: "ИТОГ",
      label: "CTR*CR1 после",
      valueText: abFormatFractionToPercent(metricsBlock.ctrCr1After, 2),
      statusRaw: metricsBlock.overallDecisionRaw,
      statusKind: abNormalizeStatus(metricsBlock.overallDecisionRaw),
    },
  ];

  const ocrBefore =
    Number.isFinite(metricsBlock.ctrBefore) && Number.isFinite(metricsBlock.cr1Before) && Number.isFinite(metricsBlock.cr2Before)
      ? metricsBlock.ctrBefore * metricsBlock.cr1Before * metricsBlock.cr2Before * 100
      : null;
  const ocrAfter =
    Number.isFinite(metricsBlock.ctrAfter) && Number.isFinite(metricsBlock.cr1After) && Number.isFinite(metricsBlock.cr2After)
      ? metricsBlock.ctrAfter * metricsBlock.cr1After * metricsBlock.cr2After * 100
      : null;

  const comparisonRows = [
    abBuildTimelineMetricRow("Цена", metricsBlock.priceBefore, metricsBlock.priceDuring, metricsBlock.priceAfter, (value) =>
      abFormatInt(value),
    ),
    abBuildTimelineMetricRow(
      "Откл. цены",
      metricsBlock.priceDeltaBefore,
      metricsBlock.priceDeltaDuring,
      metricsBlock.priceDeltaAfter,
      (value) => abFormatFractionToPercent(value, 0),
      { deltaMode: "none" },
    ),
    abBuildTimelineMetricRow("CTR", metricsBlock.ctrBefore, null, metricsBlock.ctrAfter, (value) =>
      abFormatFractionToPercent(value, 2),
    ),
    abBuildTimelineMetricRow("CR1", metricsBlock.cr1Before, null, metricsBlock.cr1After, (value) =>
      abFormatFractionToPercent(value, 2),
    ),
    abBuildTimelineMetricRow("CR2", metricsBlock.cr2Before, null, metricsBlock.cr2After, (value) =>
      abFormatFractionToPercent(value, 2),
    ),
    abBuildTimelineMetricRow("CTR*CR1", metricsBlock.ctrCr1Before, null, metricsBlock.ctrCr1After, (value) =>
      abFormatFractionToPercent(value, 2),
    ),
    abBuildTimelineMetricRow("CRF x 100", ocrBefore, null, ocrAfter, (value) => abFormatPercent(value, 2)),
  ];

  const reportLines = abBuildComputedReportLines(metricsBlock);

  return {
    testId,
    xwayUrl,
    wbUrl,
    article,
    title: testTitle || productName,
    productName,
    type: String(abCellText(sourceRow, "D") || "").trim(),
    cabinet: abResolveCabinet(testTitle),
    startedAt: abFormatSourceDateTime(abCellRaw(sourceRow, "M")),
    startedAtIso: startedAtIso || "",
    endedAt: abFormatSourceDateTime(abCellRaw(sourceRow, "O")),
    endedAtIso: endedAtIso || "",
    metrics,
    finalStatusRaw: metricsBlock.overallDecisionRaw,
    finalStatusKind: abNormalizeStatus(metricsBlock.overallDecisionRaw),
    summaryChecks: {
      testCtr: metricsBlock.ctrDecisionRaw,
      testPrice: metricsBlock.priceDecisionRaw,
      testCtrCr1: metricsBlock.ctrCr1DecisionRaw,
      overall: metricsBlock.overallDecisionRaw,
    },
    variants,
    priceDeviationCount: abFormatInt(
      abCountPriceTransitions(metricsBlock.priceBefore, metricsBlock.priceDuring, metricsBlock.priceAfter),
    ),
    comparisonRows,
    reportLines,
    reportText: reportLines.join("\n"),
  };
}

function abBuildTestCardsFromTechnical(technicalSheet, resultsByTest, catalogIndex) {
  const rows = Array.isArray(technicalSheet?.rows) ? technicalSheet.rows : [];
  const rowsByTestId = new Map();

  for (const row of rows) {
    const testId = abNormalizeTestId(abCellRaw(row, "E"));
    if (!testId) {
      continue;
    }
    const current = rowsByTestId.get(testId);
    const currentMs = current ? new Date(abParseDateLiteral(abCellRaw(current, "M")) || 0).getTime() : -1;
    const nextMs = new Date(abParseDateLiteral(abCellRaw(row, "M")) || 0).getTime();
    if (!current || nextMs >= currentMs) {
      rowsByTestId.set(testId, row);
    }
  }

  return Array.from(rowsByTestId.values())
    .map((row) => abBuildComputedTestCard(row, resultsByTest, catalogIndex))
    .filter(Boolean)
    .sort((a, b) => {
      const aMs = a.startedAtIso ? new Date(a.startedAtIso).getTime() : 0;
      const bMs = b.startedAtIso ? new Date(b.startedAtIso).getTime() : 0;
      if (aMs !== bMs) {
        return bMs - aMs;
      }
      return Number(b.testId || 0) - Number(a.testId || 0);
    });
}

function abBuildProducts(tests) {
  const map = new Map();
  for (const test of tests) {
    const key = String(test.article || test.testId || "").trim();
    if (!key) {
      continue;
    }
    if (!map.has(key)) {
      map.set(key, {
        article: key,
        title: test.productName || test.title,
        type: test.type,
        cabinetSet: new Set(),
        tests: [],
        good: 0,
        bad: 0,
        unknown: 0,
        latestAt: test.startedAt || test.endedAt || "",
      });
    }
    const item = map.get(key);
    item.tests.push(test);
    if (test.cabinet) {
      item.cabinetSet.add(test.cabinet);
    }
    if (test.finalStatusKind === "good") {
      item.good += 1;
    } else if (test.finalStatusKind === "bad") {
      item.bad += 1;
    } else {
      item.unknown += 1;
    }

    const currentMs = item.latestAt ? new Date(item.latestAt).getTime() : 0;
    const nextMs = test.startedAt ? new Date(test.startedAt).getTime() : 0;
    if (nextMs > currentMs) {
      item.latestAt = test.startedAt;
    }
  }

  return Array.from(map.values())
    .map((item) => ({
      article: item.article,
      title: item.title,
      type: item.type,
      cabinets: Array.from(item.cabinetSet),
      tests: item.tests,
      testsCount: item.tests.length,
      good: item.good,
      bad: item.bad,
      unknown: item.unknown,
      latestAt: item.latestAt,
    }))
    .sort((a, b) => {
      if (b.testsCount !== a.testsCount) {
        return b.testsCount - a.testsCount;
      }
      const aMs = a.latestAt ? new Date(a.latestAt).getTime() : 0;
      const bMs = b.latestAt ? new Date(b.latestAt).getTime() : 0;
      return bMs - aMs;
    });
}

function buildAbDashboardModel(source) {
  const catalog = source?.catalog;
  const technical = source?.technical;
  const results = source?.results;

  const catalogIndex = abBuildCatalogIndex(catalog);
  const resultsByTest = abParseResultIndex(results);
  const tests = abBuildTestCardsFromTechnical(technical, resultsByTest, catalogIndex);
  const products = abBuildProducts(tests);

  const cabinets = Array.from(new Set(tests.map((item) => item.cabinet).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));

  const statusTotals = tests.reduce(
    (acc, test) => {
      const key = test.finalStatusKind;
      if (Object.prototype.hasOwnProperty.call(acc, key)) {
        acc[key] += 1;
      } else {
        acc.unknown += 1;
      }
      return acc;
    },
    { good: 0, bad: 0, neutral: 0, unknown: 0 },
  );

  return {
    tests,
    products,
    cabinets,
    statusTotals,
    rowCounts: {
      catalog: Array.isArray(catalog?.rows) ? catalog.rows.length : 0,
      technical: Array.isArray(technical?.rows) ? technical.rows.length : 0,
      results: Array.isArray(results?.rows) ? results.rows.length : 0,
    },
  };
}

function abSafeLink(urlRaw, label) {
  const url = String(urlRaw || "").trim();
  if (!url) {
    return '<span class="ab-link-empty">—</span>';
  }
  const icon = abRenderIcon("externalLink", "ab-link-icon") || "↗";
  return `<a class="ab-link ab-head-action-btn" href="${abEscapeAttr(url)}" target="_blank" rel="noopener noreferrer">${icon}<span>${abEscapeHtml(
    label || "Открыть",
  )}</span></a>`;
}

function abGetTestFilterDate(test) {
  const iso = String(test?.startedAtIso || test?.endedAtIso || "").trim();
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function abIsGoodStatus(rawValue) {
  return abNormalizeStatus(rawValue) === "good";
}

function abBuildCabinetFunnelCards(tests, cabinetOrder = []) {
  const list = Array.isArray(tests) ? tests : [];
  const cabinets = Array.isArray(cabinetOrder) && cabinetOrder.length
    ? cabinetOrder
    : Array.from(new Set(list.map((item) => item?.cabinet).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));

  return cabinets
    .map((cabinet) => {
      const cabinetTests = list.filter((item) => item?.cabinet === cabinet);
      const total = cabinetTests.length;
      if (!total) {
        return null;
      }

      const ctrPassed = cabinetTests.filter((item) => abIsGoodStatus(item?.summaryChecks?.testCtr)).length;
      const pricePassed = cabinetTests.filter((item) => abIsGoodStatus(item?.summaryChecks?.testPrice)).length;
      const ctrCr1Passed = cabinetTests.filter((item) => abIsGoodStatus(item?.summaryChecks?.testCtrCr1)).length;
      const overallPassed = cabinetTests.filter((item) => abIsGoodStatus(item?.summaryChecks?.overall)).length;

      return {
        cabinet,
        total,
        stages: [
          { key: "ctr", label: "CTR", count: ctrPassed },
          { key: "price", label: "Цена", count: pricePassed },
          { key: "ctrcr1", label: "CTR x CR1", count: ctrCr1Passed },
          { key: "overall", label: "Итог", count: overallPassed },
        ],
      };
    })
    .filter(Boolean);
}

function abGetFunnelStageStyle(stageKey) {
  return AB_FUNNEL_STAGE_STYLES[stageKey] || { colorFrom: "#6B7280", colorTo: "#9CA3AF" };
}

function abStageMatches(test, stageKey) {
  switch (String(stageKey || "all")) {
    case "ctr":
      return abIsGoodStatus(test?.summaryChecks?.testCtr);
    case "price":
      return abIsGoodStatus(test?.summaryChecks?.testPrice);
    case "ctrcr1":
      return abIsGoodStatus(test?.summaryChecks?.testCtrCr1);
    case "overall":
      return abIsGoodStatus(test?.summaryChecks?.overall);
    case "all":
    default:
      return true;
  }
}

function abBuildTimelineMetricRow(label, beforeValue, duringValue, afterValue, formatter, options = {}) {
  const before = typeof formatter === "function" ? formatter(beforeValue) : "—";
  const during = duringValue === undefined || duringValue === null ? "—" : typeof formatter === "function" ? formatter(duringValue) : "—";
  const after = typeof formatter === "function" ? formatter(afterValue) : "—";
  const shouldCalculateDelta = options.deltaMode !== "none";
  const canCalculateDelta =
    shouldCalculateDelta && Number.isFinite(beforeValue) && Number.isFinite(afterValue) && Number(beforeValue) !== 0;
  const deltaValue = canCalculateDelta ? Number(afterValue) / Number(beforeValue) - 1 : null;
  const deltaText = Number.isFinite(deltaValue) ? abFormatSignedPercentFraction(deltaValue, 0) : "—";
  const deltaKind = Number.isFinite(deltaValue) ? (deltaValue > 0 ? "good" : deltaValue < 0 ? "bad" : "neutral") : "unknown";

  return {
    label,
    before,
    during,
    after,
    deltaText,
    deltaKind,
  };
}

function abCountPriceTransitions(...valuesRaw) {
  const values = valuesRaw.filter((value) => Number.isFinite(value));
  if (values.length < 2) {
    return 0;
  }
  let changes = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (Math.abs(Number(values[index]) - Number(values[index - 1])) > 0.0001) {
      changes += 1;
    }
  }
  return changes;
}

function renderAbCabinetFunnelDashboard(filteredTests) {
  const tests = Array.isArray(filteredTests) ? filteredTests : [];
  if (!tests.length) {
    return "";
  }

  const funnelCards = abBuildCabinetFunnelCards(tests);
  if (!funnelCards.length) {
    return "";
  }

  const cardsHtml = funnelCards
    .map((card) => {
      const stepsHtml = card.stages
        .map((stage) => {
          const style = abGetFunnelStageStyle(stage.key);
          const percent = card.total > 0 ? Math.round((stage.count / card.total) * 100) : 0;
          const isActive =
            abDashboardStore.filters.cabinet === card.cabinet && abDashboardStore.filters.stage === stage.key;
          return `<button type="button" class="ab-funnel-stage-row${isActive ? " is-active" : ""}" data-ab-action="cabinet-stage-filter" data-ab-cabinet="${abEscapeAttr(
            card.cabinet,
          )}" data-ab-stage="${abEscapeAttr(stage.key)}" aria-label="${abEscapeAttr(
            `${card.cabinet}: ${stage.label} — ${stage.count} из ${card.total}`,
          )}">
            <div class="ab-funnel-stage-top">
              <span class="ab-funnel-stage-name">${abEscapeHtml(stage.label)}</span>
              <span class="ab-funnel-stage-meta">${abEscapeHtml(abFormatInt(stage.count))} / ${abEscapeHtml(
                abFormatInt(card.total),
              )} · ${abEscapeHtml(String(percent))}%</span>
            </div>
            <div class="ab-funnel-stage-bar">
              <span class="ab-funnel-stage-bar-fill" style="--stage-from:${abEscapeAttr(style.colorFrom)}; --stage-to:${abEscapeAttr(
                style.colorTo,
              )}; width:${abEscapeAttr(String(percent))}%;"></span>
            </div>
          </button>`;
        })
        .join("");

      const finalCount = card.stages[card.stages.length - 1]?.count || 0;
      const finalPercent = card.total > 0 ? Math.round((finalCount / card.total) * 100) : 0;

      return `<article class="ab-funnel-card">
        <div class="ab-funnel-card-head">
          <div>
            <h4>${abEscapeHtml(card.cabinet)}</h4>
            <div class="ab-funnel-card-subtle">Успешных итоговых: ${abEscapeHtml(abFormatInt(finalCount))} из ${abEscapeHtml(
              abFormatInt(card.total),
            )}</div>
          </div>
          <span class="ab-status-pill is-good">${abEscapeHtml(String(finalPercent))}%</span>
        </div>
        <div class="ab-funnel-stage-list">${stepsHtml}</div>
      </article>`;
    })
    .join("");

  return `<section class="ab-funnel-dashboard">
    <div class="ab-funnel-dashboard-head">
      <div>
        <h3>Воронка удачных AB‑тестов по кабинетам</h3>
        <p class="subtle">Текущая выборка по выбранным фильтрам. Клик по этапу сразу отфильтрует тесты по кабинету и выбранной успешной проверке.</p>
      </div>
      <span class="ab-stat-chip">Кабинетов: <strong>${abEscapeHtml(abFormatInt(funnelCards.length))}</strong></span>
    </div>
    <div class="ab-funnel-grid">${cardsHtml}</div>
  </section>`;
}

function renderAbFilterToolbar(model, filteredTests) {
  const cabinets = Array.isArray(model?.cabinets) ? model.cabinets : [];
  const cabinetOptions = [`<option value="all">Все кабинеты</option>`]
    .concat(
      cabinets.map(
        (cabinet) =>
          `<option value="${abEscapeAttr(cabinet)}"${abDashboardStore.filters.cabinet === cabinet ? " selected" : ""}>${abEscapeHtml(
            cabinet,
          )}</option>`,
      ),
    )
    .join("");
  const limitOptions = AB_TEST_LIMIT_OPTIONS.map(
    (value) =>
      `<option value="${abEscapeAttr(String(value))}"${String(abDashboardStore.filters.limit) === String(value) ? " selected" : ""}>${abEscapeHtml(
        String(value),
      )}</option>`,
  ).join("");

  const totalTests = Array.isArray(model?.tests) ? model.tests.length : 0;
  const visibleTests = Array.isArray(filteredTests) ? filteredTests.length : 0;
  const testLimit = Math.max(1, Number(abDashboardStore.filters.limit) || AB_TEST_LIMIT_OPTIONS[0]);
  const shownTests = Math.min(visibleTests, testLimit);
  const filteredGood = filteredTests.filter((test) => test?.finalStatusKind === "good").length;
  const filteredBad = filteredTests.filter((test) => test?.finalStatusKind === "bad").length;
  const activeStageLabelMap = {
    ctr: "CTR",
    price: "Цена",
    ctrcr1: "CTR x CR1",
    overall: "Итог",
  };
  const activeStageLabel =
    abDashboardStore.filters.stage && abDashboardStore.filters.stage !== "all"
      ? activeStageLabelMap[abDashboardStore.filters.stage] || abDashboardStore.filters.stage
      : "";

  return `<section class="ab-toolbar-card">
    <div class="ab-toolbar-main">
      <label class="ab-toolbar-search">
        ${abRenderIcon("search", "ab-toolbar-search-icon") || ""}
        <input
          type="search"
          value="${abEscapeAttr(abDashboardStore.filters.search)}"
          placeholder="Поиск: test id, артикул, название"
          data-ab-filter="search"
        />
      </label>
      <label class="ab-toolbar-field">
        <select data-ab-filter="cabinet">${cabinetOptions}</select>
      </label>
      <label class="ab-toolbar-field">
        <select data-ab-filter="verdict">
          <option value="all"${abDashboardStore.filters.verdict === "all" ? " selected" : ""}>Все исходы</option>
          <option value="good"${abDashboardStore.filters.verdict === "good" ? " selected" : ""}>Хорошо</option>
          <option value="bad"${abDashboardStore.filters.verdict === "bad" ? " selected" : ""}>Плохо</option>
          <option value="unknown"${abDashboardStore.filters.verdict === "unknown" ? " selected" : ""}>Нет данных</option>
        </select>
      </label>
      <label class="ab-toolbar-field is-date">
        <input type="date" value="${abEscapeAttr(abDashboardStore.filters.dateFrom)}" data-ab-filter="dateFrom" />
      </label>
      <label class="ab-toolbar-field is-date">
        <input type="date" value="${abEscapeAttr(abDashboardStore.filters.dateTo)}" data-ab-filter="dateTo" />
      </label>
      <label class="ab-toolbar-field">
        <select data-ab-filter="limit">${limitOptions}</select>
      </label>
      <div class="ab-toolbar-actions">
        <div class="ab-view-switch" role="tablist" aria-label="Режим просмотра AB">
          <button type="button" class="ab-view-btn${abDashboardStore.filters.view === "tests" ? " is-active" : ""}" data-ab-view="tests">По тестам</button>
          <button type="button" class="ab-view-btn${abDashboardStore.filters.view === "products" ? " is-active" : ""}" data-ab-view="products">По товарам</button>
          <button type="button" class="ab-view-btn${abDashboardStore.filters.view === "both" ? " is-active" : ""}" data-ab-view="both">Оба вида</button>
        </div>
        <button type="button" class="btn" data-ab-action="reset-filters">Сбросить</button>
      </div>
    </div>
    <div class="ab-toolbar-stats">
      <span class="ab-stat-chip">Показано: <strong>${abEscapeHtml(abFormatInt(shownTests))}</strong> / ${abEscapeHtml(abFormatInt(visibleTests))}</span>
      <span class="ab-stat-chip">Всего тестов: <strong>${abEscapeHtml(abFormatInt(totalTests))}</strong></span>
      <span class="ab-stat-chip">Хорошо: <strong>${abEscapeHtml(abFormatInt(filteredGood))}</strong></span>
      <span class="ab-stat-chip">Плохо: <strong>${abEscapeHtml(abFormatInt(filteredBad))}</strong></span>
      ${
        activeStageLabel
          ? `<span class="ab-stat-chip">Этап: <strong>${abEscapeHtml(activeStageLabel)}</strong></span>`
          : ""
      }
    </div>
  </section>`;
}

function renderAbTestCard(test) {
  const matrixWidthPx = AB_MATRIX_METRIC_COL_WIDTH + test.variants.length * AB_MATRIX_VARIANT_COL_WIDTH;
  const testPeriodText = `${abFormatCompactPeriodDateTime(test.startedAtIso)} - ${abFormatCompactPeriodDateTime(test.endedAtIso)}`;
  const reportHtml = test.reportLines.length
    ? `<ul class="ab-tooltip-report-list">${test.reportLines
        .map((line) => `<li>${abEscapeHtml(line.replace(/^[-•]\s*/, ""))}</li>`)
        .join("")}</ul>`
    : '<div class="ab-tooltip-report-empty">Без текстового отчета.</div>';

  const checksHtml = [
    { label: "CTR", raw: test.summaryChecks.testCtr },
    { label: "Цена", raw: test.summaryChecks.testPrice },
    { label: "CTR x CR1", raw: test.summaryChecks.testCtrCr1 },
    { label: "Итог", raw: test.summaryChecks.overall },
  ]
    .map((item, index, list) => {
      const stepHtml = `<div class="ab-eval-step">${abStatusPill(item.raw, true, item.label)}</div>`;
      if (index === list.length - 1) {
        return stepHtml;
      }
      return `${stepHtml}<span class="ab-eval-step-separator" aria-hidden="true">→</span>`;
    })
    .join("");

  const variantsHeaderCells = test.variants
    .map(
      (variant) => `<th class="${variant.isBest ? "is-best" : ""}">Вариант ${variant.index}</th>`,
    )
    .join("");
  const imageCells = test.variants
    .map((variant) => {
      if (!variant.imageUrl) {
        return '<td><div class="ab-image-cell"><div class="ab-image-center"><div class="ab-image-placeholder">нет обложки</div></div></div></td>';
      }
      return `<td><div class="ab-image-cell"><div class="ab-image-center"><div class="ab-cover-frame${variant.isBest ? " is-best" : ""}">${
        variant.isBest ? '<span class="ab-variant-best-badge">Лучшая</span>' : ""
      }<a class="ab-cover-link${variant.isBest ? " is-best" : ""}" href="${abEscapeAttr(variant.imageUrl)}" target="_blank" rel="noopener noreferrer"><img src="${abEscapeAttr(
        variant.imageUrl,
      )}" alt="Обложка ${variant.index}" loading="lazy" decoding="async" /></a></div></div></div></td>`;
    })
    .join("");

  const viewsCells = test.variants.map((variant) => `<td>${abEscapeHtml(variant.views)}</td>`).join("");
  const clicksCells = test.variants.map((variant) => `<td>${abEscapeHtml(variant.clicks)}</td>`).join("");
  const ctrCells = test.variants
    .map((variant) => {
      const boostHtml =
        variant.ctrBoostText && variant.ctrBoostKind
          ? `<span class="ab-ctr-boost-pill is-${abEscapeAttr(variant.ctrBoostKind)}">${abEscapeHtml(variant.ctrBoostText)}</span>`
          : "";
      return `<td><div class="ab-ctr-cell"><span>${abEscapeHtml(variant.ctr)}</span>${boostHtml}</div></td>`;
    })
    .join("");
  const installCells = test.variants
    .map(
      (variant) => `<td><div class="ab-variant-install-time"><span>${abEscapeHtml(variant.installedAtDate)}</span><span>${abEscapeHtml(
        variant.installedAtTime || "—",
      )}</span></div></td>`,
    )
    .join("");
  const hoursCells = test.variants.map((variant) => `<td>${abEscapeHtml(variant.hours)}</td>`).join("");

  const comparisonRowsHtml = test.comparisonRows
    .map(
      (row) => `<tr>
      <td>${abEscapeHtml(row.label)}</td>
      <td>${abEscapeHtml(row.before)}</td>
      <td>${abEscapeHtml(row.during)}</td>
      <td>${abEscapeHtml(row.after)}</td>
      <td>${
        row.deltaText !== "—"
          ? `<span class="ab-delta-pill is-${abEscapeAttr(row.deltaKind)}">${abEscapeHtml(row.deltaText)}</span>`
          : '<span class="ab-delta-pill is-unknown">—</span>'
      }</td>
    </tr>`,
    )
    .join("");

  return `<article class="ab-test-card" data-test-id="${abEscapeAttr(test.testId)}">
    <header class="ab-test-head">
      <div class="ab-test-head-main">
        <div class="ab-test-head-top">
          <h4>Тест ${abEscapeHtml(test.testId)}</h4>
          <div class="ab-test-meta-row">
            <span class="ab-test-chip">Артикул: <strong>${abEscapeHtml(test.article || "—")}</strong></span>
            <span class="ab-test-chip">Тип РК: <strong>${abEscapeHtml(test.type || "—")}</strong></span>
            <span class="ab-test-chip">Кабинет: <strong>${abEscapeHtml(test.cabinet || "—")}</strong></span>
          </div>
        </div>
        <p class="ab-test-title" title="${abEscapeAttr(test.title)}">${abEscapeHtml(test.title || "—")}</p>
        <p class="ab-test-period">${abEscapeHtml(testPeriodText)}</p>
      </div>
      <div class="ab-test-head-side">
        <div class="ab-test-head-actions">
          <div class="ab-tooltip-anchor">
            <button type="button" class="ab-icon-btn ab-head-action-btn" aria-label="Показать отчет по расчетам">
              ${abRenderIcon("info", "ab-card-help-icon") || "i"}
            </button>
            <div class="ab-hover-tooltip" role="tooltip">
              <div class="ab-hover-tooltip-title">Отчет по расчетам</div>
              ${reportHtml}
            </div>
          </div>
          ${abSafeLink(test.xwayUrl, "XWay")}
          ${abSafeLink(test.wbUrl, "WB")}
        </div>
        <div class="ab-test-summary-row">${checksHtml}</div>
      </div>
    </header>

    <div class="ab-test-layout">
      <section class="ab-test-center">
        <div class="ab-matrix-wrap">
          <table class="ab-variant-matrix" style="width:${abEscapeAttr(String(matrixWidthPx))}px; min-width:${abEscapeAttr(String(matrixWidthPx))}px;">
            <colgroup>
              <col class="ab-matrix-col-metric" />
              ${test.variants.map(() => '<col class="ab-matrix-col-variant" />').join("")}
            </colgroup>
            <thead>
              <tr>
                <th>Метрика</th>
                ${variantsHeaderCells}
              </tr>
            </thead>
            <tbody>
              <tr class="is-image">
                <th>Обложка</th>
                ${imageCells}
              </tr>
              <tr>
                <th>Показы</th>
                ${viewsCells}
              </tr>
              <tr>
                <th>Клики</th>
                ${clicksCells}
              </tr>
              <tr>
                <th>CTR</th>
                ${ctrCells}
              </tr>
              <tr>
                <th>Время установки</th>
                ${installCells}
              </tr>
              <tr>
                <th>Время активности</th>
                ${hoursCells}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="ab-test-right">
        <article class="ab-side-card">
          <div class="ab-card-head">
            <h5>Метрики ДО / ВО ВРЕМЯ / ПОСЛЕ</h5>
            <span class="ab-side-card-note">Откл. цены: <strong>${abEscapeHtml(test.priceDeviationCount || "—")}</strong></span>
          </div>
          <table class="ab-mini-table is-tight">
            <thead>
              <tr><th>Метрика</th><th>До</th><th>Во время</th><th>После</th><th>Прирост</th></tr>
            </thead>
            <tbody>${comparisonRowsHtml || '<tr><td colspan="5">—</td></tr>'}</tbody>
          </table>
        </article>
      </section>
    </div>
  </article>`;
}

function renderAbTestsSection(tests) {
  if (!tests.length) {
    return `<article class="ab-table-card"><p class="ab-table-empty-row">Нет тестов под выбранные фильтры.</p></article>`;
  }
  return `<section class="ab-tests-list">${tests.map((test) => renderAbTestCard(test)).join("")}</section>`;
}

function renderAbProductsSection(products) {
  if (!products.length) {
    return "";
  }

  const rows = products
    .map((item) => {
      const testsList = item.tests
        .slice(0, 12)
        .map(
          (test) =>
            `<a class="ab-product-test-link" href="${abEscapeAttr(test.xwayUrl || "#")}" target="_blank" rel="noopener noreferrer" title="${abEscapeAttr(
              test.title,
            )}">#${abEscapeHtml(test.testId)}</a>`,
        )
        .join(" ");

      return `<tr>
      <td class="ab-col-id">${abEscapeHtml(item.article)}</td>
      <td class="ab-col-name" title="${abEscapeAttr(item.title)}">${abEscapeHtml(item.title || "—")}</td>
      <td>${abEscapeHtml(item.cabinets.join(", ") || "—")}</td>
      <td>${abEscapeHtml(abFormatInt(item.testsCount))}</td>
      <td><span class="ab-inline-status good">${abEscapeHtml(abFormatInt(item.good))}</span></td>
      <td><span class="ab-inline-status bad">${abEscapeHtml(abFormatInt(item.bad))}</span></td>
      <td>${abEscapeHtml(item.latestAt || "—")}</td>
      <td class="ab-product-tests-cell">${testsList || "—"}</td>
    </tr>`;
    })
    .join("");

  return `<article class="ab-table-card">
    <div class="ab-table-head">
      <h3>Товары и все проведенные AB‑тесты</h3>
      <span class="subtle">Группировка по артикулу</span>
    </div>
    <div class="ab-table-wrap">
      <table class="ab-table ab-products-table">
        <thead>
          <tr>
            <th>Артикул</th>
            <th>Название</th>
            <th>Кабинеты</th>
            <th>Тестов</th>
            <th>Хорошо</th>
            <th>Плохо</th>
            <th>Последний старт</th>
            <th>Тесты</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </article>`;
}

function abFilterTests(model) {
  const tests = Array.isArray(model?.tests) ? model.tests : [];
  const filters = abDashboardStore.filters;
  const search = String(filters.search || "").trim().toLowerCase();
  const cabinet = String(filters.cabinet || "all");
  const verdict = String(filters.verdict || "all");
  const stage = String(filters.stage || "all");
  const dateFrom = String(filters.dateFrom || "").trim();
  const dateTo = String(filters.dateTo || "").trim();

  return tests.filter((test) => {
    if (cabinet !== "all" && test.cabinet !== cabinet) {
      return false;
    }
    if (verdict !== "all" && test.finalStatusKind !== verdict) {
      return false;
    }
    if (stage !== "all" && !abStageMatches(test, stage)) {
      return false;
    }
    const testDate = abGetTestFilterDate(test);
    if (dateFrom && (!testDate || testDate < dateFrom)) {
      return false;
    }
    if (dateTo && (!testDate || testDate > dateTo)) {
      return false;
    }
    if (!search) {
      return true;
    }
    const haystack = [test.testId, test.article, test.title, test.cabinet, test.type].join(" ").toLowerCase();
    return haystack.includes(search);
  });
}

function abBuildProductsFromFilteredTests(filteredTests) {
  return abBuildProducts(filteredTests);
}

function renderAbDashboardContent() {
  const contentEl = getAbDashboardContentEl();
  const metaEl = getAbDashboardMetaEl();
  if (!contentEl) {
    return;
  }

  if (abDashboardStore.loading) {
    contentEl.innerHTML = `<div class="ab-tests-state-card">
      <span class="ab-tests-state-spinner" aria-hidden="true"></span>
      <span>Загружаю AB-выгрузки и пересчитываю тесты…</span>
    </div>`;
    return;
  }

  if (abDashboardStore.error) {
    contentEl.innerHTML = `<div class="ab-tests-state-card is-error">
      <p>${abEscapeHtml(abDashboardStore.error)}</p>
      <p class="subtle">Проверьте доступ к Google Sheets и нажмите «Обновить данные».</p>
    </div>`;
    return;
  }

  const model = abDashboardStore.data;
  if (!model) {
    contentEl.innerHTML = `<div class="ab-tests-state-card"><span>Нет данных для AB‑дашборда.</span></div>`;
    return;
  }

  if (metaEl) {
    const fetchedLabel = abDashboardStore.fetchedAt ? formatDateTime(abDashboardStore.fetchedAt) : "-";
    metaEl.textContent = abBuildSourceMetaText(fetchedLabel);
  }

  const filteredTests = abFilterTests(model);
  const testLimit = Math.max(1, Number(abDashboardStore.filters.limit) || AB_TEST_LIMIT_OPTIONS[0]);
  const limitedTests = filteredTests.slice(0, testLimit);
  const filteredProducts = abBuildProductsFromFilteredTests(filteredTests);

  const sourceRowsLabel = `Строк в подложке: ${abFormatInt(model.rowCounts.catalog)} · строк в техвыгрузке: ${abFormatInt(
    model.rowCounts.technical,
  )} · строк в результатах обложек: ${abFormatInt(model.rowCounts.results)}`;

  const showTests = abDashboardStore.filters.view === "tests" || abDashboardStore.filters.view === "both";
  const showProducts = abDashboardStore.filters.view === "products" || abDashboardStore.filters.view === "both";

  contentEl.innerHTML = `
    ${renderAbFilterToolbar(model, filteredTests)}
    <div class="ab-source-line">${abEscapeHtml(sourceRowsLabel)}</div>
    ${renderAbCabinetFunnelDashboard(filteredTests)}
    ${showTests ? renderAbTestsSection(limitedTests) : ""}
    ${showProducts ? renderAbProductsSection(filteredProducts) : ""}
  `;
  document.dispatchEvent(new CustomEvent("ab:content-render"));
}

function bindAbDashboardEvents() {
  if (abDashboardStore.listenersBound) {
    return;
  }
  const contentEl = getAbDashboardContentEl();
  if (!contentEl) {
    return;
  }

  contentEl.addEventListener("input", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const filterName = target.getAttribute("data-ab-filter");
    if (filterName === "search" && target instanceof HTMLInputElement) {
      abDashboardStore.filters.search = target.value || "";
      renderAbDashboardContent();
      return;
    }
    if ((filterName === "dateFrom" || filterName === "dateTo") && target instanceof HTMLInputElement) {
      abDashboardStore.filters[filterName] = target.value || "";
      renderAbDashboardContent();
    }
  });

  contentEl.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const filterName = target.getAttribute("data-ab-filter");
    if (!filterName) {
      return;
    }

    if (filterName === "cabinet" || filterName === "verdict" || filterName === "limit") {
      if (target instanceof HTMLSelectElement) {
        abDashboardStore.filters[filterName] =
          filterName === "limit" ? String(target.value || AB_TEST_LIMIT_OPTIONS[0]) : target.value || "all";
        renderAbDashboardContent();
      }
      return;
    }

    if ((filterName === "dateFrom" || filterName === "dateTo") && target instanceof HTMLInputElement) {
      abDashboardStore.filters[filterName] = target.value || "";
      renderAbDashboardContent();
    }
  });

  contentEl.addEventListener("click", (event) => {
    const actionTarget = event.target instanceof Element ? event.target.closest("[data-ab-action]") : null;
    if (actionTarget) {
      const action = String(actionTarget.getAttribute("data-ab-action") || "");
      if (action === "reset-filters") {
        abDashboardStore.filters = abCreateDefaultFilters();
        renderAbDashboardContent();
        return;
      }
      if (action === "cabinet-stage-filter") {
        const cabinet = String(actionTarget.getAttribute("data-ab-cabinet") || "all");
        const stage = String(actionTarget.getAttribute("data-ab-stage") || "all");
        const isSame =
          abDashboardStore.filters.cabinet === cabinet && abDashboardStore.filters.stage === stage && abDashboardStore.filters.view === "tests";
        if (isSame) {
          abDashboardStore.filters.cabinet = "all";
          abDashboardStore.filters.stage = "all";
        } else {
          abDashboardStore.filters.cabinet = cabinet || "all";
          abDashboardStore.filters.stage = stage || "all";
          abDashboardStore.filters.verdict = "all";
          abDashboardStore.filters.view = "tests";
        }
        renderAbDashboardContent();
        return;
      }
    }

    const target = event.target instanceof Element ? event.target.closest("[data-ab-view]") : null;
    if (!target) {
      return;
    }
    const nextView = String(target.getAttribute("data-ab-view") || "");
    if (!nextView || nextView === abDashboardStore.filters.view) {
      return;
    }
    if (!["tests", "products", "both"].includes(nextView)) {
      return;
    }
    abDashboardStore.filters.view = nextView;
    renderAbDashboardContent();
  });

  abDashboardStore.listenersBound = true;
}

async function loadAbDashboardData(options = {}) {
  const force = options && options.force === true;
  if (abDashboardStore.loading) {
    return abDashboardStore.promise;
  }
  if (!force && abDashboardStore.loaded && abDashboardStore.data) {
    renderAbDashboardContent();
    return abDashboardStore.data;
  }

  bindAbDashboardEvents();
  abDashboardStore.loading = true;
  abDashboardStore.error = "";
  renderAbDashboardContent();

  const request = Promise.all([
    fetchAbSheetRaw(AB_DASHBOARD_SOURCE_SHEETS.catalog),
    fetchAbSheetRaw(AB_DASHBOARD_SOURCE_SHEETS.technical),
    fetchAbSheetRaw(AB_DASHBOARD_SOURCE_SHEETS.results),
  ])
    .then(([catalog, technical, results]) => {
      const model = buildAbDashboardModel({ catalog, technical, results });
      abDashboardStore.loaded = true;
      abDashboardStore.data = model;
      abDashboardStore.fetchedAt = new Date().toISOString();
      abDashboardStore.error = "";
      return model;
    })
    .catch((error) => {
      abDashboardStore.error = error?.message ? String(error.message) : "Не удалось загрузить AB‑данные.";
      throw error;
    })
    .finally(() => {
      abDashboardStore.loading = false;
      abDashboardStore.promise = null;
      renderAbDashboardContent();
    });

  abDashboardStore.promise = request;
  return request;
}

async function ensureAbDashboardLoaded(options = {}) {
  try {
    await loadAbDashboardData(options);
  } catch {
    // Ошибка уже отрисована в контенте
  }
}

async function refreshAbDashboardData() {
  await ensureAbDashboardLoaded({ force: true });
}

function isAbDashboardLoading() {
  return abDashboardStore.loading === true;
}

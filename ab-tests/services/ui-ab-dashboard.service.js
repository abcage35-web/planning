const AB_DASHBOARD_SHEET_ID = "1ot5SxsmAl717cuvQbbXr1dVx1FQ99HTTzN1sG5z_RIc";
const AB_DASHBOARD_FETCH_TIMEOUT_MS = 32000;
const AB_FILTER_DATE_FROM_DEFAULT = "2025-01-01";
const AB_DASHBOARD_SOURCE_SHEETS = Object.freeze({
  catalog: "(*) Подложка",
  technical: "(*) Техническая выгрузка",
  results: "(*) Результаты по обложкам XWAY",
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
    second: "2-digit",
  }).format(new Date(iso));
}

function abFormatVariantDateTime(valueRaw) {
  const iso = typeof valueRaw === "string" && valueRaw.includes("T") ? valueRaw : abParseDateLiteral(valueRaw);
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${String(date.getFullYear()).slice(-2)}\n${pad(date.getHours())}:${pad(
    date.getMinutes(),
  )}:${pad(date.getSeconds())}`;
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

function abStatusPill(rawValue, compact = false) {
  const raw = String(rawValue || "").trim();
  const kind = abNormalizeStatus(raw);
  const label = abStatusLabel(kind);
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

async function fetchAbSheetRaw(sheetName) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${AB_DASHBOARD_SHEET_ID}/gviz/tq`);
  url.searchParams.set("sheet", sheetName);
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

function abResolvePriceDecisionRaw(priceDuringDelta, priceAfterDelta) {
  const deltas = [priceDuringDelta, priceAfterDelta].filter((value) => Number.isFinite(value));
  if (!deltas.length) {
    return "?";
  }
  return Math.min(...deltas) < -0.06 ? "LOOSE" : "WIN";
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
      installedAt: item.installedAt ? abFormatVariantDateTime(item.installedAt) : "—",
      hours: Number.isFinite(hoursValue) && hoursValue >= 0 ? abFormatHours(hoursValue) : "—",
    };
  });

  if (prepared.length) {
    return prepared;
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
      installedAt: "—",
      hours: "—",
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
  const priceDeltaBefore = abToNumber(abCellRaw(sourceRow, "Z"));
  const priceDeltaDuring =
    Number.isFinite(priceBefore) && priceBefore !== 0 && Number.isFinite(priceDuring) ? priceDuring / priceBefore - 1 : abToNumber(abCellRaw(sourceRow, "AA"));
  const priceDeltaAfter =
    Number.isFinite(priceDuring) && priceDuring !== 0 && Number.isFinite(priceAfter) ? priceAfter / priceDuring - 1 : abToNumber(abCellRaw(sourceRow, "AB"));

  const priceDecisionRaw = abResolvePriceDecisionRaw(priceDeltaDuring, priceDeltaAfter);
  const ctrDecisionRaw = abResolveCtrDecisionRaw(boostCtr);
  const ctrCr1DecisionRaw = abResolveCtrCr1DecisionRaw(boostCtrCr1);
  const overallDecisionRaw =
    ctrDecisionRaw === "WIN" && ctrCr1DecisionRaw === "WIN" && priceDecisionRaw === "WIN" ? "WIN" : "LOOSE";
  const priceDeltas = [priceDeltaDuring, priceDeltaAfter].filter((value) => Number.isFinite(value));
  const minPriceDelta = priceDeltas.length ? Math.min(...priceDeltas) : null;
  const maxPriceDelta = priceDeltas.length ? Math.max(0, ...priceDeltas) : null;

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

  const priceStages = [
    {
      key: "before",
      label: "До",
      averagePrice: abFormatInt(metricsBlock.priceBefore),
      delta: abFormatFractionToPercent(metricsBlock.priceDeltaBefore, 0),
    },
    {
      key: "during",
      label: "Во время",
      averagePrice: abFormatInt(metricsBlock.priceDuring),
      delta: abFormatFractionToPercent(metricsBlock.priceDeltaDuring, 0),
    },
    {
      key: "after",
      label: "После",
      averagePrice: abFormatInt(metricsBlock.priceAfter),
      delta: abFormatFractionToPercent(metricsBlock.priceDeltaAfter, 0),
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

  const funnelRows = [
    { label: "CTR", before: abFormatFractionToPercent(metricsBlock.ctrBefore, 2), after: abFormatFractionToPercent(metricsBlock.ctrAfter, 2) },
    { label: "CR1", before: abFormatFractionToPercent(metricsBlock.cr1Before, 2), after: abFormatFractionToPercent(metricsBlock.cr1After, 2) },
    { label: "CR2", before: abFormatFractionToPercent(metricsBlock.cr2Before, 2), after: abFormatFractionToPercent(metricsBlock.cr2After, 2) },
    {
      label: "CTR*CR1",
      before: abFormatFractionToPercent(metricsBlock.ctrCr1Before, 2),
      after: abFormatFractionToPercent(metricsBlock.ctrCr1After, 2),
    },
    { label: "OCR*100", before: abFormatPlainNumber(ocrBefore), after: abFormatPlainNumber(ocrAfter) },
  ];

  const reportLines = abBuildComputedReportLines(metricsBlock);
  const finalMetric = metrics[metrics.length - 1];

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
    finalStatusRaw: finalMetric?.statusRaw || "",
    finalStatusKind: finalMetric?.statusKind || "unknown",
    summaryChecks: {
      testPrice: metricsBlock.priceDecisionRaw,
      resultOk: metricsBlock.ctrDecisionRaw,
      testCtrCr1: metricsBlock.ctrCr1DecisionRaw,
      resultOvr: metricsBlock.overallDecisionRaw,
    },
    variants,
    priceDeviationCount: abFormatInt(abToNumber(abCellRaw(sourceRow, "Y"))),
    priceStages,
    funnelRows,
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
  return `<a class="ab-link" href="${abEscapeAttr(url)}" target="_blank" rel="noopener noreferrer">${icon}<span>${abEscapeHtml(
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

  const totalTests = Array.isArray(model?.tests) ? model.tests.length : 0;
  const visibleTests = Array.isArray(filteredTests) ? filteredTests.length : 0;

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
      <span class="ab-stat-chip">Тестов: <strong>${abEscapeHtml(abFormatInt(visibleTests))}</strong> / ${abEscapeHtml(abFormatInt(totalTests))}</span>
      <span class="ab-stat-chip">Хорошо: <strong>${abEscapeHtml(abFormatInt(model?.statusTotals?.good || 0))}</strong></span>
      <span class="ab-stat-chip">Плохо: <strong>${abEscapeHtml(abFormatInt(model?.statusTotals?.bad || 0))}</strong></span>
    </div>
  </section>`;
}

function renderAbTestCard(test) {
  const reportHtml = test.reportLines.length
    ? `<ul class="ab-report-list">${test.reportLines
        .map((line) => `<li>${abEscapeHtml(line.replace(/^[-•]\s*/, ""))}</li>`)
        .join("")}</ul>`
    : "<p class=\"subtle\">Без текстового отчета.</p>";

  const checksHtml = [
    { label: "Тест изм. цены", raw: test.summaryChecks.testPrice },
    { label: "ИТОГ ОК", raw: test.summaryChecks.resultOk },
    { label: "Тест CTR*CR1", raw: test.summaryChecks.testCtrCr1 },
    { label: "ИТОГ ОВР", raw: test.summaryChecks.resultOvr },
  ]
    .map(
      (item) => `<div class="ab-check-pill"><span>${abEscapeHtml(item.label)}</span>${abStatusPill(item.raw, true)}</div>`,
    )
    .join("");

  const metricsHtml = test.metrics
    .map(
      (item) => `<tr>
      <td>${abEscapeHtml(item.label)}</td>
      <td class="ab-metric-value">${abEscapeHtml(item.valueText)}</td>
      <td>${abStatusPill(item.statusRaw, true)}</td>
    </tr>`,
    )
    .join("");

  const variantsHeaderCells = test.variants.map((variant) => `<th>Вариант ${variant.index}</th>`).join("");
  const imageCells = test.variants
    .map((variant) => {
      if (!variant.imageUrl) {
        return '<td><div class="ab-image-placeholder">нет обложки</div></td>';
      }
      return `<td><a class="ab-cover-link" href="${abEscapeAttr(variant.imageUrl)}" target="_blank" rel="noopener noreferrer"><img src="${abEscapeAttr(
        variant.imageUrl,
      )}" alt="Обложка ${variant.index}" loading="lazy" decoding="async" /></a></td>`;
    })
    .join("");

  const viewsCells = test.variants.map((variant) => `<td>${abEscapeHtml(variant.views)}</td>`).join("");
  const clicksCells = test.variants.map((variant) => `<td>${abEscapeHtml(variant.clicks)}</td>`).join("");
  const ctrCells = test.variants.map((variant) => `<td>${abEscapeHtml(variant.ctr)}</td>`).join("");
  const installCells = test.variants.map((variant) => `<td>${abEscapeHtml(variant.installedAt)}</td>`).join("");
  const hoursCells = test.variants.map((variant) => `<td>${abEscapeHtml(variant.hours)}</td>`).join("");

  const priceStagesHtml = (test.priceStages || [])
    .map(
      (stage) => `<section class="ab-price-stage-col" data-stage="${abEscapeAttr(stage.key)}">
      <div class="ab-price-stage-label">${abEscapeHtml(stage.label)}</div>
      <div class="ab-price-stage-item">
        <span>Средняя цена</span>
        <strong>${abEscapeHtml(stage.averagePrice)}</strong>
      </div>
      <div class="ab-price-stage-item">
        <span>Изм. от среднего</span>
        <strong>${abEscapeHtml(stage.delta)}</strong>
      </div>
    </section>`,
    )
    .join("");

  const funnelRowsHtml = test.funnelRows
    .map(
      (row) => `<tr>
      <td>${abEscapeHtml(row.label)}</td>
      <td>${abEscapeHtml(row.before)}</td>
      <td>${abEscapeHtml(row.after)}</td>
    </tr>`,
    )
    .join("");

  return `<article class="ab-test-card" data-test-id="${abEscapeAttr(test.testId)}">
    <header class="ab-test-head">
      <div class="ab-test-head-main">
        <h4>Тест ${abEscapeHtml(test.testId)}</h4>
        <p class="ab-test-title" title="${abEscapeAttr(test.title)}">${abEscapeHtml(test.title || "—")}</p>
        <div class="ab-test-meta-row">
          <span class="ab-test-chip">Артикул: <strong>${abEscapeHtml(test.article || "—")}</strong></span>
          <span class="ab-test-chip">Тип РК: <strong>${abEscapeHtml(test.type || "—")}</strong></span>
          <span class="ab-test-chip">Кабинет: <strong>${abEscapeHtml(test.cabinet || "—")}</strong></span>
          <span class="ab-test-chip">Старт: <strong>${abEscapeHtml(test.startedAt || "—")}</strong></span>
          <span class="ab-test-chip">Финиш: <strong>${abEscapeHtml(test.endedAt || "—")}</strong></span>
        </div>
      </div>
      <div class="ab-test-head-actions">
        ${abSafeLink(test.xwayUrl, "XWay")}
        ${abSafeLink(test.wbUrl, "WB")}
        ${abStatusPill(test.finalStatusRaw)}
      </div>
    </header>

    <div class="ab-test-layout">
      <section class="ab-test-left">
        <div class="ab-checks-grid">${checksHtml}</div>
        <div class="ab-metrics-card">
          <h5>Сводка метрик</h5>
          <table class="ab-mini-table">
            <thead>
              <tr><th>Показатель</th><th>Значение</th><th>Итог</th></tr>
            </thead>
            <tbody>${metricsHtml}</tbody>
          </table>
        </div>
        <div class="ab-report-card">
          <h5>Отчет по расчетам</h5>
          ${reportHtml}
        </div>
      </section>

      <section class="ab-test-center">
        <div class="ab-matrix-wrap">
          <table class="ab-variant-matrix">
            <thead>
              <tr>
                <th>Метрика</th>
                ${variantsHeaderCells}
              </tr>
            </thead>
            <tbody>
              <tr class="is-image">
                <th>IMAGE</th>
                ${imageCells}
              </tr>
              <tr>
                <th>VIEW</th>
                ${viewsCells}
              </tr>
              <tr>
                <th>CLICK</th>
                ${clicksCells}
              </tr>
              <tr>
                <th>CTR</th>
                ${ctrCells}
              </tr>
              <tr>
                <th>Установка (Дата / Время)</th>
                ${installCells}
              </tr>
              <tr>
                <th>Часы работы обложки</th>
                ${hoursCells}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="ab-test-right">
        <article class="ab-side-card ab-price-stage-card">
          <div class="ab-price-stage-head">
            <h5>Цена</h5>
            <span class="ab-test-chip">Откл. цены: <strong>${abEscapeHtml(test.priceDeviationCount || "—")}</strong></span>
          </div>
          <div class="ab-price-stage-grid">
            ${priceStagesHtml || '<div class="ab-price-stage-empty">Нет данных по этапам цены.</div>'}
          </div>
        </article>

        <article class="ab-side-card">
          <h5>Воронка ДО / ПОСЛЕ</h5>
          <table class="ab-mini-table is-tight">
            <thead>
              <tr><th>Метрика</th><th>До</th><th>После</th></tr>
            </thead>
            <tbody>${funnelRowsHtml || '<tr><td colspan="3">—</td></tr>'}</tbody>
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
  const dateFrom = String(filters.dateFrom || "").trim();
  const dateTo = String(filters.dateTo || "").trim();

  return tests.filter((test) => {
    if (cabinet !== "all" && test.cabinet !== cabinet) {
      return false;
    }
    if (verdict !== "all" && test.finalStatusKind !== verdict) {
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
    metaEl.textContent = `Источники: (*) Подложка, (*) Техническая выгрузка, (*) Результаты по обложкам XWAY. Обновлено: ${fetchedLabel}`;
  }

  const filteredTests = abFilterTests(model);
  const filteredProducts = abBuildProductsFromFilteredTests(filteredTests);

  const sourceRowsLabel = `Строк в подложке: ${abFormatInt(model.rowCounts.catalog)} · строк в техвыгрузке: ${abFormatInt(
    model.rowCounts.technical,
  )} · строк в результатах обложек: ${abFormatInt(model.rowCounts.results)}`;

  const showTests = abDashboardStore.filters.view === "tests" || abDashboardStore.filters.view === "both";
  const showProducts = abDashboardStore.filters.view === "products" || abDashboardStore.filters.view === "both";

  contentEl.innerHTML = `
    ${renderAbFilterToolbar(model, filteredTests)}
    <div class="ab-source-line">${abEscapeHtml(sourceRowsLabel)}</div>
    ${showTests ? renderAbTestsSection(filteredTests) : ""}
    ${showProducts ? renderAbProductsSection(filteredProducts) : ""}
  `;
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

    if (filterName === "cabinet" || filterName === "verdict") {
      if (target instanceof HTMLSelectElement) {
        abDashboardStore.filters[filterName] = target.value || "all";
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

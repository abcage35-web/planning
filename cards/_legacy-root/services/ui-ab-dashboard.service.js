const AB_DASHBOARD_SHEET_ID = "ARCHIVED_LEGACY_SOURCE_REMOVED";
const AB_DASHBOARD_FETCH_TIMEOUT_MS = 32000;
const AB_DASHBOARD_SHEETS = Object.freeze({
  summary: "ARCHIVED_LEGACY_SOURCE_REMOVED",
  results: "ARCHIVED_LEGACY_SOURCE_REMOVED",
});
const AB_VARIANT_COLS = Object.freeze(["Y", "Z", "AA", "AB", "AC", "AD", "AE", "AF", "AG", "AH"]);
const AB_STATUS_MAP = Object.freeze({
  WIN: "good",
  GOOD: "good",
  LOOSE: "bad",
  LOSE: "bad",
  BAD: "bad",
  AUTO: "auto",
  "АВТО": "auto",
  NORMAL: "neutral",
  "НОРМ": "neutral",
  "?": "unknown",
});

const abDashboardStore = {
  loading: false,
  loaded: false,
  error: "",
  fetchedAt: null,
  data: null,
  promise: null,
  filters: {
    search: "",
    cabinet: "all",
    verdict: "all",
    view: "tests",
  },
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

function abParseSummaryDateTime(valueRaw) {
  const value = String(valueRaw || "").trim();
  if (!value) {
    return "";
  }
  if (/^\d{4}-\d{2}-\d{2}\s*\n\s*\d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.replace(/\s*\n\s*/, " ");
  }
  const parts = value.split(/\s*\n\s*/);
  if (parts.length >= 2 && /^\d{4}-\d{2}-\d{2}$/.test(parts[0])) {
    return `${parts[0]} ${parts[1]}`;
  }
  const asIso = abParseDateLiteral(value);
  if (!asIso) {
    return value;
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(asIso));
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
  if (key.includes("АВТО") || key.includes("AUTO")) {
    return "auto";
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
    case "auto":
      return "Авто";
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

function abCellDisplay(row, id, options = {}) {
  const cell = abCell(row, id);
  const formatted = String(cell.f || "").trim();
  if (formatted) {
    return formatted;
  }

  const value = cell.v;
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const valueType = options.type || "text";
  if (valueType === "percent-fraction") {
    return abFormatFractionToPercent(value, options.digits ?? 2);
  }
  if (valueType === "percent-signed-fraction") {
    return abFormatSignedPercentFraction(value, options.digits ?? 0);
  }
  if (valueType === "hours") {
    return abFormatHours(value);
  }
  if (valueType === "int") {
    return abFormatInt(value);
  }

  if (typeof value === "number") {
    return abFormatInt(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "—";
    }
    const parsedDate = abParseDateLiteral(trimmed);
    if (parsedDate) {
      return new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(parsedDate));
    }
    return trimmed;
  }

  return String(value);
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

    const shouldInclude = Boolean(installedAt || views > 0 || clicks > 0);
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

function abExtractOverview(summarySheet) {
  const rows = Array.isArray(summarySheet?.rows) ? summarySheet.rows : [];
  const overviewRows = [];
  let headerRow = null;

  for (const row of rows) {
    const colC = abCellText(row, "C");
    if (colC === "Ссылка на XWay") {
      headerRow = row;
      break;
    }

    const testId = abNormalizeTestId(abCellRaw(row, "B"));
    if (testId) {
      continue;
    }

    const summaryLabel = abCellText(row, "L");
    const metricTotal = abCellText(row, "M");
    if (!summaryLabel && !metricTotal) {
      continue;
    }

    overviewRows.push({
      date: abCellText(row, "C") || "—",
      label: summaryLabel || "—",
      colM: metricTotal || "—",
      colN: abCellText(row, "N") || "—",
      colO: abCellText(row, "O") || "—",
      colP: abCellText(row, "P") || "—",
      colQ: abCellText(row, "Q") || "—",
      colS: abCellText(row, "S") || "—",
    });
  }

  const header = {
    colM: abCellText(headerRow, "M") || "Тест изм. цены",
    colN: abCellText(headerRow, "N") || "ИТОГ ОК",
    colO: abCellText(headerRow, "O") || "Тест CTR*CR1",
    colP: abCellText(headerRow, "P") || "ИТОГ ОВР",
    colQ: abCellText(headerRow, "Q") || "Ручная",
    colS: abCellText(headerRow, "S") || "Итог",
  };

  return { overviewRows, header };
}

function abFindHeaderRowIndex(summaryRows) {
  for (let i = 0; i < summaryRows.length; i += 1) {
    if (abCellText(summaryRows[i], "C") === "Ссылка на XWay") {
      return i;
    }
  }
  return -1;
}

function abBuildTestCards(summarySheet, resultsByTest) {
  const summaryRows = Array.isArray(summarySheet?.rows) ? summarySheet.rows : [];
  const startIndex = Math.max(0, abFindHeaderRowIndex(summaryRows) + 1);
  const rows = summaryRows.slice(startIndex).filter((row) => abNormalizeTestId(abCellRaw(row, "B")));

  const grouped = [];
  let current = null;
  for (const row of rows) {
    const testId = abNormalizeTestId(abCellRaw(row, "B"));
    if (!testId) {
      continue;
    }
    if (!current || current.testId !== testId) {
      current = { testId, rows: [] };
      grouped.push(current);
    }
    current.rows.push(row);
  }

  const cards = [];

  for (const group of grouped) {
    const testId = group.testId;
    const rows6 = group.rows.slice(0, 6);
    if (rows6.length < 2) {
      continue;
    }

    const base = rows6[0];
    const viewRow = rows6.find((row) => String(abCellText(row, "X")).toUpperCase() === "VIEW") || rows6[1] || base;
    const clickRow = rows6.find((row) => String(abCellText(row, "X")).toUpperCase() === "CLICK") || rows6[2] || base;
    const ctrRow = rows6.find((row) => String(abCellText(row, "X")).toUpperCase() === "CTR") || rows6[3] || base;
    const installRow = rows6.find((row) => String(abCellText(row, "X")).toLowerCase().includes("установка")) || rows6[4] || base;
    const hoursRow = rows6.find((row) => String(abCellText(row, "X")).toLowerCase().includes("часы")) || rows6[5] || base;

    const metrics = rows6
      .map((row) => {
        const label = abCellText(row, "U");
        const statusRaw = abCellText(row, "T");
        const valueCell = abCell(row, "V");
        const valueText = String(valueCell.f || "").trim() || (() => {
          const valueRaw = valueCell.v;
          if (typeof valueRaw !== "number") {
            return abCellDisplay(row, "V");
          }
          if (/CTR/i.test(label)) {
            return abFormatFractionToPercent(valueRaw, 2);
          }
          return abFormatInt(valueRaw);
        })();
        return {
          checkName: abCellText(row, "S"),
          label,
          valueText,
          statusRaw,
          statusKind: abNormalizeStatus(statusRaw),
        };
      })
      .filter((item) => item.label);

    const finalMetric = metrics.find((item) => String(item.checkName).toUpperCase() === "ИТОГ") || metrics[metrics.length - 1] || null;

    const resultVariants = Array.isArray(resultsByTest.get(testId)) ? resultsByTest.get(testId) : [];

    const summaryVariantCount = AB_VARIANT_COLS.reduce((max, col) => {
      const hasAny = [viewRow, clickRow, ctrRow, hoursRow].some((row) => {
        const value = abCellRaw(row, col);
        return value !== null && value !== undefined && String(value).trim() !== "";
      });
      return hasAny ? max + 1 : max;
    }, 0);

    const variantCount = Math.max(summaryVariantCount, resultVariants.length, 1);

    const variants = [];
    for (let i = 0; i < variantCount; i += 1) {
      const col = AB_VARIANT_COLS[i];
      const result = resultVariants[i] || null;
      const installedText = result?.installedLabel || (installRow && col ? abCellDisplay(installRow, col) : "—");
      variants.push({
        index: i + 1,
        imageUrl: result?.coverUrl || "",
        views: col ? abCellDisplay(viewRow, col, { type: "int" }) : "—",
        clicks: col ? abCellDisplay(clickRow, col, { type: "int" }) : "—",
        ctr: col ? abCellDisplay(ctrRow, col, { type: "percent-fraction", digits: 2 }) : "—",
        installedAt: installedText || "—",
        hours: col ? abCellDisplay(hoursRow, col, { type: "hours" }) : "—",
      });
    }

    const priceRows = rows6
      .slice(0, 4)
      .map((row) => {
        const label = abCellText(row, "AJ");
        const value = abCellDisplay(row, "AK", { type: "int" });
        if (!label) {
          return null;
        }
        return { label, value };
      })
      .filter(Boolean);

    const priceDeltaRows = rows6
      .slice(0, 4)
      .map((row) => {
        const label = abCellText(row, "AL");
        if (!label) {
          return null;
        }
        const cell = abCell(row, "AM");
        const value = String(cell.f || "").trim() || abCellDisplay(row, "AM", { type: "percent-signed-fraction", digits: 0 });
        return { label, value };
      })
      .filter(Boolean);

    const funnelRows = [];
    const usedFunnel = new Set();
    for (const row of rows6) {
      const metricLabel = abCellText(row, "AO") || abCellText(row, "AS");
      if (!metricLabel || usedFunnel.has(metricLabel)) {
        continue;
      }
      const before = abCellDisplay(row, "AP", { type: "percent-fraction", digits: 2 });
      const after = abCellDisplay(row, "AQ", { type: "percent-fraction", digits: 2 });
      if (before === "—" && after === "—") {
        continue;
      }
      usedFunnel.add(metricLabel);
      funnelRows.push({ label: metricLabel, before, after });
    }

    const reportText = String(abCellText(base, "L") || "").trim();
    const reportLines = reportText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);

    const startedAt = abParseSummaryDateTime(abCellRaw(base, "J"));
    const endedAt = abParseSummaryDateTime(abCellRaw(base, "K"));

    cards.push({
      testId,
      xwayUrl: String(abCellText(base, "C") || "").trim(),
      wbUrl: String(abCellText(base, "G") || "").trim(),
      article: String(abCellText(base, "F") || "").trim(),
      title: String(abCellText(base, "D") || "").trim(),
      type: String(abCellText(base, "E") || "").trim(),
      cabinet: String(abCellText(base, "H") || "").trim(),
      startedAt,
      endedAt,
      metrics,
      finalStatusRaw: finalMetric?.statusRaw || "",
      finalStatusKind: finalMetric?.statusKind || "unknown",
      summaryChecks: {
        testPrice: abCellText(base, "M"),
        resultOk: abCellText(base, "N"),
        testCtrCr1: abCellText(base, "O"),
        resultOvr: abCellText(base, "P"),
        manual: abCellText(base, "Q"),
      },
      variants,
      priceRows,
      priceDeltaRows,
      funnelRows,
      reportLines,
      reportText,
    });
  }

  cards.sort((a, b) => {
    const aMs = a.startedAt ? new Date(a.startedAt).getTime() : 0;
    const bMs = b.startedAt ? new Date(b.startedAt).getTime() : 0;
    if (aMs !== bMs) {
      return bMs - aMs;
    }
    return Number(b.testId || 0) - Number(a.testId || 0);
  });

  return cards;
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
        title: test.title,
        type: test.type,
        cabinetSet: new Set(),
        tests: [],
        good: 0,
        bad: 0,
        auto: 0,
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
    } else if (test.finalStatusKind === "auto") {
      item.auto += 1;
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
      auto: item.auto,
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
  const summary = source?.summary;
  const results = source?.results;

  const overview = abExtractOverview(summary);
  const resultsByTest = abParseResultIndex(results);
  const tests = abBuildTestCards(summary, resultsByTest);
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
    { good: 0, bad: 0, auto: 0, neutral: 0, unknown: 0 },
  );

  return {
    tests,
    products,
    overview,
    cabinets,
    statusTotals,
    rowCounts: {
      summary: Array.isArray(summary?.rows) ? summary.rows.length : 0,
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

function renderAbOverview(model) {
  const rows = model?.overview?.overviewRows || [];
  const header = model?.overview?.header || {};
  if (!rows.length) {
    return "";
  }

  const tbody = rows
    .map(
      (row) => `<tr>
      <td>${abEscapeHtml(row.date)}</td>
      <td>${abEscapeHtml(row.label)}</td>
      <td>${abEscapeHtml(row.colM)}</td>
      <td>${abEscapeHtml(row.colN)}</td>
      <td>${abEscapeHtml(row.colO)}</td>
      <td>${abEscapeHtml(row.colP)}</td>
      <td>${abEscapeHtml(row.colQ)}</td>
      <td>${abEscapeHtml(row.colS)}</td>
    </tr>`,
    )
    .join("");

  return `<article class="ab-overview-card">
    <div class="ab-overview-head">
      <h3>Сводка (как в листе)</h3>
      <span class="subtle">Архивный legacy‑модуль. Актуальные источники AB‑данных вынесены в проект ab-tests.</span>
    </div>
    <div class="ab-overview-table-wrap">
      <table class="ab-overview-table">
        <thead>
          <tr>
            <th>Дата</th>
            <th>Кабинет</th>
            <th>${abEscapeHtml(header.colM || "Тест изм. цены")}</th>
            <th>${abEscapeHtml(header.colN || "ИТОГ ОК")}</th>
            <th>${abEscapeHtml(header.colO || "Тест CTR*CR1")}</th>
            <th>${abEscapeHtml(header.colP || "ИТОГ ОВР")}</th>
            <th>${abEscapeHtml(header.colQ || "Ручная")}</th>
            <th>${abEscapeHtml(header.colS || "Итог")}</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
  </article>`;
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
          <option value="auto"${abDashboardStore.filters.verdict === "auto" ? " selected" : ""}>Авто</option>
          <option value="unknown"${abDashboardStore.filters.verdict === "unknown" ? " selected" : ""}>Нет данных</option>
        </select>
      </label>
      <div class="ab-view-switch" role="tablist" aria-label="Режим просмотра AB">
        <button type="button" class="ab-view-btn${abDashboardStore.filters.view === "tests" ? " is-active" : ""}" data-ab-view="tests">По тестам</button>
        <button type="button" class="ab-view-btn${abDashboardStore.filters.view === "products" ? " is-active" : ""}" data-ab-view="products">По товарам</button>
        <button type="button" class="ab-view-btn${abDashboardStore.filters.view === "both" ? " is-active" : ""}" data-ab-view="both">Оба вида</button>
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
    { label: "Ручная", raw: test.summaryChecks.manual },
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

  const priceRowsHtml = test.priceRows
    .map((row) => `<tr><td>${abEscapeHtml(row.label)}</td><td>${abEscapeHtml(row.value)}</td></tr>`)
    .join("");

  const priceDeltaRowsHtml = test.priceDeltaRows
    .map((row) => `<tr><td>${abEscapeHtml(row.label)}</td><td>${abEscapeHtml(row.value)}</td></tr>`)
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
          <h5>Отчет из сводки</h5>
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
        <article class="ab-side-card">
          <h5>Цена</h5>
          <table class="ab-mini-table is-tight">
            <tbody>${priceRowsHtml || '<tr><td colspan="2">—</td></tr>'}</tbody>
          </table>
          <table class="ab-mini-table is-tight">
            <tbody>${priceDeltaRowsHtml || '<tr><td colspan="2">—</td></tr>'}</tbody>
          </table>
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
      <td><span class="ab-inline-status auto">${abEscapeHtml(abFormatInt(item.auto))}</span></td>
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
            <th>Авто</th>
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

  return tests.filter((test) => {
    if (cabinet !== "all" && test.cabinet !== cabinet) {
      return false;
    }
    if (verdict !== "all" && test.finalStatusKind !== verdict) {
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
      <span>Загружаю архивный legacy‑слепок AB‑данных…</span>
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
    metaEl.textContent = `Архивный legacy‑модуль AB‑данных. Обновлено: ${fetchedLabel}`;
  }

  const filteredTests = abFilterTests(model);
  const filteredProducts = abBuildProductsFromFilteredTests(filteredTests);

  const sourceRowsLabel = `Строк в сводке: ${abFormatInt(model.rowCounts.summary)} · строк в результатах обложек: ${abFormatInt(
    model.rowCounts.results,
  )}`;

  const showTests = abDashboardStore.filters.view === "tests" || abDashboardStore.filters.view === "both";
  const showProducts = abDashboardStore.filters.view === "products" || abDashboardStore.filters.view === "both";

  contentEl.innerHTML = `
    ${renderAbFilterToolbar(model, filteredTests)}
    <div class="ab-source-line">${abEscapeHtml(sourceRowsLabel)}</div>
    ${renderAbOverview(model)}
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
    }
  });

  contentEl.addEventListener("click", (event) => {
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

  const request = Promise.all([fetchAbSheetRaw(AB_DASHBOARD_SHEETS.summary), fetchAbSheetRaw(AB_DASHBOARD_SHEETS.results)])
    .then(([summary, results]) => {
      const model = buildAbDashboardModel({ summary, results });
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

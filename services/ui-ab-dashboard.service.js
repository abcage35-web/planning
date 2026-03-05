const AB_DASHBOARD_SHEET_ID = "1ot5SxsmAl717cuvQbbXr1dVx1FQ99HTTzN1sG5z_RIc";
const AB_DASHBOARD_FETCH_TIMEOUT_MS = 28000;
const AB_DASHBOARD_TESTS_LIMIT = 140;
const AB_DASHBOARD_COVERS_LIMIT = 100;
const AB_DASHBOARD_SHEETS = Object.freeze({
  substrate: "(*) Подложка",
  technical: "(*) Техническая выгрузка",
  results: "(*) Результаты по обложкам XWAY",
});

const abDashboardStore = {
  loading: false,
  loaded: false,
  error: "",
  fetchedAt: null,
  data: null,
  promise: null,
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

function abNormalizeHeader(labelRaw, index, used) {
  const base = String(labelRaw || `col_${index + 1}`).trim() || `col_${index + 1}`;
  let key = base;
  let suffix = 2;
  while (used.has(key.toLowerCase())) {
    key = `${base}__${suffix}`;
    suffix += 1;
  }
  used.add(key.toLowerCase());
  return key;
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

function abParseCellValue(cell) {
  if (!cell || typeof cell !== "object") {
    return "";
  }

  const raw = Object.prototype.hasOwnProperty.call(cell, "v") ? cell.v : "";
  if (raw === null || raw === undefined) {
    return "";
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return "";
    }
    const parsedDate = abParseDateLiteral(trimmed);
    return parsedDate || trimmed;
  }

  if (typeof raw === "number" || typeof raw === "boolean") {
    return raw;
  }

  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? "" : raw.toISOString();
  }

  return String(raw);
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

function abNormalizeSheetTable(tableRaw) {
  const table = tableRaw && typeof tableRaw === "object" ? tableRaw : {};
  const cols = Array.isArray(table.cols) ? table.cols : [];
  const rows = Array.isArray(table.rows) ? table.rows : [];

  const used = new Set();
  const headers = cols.map((col, index) => abNormalizeHeader(col?.label || col?.id, index, used));

  const dataRows = rows.map((row, rowIndex) => {
    const values = Array.isArray(row?.c) ? row.c : [];
    const mapped = { __rowIndex: rowIndex + 1 };
    headers.forEach((header, colIndex) => {
      mapped[header] = abParseCellValue(values[colIndex]);
    });
    return mapped;
  });

  return {
    headers,
    rows: dataRows,
  };
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

async function fetchAbSheet(sheetName) {
  const url = new URL(`https://docs.google.com/spreadsheets/d/${AB_DASHBOARD_SHEET_ID}/gviz/tq`);
  url.searchParams.set("sheet", sheetName);
  url.searchParams.set("tqx", "out:json");
  const responseText = await abFetchWithTimeout(url.toString(), AB_DASHBOARD_FETCH_TIMEOUT_MS);
  const table = abParseGvizResponse(responseText);
  return abNormalizeSheetTable(table);
}

function abValue(row, keys) {
  const source = row && typeof row === "object" ? row : {};
  const list = Array.isArray(keys) ? keys : [keys];
  for (const key of list) {
    const value = source[key];
    if (value === null || value === undefined) {
      continue;
    }
    const text = typeof value === "string" ? value.trim() : value;
    if (text === "") {
      continue;
    }
    return text;
  }
  return "";
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

function abNormalizeSku(valueRaw) {
  const digits = String(valueRaw || "").match(/\d{6,}/);
  return digits ? digits[0] : "";
}

function abNormalizeDecision(valueRaw) {
  const value = String(valueRaw || "").trim().toUpperCase();
  if (!value) {
    return "UNKNOWN";
  }
  if (value.includes("GOOD") || value.includes("WIN") || value.includes("ПОБЕД")) {
    return "GOOD";
  }
  if (value.includes("BAD") || value.includes("LOSE") || value.includes("FAIL") || value.includes("ПЛОХ")) {
    return "BAD";
  }
  if (value.includes("NORMAL") || value.includes("NORM") || value.includes("СРЕД")) {
    return "NORMAL";
  }
  return "UNKNOWN";
}

function abDecisionLabel(decision) {
  switch (decision) {
    case "GOOD":
      return "GOOD";
    case "BAD":
      return "BAD";
    case "NORMAL":
      return "NORMAL";
    default:
      return "—";
  }
}

function abDecisionTone(decision) {
  switch (decision) {
    case "GOOD":
      return "is-good";
    case "BAD":
      return "is-bad";
    case "NORMAL":
      return "is-normal";
    default:
      return "is-unknown";
  }
}

function abToCtrPercent(valueRaw) {
  const value = abToNumber(valueRaw);
  if (!Number.isFinite(value)) {
    return null;
  }
  return value <= 1 ? value * 100 : value;
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

function abFormatCtrDelta(valueRaw) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return "—";
  }
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2).replace(".", ",")} п.п.`;
}

function abFormatDate(valueRaw, includeTime = false) {
  const value = String(valueRaw || "").trim();
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function abSafeLink(urlRaw, label) {
  const url = String(urlRaw || "").trim();
  if (!url) {
    return '<span class="ab-link-empty">—</span>';
  }
  const iconHtml = typeof renderIcon === "function" ? renderIcon("externalLink", "ab-link-icon") : "↗";
  return `<a class="ab-link" href="${abEscapeAttr(url)}" target="_blank" rel="noopener noreferrer">${iconHtml}<span>${abEscapeHtml(label || "Открыть")}</span></a>`;
}

function buildAbDashboardModel(source) {
  const substrateRows = Array.isArray(source?.substrate?.rows) ? source.substrate.rows : [];
  const techRows = Array.isArray(source?.technical?.rows) ? source.technical.rows : [];
  const resultsRows = Array.isArray(source?.results?.rows) ? source.results.rows : [];

  const substrateBySku = new Map();
  for (const row of substrateRows) {
    const sku = abNormalizeSku(abValue(row, ["Артикул", "sku"]));
    if (!sku) {
      continue;
    }
    substrateBySku.set(sku, {
      sku,
      crmId: String(abValue(row, ["CRM_ID"])) || "",
      offerId: String(abValue(row, ["Offer_ID"])) || "",
      productName: String(abValue(row, ["Название товара CRM"])) || "",
      wbLink: String(abValue(row, ["Ссылка на МП"])) || "",
      marketplace: String(abValue(row, ["МП"])) || "",
    });
  }

  const resultsByTest = new Map();
  const decisionTotals = {
    GOOD: 0,
    NORMAL: 0,
    BAD: 0,
    UNKNOWN: 0,
  };

  for (const row of resultsRows) {
    const testId = String(abValue(row, ["test_id"])) || "";
    if (!testId) {
      continue;
    }

    const decision = abNormalizeDecision(abValue(row, ["Решение по обложке"]));
    if (decisionTotals[decision] === undefined) {
      decisionTotals.UNKNOWN += 1;
    } else {
      decisionTotals[decision] += 1;
    }

    const ctr = abToCtrPercent(abValue(row, ["ctr"]));
    const views = Math.max(0, Number(abToInt(abValue(row, ["views"])) || 0));
    const clicks = Math.max(0, Number(abToInt(abValue(row, ["clicks"])) || 0));
    const installedAt = abParseDateLiteral(abValue(row, ["Дата установки обложки"]));
    const coverUrl = String(abValue(row, ["Ссылка на обложку"])) || "";
    const xwayUrl = String(abValue(row, ["Ссылка на XWay"])) || "";

    if (!resultsByTest.has(testId)) {
      resultsByTest.set(testId, {
        testId,
        variants: [],
        views: 0,
        clicks: 0,
        bestCtr: null,
        bestCoverUrl: "",
        latestInstallAt: "",
        xwayUrl,
        decisions: { GOOD: 0, NORMAL: 0, BAD: 0, UNKNOWN: 0 },
      });
    }

    const group = resultsByTest.get(testId);
    group.variants.push({ ctr, views, clicks, decision, installedAt, coverUrl, xwayUrl });
    group.views += views;
    group.clicks += clicks;
    if (decision in group.decisions) {
      group.decisions[decision] += 1;
    } else {
      group.decisions.UNKNOWN += 1;
    }
    if (!group.xwayUrl && xwayUrl) {
      group.xwayUrl = xwayUrl;
    }

    if (Number.isFinite(ctr) && (group.bestCtr === null || ctr > group.bestCtr)) {
      group.bestCtr = ctr;
      group.bestCoverUrl = coverUrl;
    }

    if (installedAt) {
      const currentMs = group.latestInstallAt ? new Date(group.latestInstallAt).getTime() : 0;
      const nextMs = new Date(installedAt).getTime();
      if (nextMs > currentMs) {
        group.latestInstallAt = installedAt;
      }
    }
  }

  const testsByKey = new Map();
  for (const [testId, resultGroup] of resultsByTest.entries()) {
    testsByKey.set(testId, {
      key: testId,
      testId,
      sku: "",
      productName: "",
      campaignId: "",
      campaignType: "",
      testName: "",
      technicalDecision: "",
      xwayUrl: resultGroup.xwayUrl || "",
      wbUrl: "",
      startedAt: "",
      decidedAt: resultGroup.latestInstallAt || "",
      coversPlanned: null,
      ctrBefore: null,
      ctrAfter: null,
      ctrDelta: null,
      variants: resultGroup.variants.length,
      views: resultGroup.views,
      clicks: resultGroup.clicks,
      weightedCtr: resultGroup.views > 0 ? (resultGroup.clicks / resultGroup.views) * 100 : null,
      coverDecision: Object.entries(resultGroup.decisions)
        .sort((a, b) => b[1] - a[1])
        .map((entry) => entry[0])[0],
      bestCoverUrl: resultGroup.bestCoverUrl || "",
    });
  }

  for (const row of techRows) {
    const testId = String(abValue(row, ["test_id"])) || "";
    const sku = abNormalizeSku(abValue(row, ["sku"]));
    const fallbackKey = `sku:${sku || row.__rowIndex}`;
    const key = testId || fallbackKey;

    if (!testsByKey.has(key)) {
      testsByKey.set(key, {
        key,
        testId,
        sku,
        productName: "",
        campaignId: "",
        campaignType: "",
        testName: "",
        technicalDecision: "",
        xwayUrl: "",
        wbUrl: "",
        startedAt: "",
        decidedAt: "",
        coversPlanned: null,
        ctrBefore: null,
        ctrAfter: null,
        ctrDelta: null,
        variants: 0,
        views: 0,
        clicks: 0,
        weightedCtr: null,
        coverDecision: "UNKNOWN",
        bestCoverUrl: "",
      });
    }

    const test = testsByKey.get(key);
    test.testId = test.testId || testId;
    test.sku = test.sku || sku;
    test.productName = test.productName || String(abValue(row, ["Название товара в CRM"])) || "";
    test.campaignId = test.campaignId || String(abValue(row, ["campaign_id"])) || "";
    test.campaignType = test.campaignType || String(abValue(row, ["Тип кампании"])) || "";
    test.testName = test.testName || String(abValue(row, ["Название теста"])) || "";
    test.technicalDecision = test.technicalDecision || String(abValue(row, ["Решение"])) || "";
    test.xwayUrl = test.xwayUrl || String(abValue(row, ["Ссылка на XWay"])) || "";
    test.wbUrl = test.wbUrl || String(abValue(row, ["Ссылка на Товар"])) || "";

    const startedAt = abParseDateLiteral(abValue(row, ["Дата начала теста"]));
    if (startedAt && (!test.startedAt || new Date(startedAt).getTime() > new Date(test.startedAt).getTime())) {
      test.startedAt = startedAt;
    }

    const decidedAt = abParseDateLiteral(abValue(row, ["Дата установления победителя"]));
    if (decidedAt && (!test.decidedAt || new Date(decidedAt).getTime() > new Date(test.decidedAt).getTime())) {
      test.decidedAt = decidedAt;
    }

    const planned = abToInt(abValue(row, ["Количество обложек"]));
    if (Number.isFinite(planned) && (test.coversPlanned === null || planned > test.coversPlanned)) {
      test.coversPlanned = planned;
    }

    const ctrBefore = abToCtrPercent(abValue(row, ["CTR до"]));
    if (Number.isFinite(ctrBefore)) {
      test.ctrBefore = ctrBefore;
    }

    const ctrAfter = abToCtrPercent(abValue(row, ["CTR после"]));
    if (Number.isFinite(ctrAfter)) {
      test.ctrAfter = ctrAfter;
    }
  }

  const tests = Array.from(testsByKey.values()).map((test) => {
    const substrate = substrateBySku.get(test.sku);
    const productName = test.productName || substrate?.productName || "—";
    const wbUrl = test.wbUrl || substrate?.wbLink || "";
    const variants = test.variants > 0 ? test.variants : Number(test.coversPlanned || 0);
    const ctrDelta =
      Number.isFinite(test.ctrBefore) && Number.isFinite(test.ctrAfter) ? Number(test.ctrAfter - test.ctrBefore) : null;
    const weightedCtr = Number.isFinite(test.weightedCtr)
      ? test.weightedCtr
      : test.views > 0
        ? (test.clicks / test.views) * 100
        : null;

    return {
      ...test,
      variants,
      productName,
      wbUrl,
      weightedCtr,
      ctrDelta,
      offerId: substrate?.offerId || "",
      crmId: substrate?.crmId || "",
    };
  });

  tests.sort((a, b) => {
    const aDate = a.startedAt || a.decidedAt;
    const bDate = b.startedAt || b.decidedAt;
    const aMs = aDate ? new Date(aDate).getTime() : 0;
    const bMs = bDate ? new Date(bDate).getTime() : 0;
    return bMs - aMs;
  });

  const testRowsForTable = tests.slice(0, AB_DASHBOARD_TESTS_LIMIT);
  const testById = new Map(
    tests
      .filter((item) => String(item.testId || "").trim())
      .map((item) => [String(item.testId).trim(), item]),
  );

  const coverRows = resultsRows
    .map((row) => {
      const testId = String(abValue(row, ["test_id"])) || "";
      const installedAt = abParseDateLiteral(abValue(row, ["Дата установки обложки"]));
      const decision = abNormalizeDecision(abValue(row, ["Решение по обложке"]));
      const ctr = abToCtrPercent(abValue(row, ["ctr"]));
      const views = Math.max(0, Number(abToInt(abValue(row, ["views"])) || 0));
      const clicks = Math.max(0, Number(abToInt(abValue(row, ["clicks"])) || 0));
      const coverUrl = String(abValue(row, ["Ссылка на обложку"])) || "";
      const xwayUrl = String(abValue(row, ["Ссылка на XWay"])) || "";
      const relatedTest = testById.get(String(testId).trim());
      return {
        testId,
        sku: relatedTest?.sku || "",
        productName: relatedTest?.productName || "—",
        installedAt,
        decision,
        ctr,
        views,
        clicks,
        coverUrl,
        xwayUrl,
      };
    })
    .sort((a, b) => {
      const aMs = a.installedAt ? new Date(a.installedAt).getTime() : 0;
      const bMs = b.installedAt ? new Date(b.installedAt).getTime() : 0;
      return bMs - aMs;
    })
    .slice(0, AB_DASHBOARD_COVERS_LIMIT);

  const ctrBeforeList = tests.map((item) => item.ctrBefore).filter((value) => Number.isFinite(value));
  const ctrAfterList = tests.map((item) => item.ctrAfter).filter((value) => Number.isFinite(value));
  const totalViews = tests.reduce((sum, item) => sum + Number(item.views || 0), 0);
  const totalClicks = tests.reduce((sum, item) => sum + Number(item.clicks || 0), 0);
  const totalVariants = tests.reduce((sum, item) => sum + Number(item.variants || 0), 0);

  const uniqueSkuCount = new Set(tests.map((item) => item.sku).filter(Boolean)).size;
  const avgCtrBefore =
    ctrBeforeList.length > 0
      ? ctrBeforeList.reduce((sum, value) => sum + value, 0) / ctrBeforeList.length
      : null;
  const avgCtrAfter =
    ctrAfterList.length > 0
      ? ctrAfterList.reduce((sum, value) => sum + value, 0) / ctrAfterList.length
      : null;
  const weightedCtr = totalViews > 0 ? (totalClicks / totalViews) * 100 : null;
  const avgCtrDelta =
    Number.isFinite(avgCtrBefore) && Number.isFinite(avgCtrAfter) ? Number(avgCtrAfter - avgCtrBefore) : null;

  const topByDelta = tests
    .filter((item) => Number.isFinite(item.ctrDelta))
    .sort((a, b) => Number(b.ctrDelta) - Number(a.ctrDelta));

  return {
    rowCounts: {
      substrate: substrateRows.length,
      technical: techRows.length,
      results: resultsRows.length,
    },
    totals: {
      tests: tests.length,
      skus: uniqueSkuCount,
      variants: totalVariants,
      views: totalViews,
      clicks: totalClicks,
      weightedCtr,
      avgCtrBefore,
      avgCtrAfter,
      avgCtrDelta,
    },
    decisionTotals,
    tables: {
      tests: testRowsForTable,
      covers: coverRows,
      topGrowth: topByDelta.slice(0, 10),
      topDrop: topByDelta.slice(-10).reverse(),
    },
  };
}

function renderAbKpiCard(title, value, hint = "") {
  return `<article class="ab-kpi-card">
    <p class="ab-kpi-title">${abEscapeHtml(title)}</p>
    <p class="ab-kpi-value">${abEscapeHtml(value)}</p>
    ${hint ? `<p class="ab-kpi-hint">${abEscapeHtml(hint)}</p>` : ""}
  </article>`;
}

function renderAbDecisionChip(label, count, toneClass) {
  return `<span class="ab-decision-chip ${abEscapeAttr(toneClass)}"><span class="ab-decision-name">${abEscapeHtml(label)}</span><strong>${abEscapeHtml(
    abFormatInt(count),
  )}</strong></span>`;
}

function renderAbTestsTableRows(rows) {
  if (!Array.isArray(rows) || rows.length <= 0) {
    return '<tr><td colspan="12" class="ab-table-empty-row">Нет строк для отображения.</td></tr>';
  }

  return rows
    .map((row) => {
      const decision = abDecisionLabel(row.coverDecision);
      const decisionTone = abDecisionTone(row.coverDecision);
      const deltaClass = Number(row.ctrDelta) > 0 ? "is-up" : Number(row.ctrDelta) < 0 ? "is-down" : "";
      return `<tr>
        <td class="ab-col-id">${abEscapeHtml(row.testId || "—")}</td>
        <td class="ab-col-id">${abEscapeHtml(row.sku || "—")}</td>
        <td class="ab-col-name" title="${abEscapeAttr(row.productName || "")}">${abEscapeHtml(row.productName || "—")}</td>
        <td>${abEscapeHtml(row.campaignType || "—")}</td>
        <td>${abEscapeHtml(abFormatInt(row.variants))}</td>
        <td>${abEscapeHtml(abFormatPercent(row.ctrBefore))}</td>
        <td>${abEscapeHtml(abFormatPercent(row.ctrAfter))}</td>
        <td class="${deltaClass}">${abEscapeHtml(abFormatCtrDelta(row.ctrDelta))}</td>
        <td>${abEscapeHtml(abFormatInt(row.views))}</td>
        <td>${abEscapeHtml(abFormatInt(row.clicks))}</td>
        <td><span class="ab-decision-pill ${abEscapeAttr(decisionTone)}">${abEscapeHtml(decision)}</span></td>
        <td class="ab-links-cell">${abSafeLink(row.wbUrl, "WB")} ${abSafeLink(row.xwayUrl, "XWay")}</td>
      </tr>`;
    })
    .join("");
}

function renderAbCoverRows(rows) {
  if (!Array.isArray(rows) || rows.length <= 0) {
    return '<tr><td colspan="8" class="ab-table-empty-row">Нет строк для отображения.</td></tr>';
  }

  return rows
    .map((row) => {
      const decision = abDecisionLabel(row.decision);
      const decisionTone = abDecisionTone(row.decision);
      return `<tr>
        <td class="ab-col-id">${abEscapeHtml(row.testId || "—")}</td>
        <td class="ab-col-id">${abEscapeHtml(row.sku || "—")}</td>
        <td class="ab-col-name" title="${abEscapeAttr(row.productName || "")}">${abEscapeHtml(row.productName || "—")}</td>
        <td>${abEscapeHtml(abFormatDate(row.installedAt, true))}</td>
        <td>${abEscapeHtml(abFormatPercent(row.ctr))}</td>
        <td>${abEscapeHtml(abFormatInt(row.views))}</td>
        <td>${abEscapeHtml(abFormatInt(row.clicks))}</td>
        <td class="ab-links-cell">${abSafeLink(row.coverUrl, "Обложка")} <span class="ab-decision-pill ${abEscapeAttr(decisionTone)}">${abEscapeHtml(
          decision,
        )}</span></td>
      </tr>`;
    })
    .join("");
}

function renderAbDeltaList(rows, tone = "up") {
  if (!Array.isArray(rows) || rows.length <= 0) {
    return '<li class="ab-delta-empty">Нет данных</li>';
  }

  return rows
    .map((row) => {
      const deltaClass = tone === "down" ? "is-down" : "is-up";
      return `<li>
        <span class="ab-delta-name" title="${abEscapeAttr(row.productName || "")}">${abEscapeHtml(row.sku || "—")} · ${abEscapeHtml(
        row.productName || "—",
      )}</span>
        <span class="ab-delta-value ${deltaClass}">${abEscapeHtml(abFormatCtrDelta(row.ctrDelta))}</span>
      </li>`;
    })
    .join("");
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
      <span>Загружаю данные AB‑тестов из Google Sheets…</span>
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
    contentEl.innerHTML = `<div class="ab-tests-state-card">
      <span>Нет данных для AB‑дашборда.</span>
    </div>`;
    return;
  }

  if (metaEl) {
    const fetchedLabel = abDashboardStore.fetchedAt ? formatDateTime(abDashboardStore.fetchedAt) : "-";
    metaEl.textContent = `Источники: (*) Подложка, (*) Техническая выгрузка, (*) Результаты по обложкам XWAY. Обновлено: ${fetchedLabel}`;
  }

  const kpiCards = [
    renderAbKpiCard("Тестов", abFormatInt(model.totals.tests), "Уникальные test_id"),
    renderAbKpiCard("Артикулов", abFormatInt(model.totals.skus), "sku в тестах"),
    renderAbKpiCard("Вариантов обложек", abFormatInt(model.totals.variants), "По листу результатов"),
    renderAbKpiCard("Просмотров", abFormatInt(model.totals.views), "Сумма views"),
    renderAbKpiCard("Кликов", abFormatInt(model.totals.clicks), "Сумма clicks"),
    renderAbKpiCard("CTR (взвеш.)", abFormatPercent(model.totals.weightedCtr), "clicks / views"),
    renderAbKpiCard("CTR до", abFormatPercent(model.totals.avgCtrBefore), "Средний по тестам"),
    renderAbKpiCard("CTR после", abFormatPercent(model.totals.avgCtrAfter), "Средний по тестам"),
    renderAbKpiCard("Δ CTR", abFormatCtrDelta(model.totals.avgCtrDelta), "После − до"),
  ].join("");

  const decisionChips = [
    renderAbDecisionChip("GOOD", model.decisionTotals.GOOD, "is-good"),
    renderAbDecisionChip("NORMAL", model.decisionTotals.NORMAL, "is-normal"),
    renderAbDecisionChip("BAD", model.decisionTotals.BAD, "is-bad"),
    renderAbDecisionChip("UNKNOWN", model.decisionTotals.UNKNOWN, "is-unknown"),
  ].join("");

  const sourceRowsLabel = `Подложка: ${abFormatInt(model.rowCounts.substrate)} · Тех. выгрузка: ${abFormatInt(
    model.rowCounts.technical,
  )} · Результаты XWAY: ${abFormatInt(model.rowCounts.results)}`;

  contentEl.innerHTML = `<div class="ab-kpi-grid">${kpiCards}</div>
    <div class="ab-source-line">${abEscapeHtml(sourceRowsLabel)}</div>
    <div class="ab-decision-row">${decisionChips}</div>

    <div class="ab-delta-grid">
      <article class="ab-delta-card">
        <h3>Топ роста CTR</h3>
        <ul>${renderAbDeltaList(model.tables.topGrowth, "up")}</ul>
      </article>
      <article class="ab-delta-card">
        <h3>Топ падения CTR</h3>
        <ul>${renderAbDeltaList(model.tables.topDrop, "down")}</ul>
      </article>
    </div>

    <article class="ab-table-card">
      <div class="ab-table-head">
        <h3>Сводка тестов</h3>
        <span class="subtle">Показано ${abEscapeHtml(abFormatInt(model.tables.tests.length))} последних тестов</span>
      </div>
      <div class="ab-table-wrap">
        <table class="ab-table">
          <thead>
            <tr>
              <th>Test ID</th>
              <th>Артикул</th>
              <th>Товар</th>
              <th>Тип</th>
              <th>Обложек</th>
              <th>CTR до</th>
              <th>CTR после</th>
              <th>Δ CTR</th>
              <th>Views</th>
              <th>Clicks</th>
              <th>Решение</th>
              <th>Ссылки</th>
            </tr>
          </thead>
          <tbody>${renderAbTestsTableRows(model.tables.tests)}</tbody>
        </table>
      </div>
    </article>

    <article class="ab-table-card">
      <div class="ab-table-head">
        <h3>Последние результаты обложек</h3>
        <span class="subtle">Показано ${abEscapeHtml(abFormatInt(model.tables.covers.length))} последних установок</span>
      </div>
      <div class="ab-table-wrap">
        <table class="ab-table">
          <thead>
            <tr>
              <th>Test ID</th>
              <th>Артикул</th>
              <th>Товар</th>
              <th>Дата установки</th>
              <th>CTR</th>
              <th>Views</th>
              <th>Clicks</th>
              <th>Ссылка</th>
            </tr>
          </thead>
          <tbody>${renderAbCoverRows(model.tables.covers)}</tbody>
        </table>
      </div>
    </article>`;
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

  abDashboardStore.loading = true;
  abDashboardStore.error = "";
  renderAbDashboardContent();

  const request = Promise.all([
    fetchAbSheet(AB_DASHBOARD_SHEETS.substrate),
    fetchAbSheet(AB_DASHBOARD_SHEETS.technical),
    fetchAbSheet(AB_DASHBOARD_SHEETS.results),
  ])
    .then(([substrate, technical, results]) => {
      const model = buildAbDashboardModel({ substrate, technical, results });
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

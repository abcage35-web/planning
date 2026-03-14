// ── Constants ──
const AB_DASHBOARD_SHEET_ID = "1FS-XeiQA5IIB420mDAUlEGW09HoZWU0Sqtpk6i1jcEQ";
const AB_DASHBOARD_FETCH_TIMEOUT_MS = 32000;
export const AB_TEST_LIMIT_OPTIONS = [50, 100, 150, 200, 250, 300] as const;
export const AB_MATRIX_METRIC_COL_WIDTH = 136;
export const AB_MATRIX_VARIANT_COL_WIDTH = 112;
export const AB_XWAY_ERROR_CACHE_TTL_MS = 60_000;
export const AB_XWAY_REQUEST_RETRIES = 2;
export const AB_XWAY_REQUEST_RETRY_DELAY_MS = 500;

const AB_DASHBOARD_SOURCE_SHEETS: Record<string, { gid: string; label: string }> = {
  catalog: { gid: "795894762", label: "Каталог товаров" },
  technical: { gid: "763001257", label: "AB-выгрузка" },
  results: { gid: "185346508", label: "Результаты обложек" },
};

const AB_STATUS_MAP: Record<string, string> = {
  WIN: "good", GOOD: "good", EXCELLENT: "good",
  LOOSE: "bad", LOSE: "bad", BAD: "bad",
  NORMAL: "neutral", "НОРМ": "neutral",
  "?": "unknown",
};

export const AB_FUNNEL_STAGE_STYLES: Record<string, { colorFrom: string; colorTo: string }> = {
  ctr: { colorFrom: "#3B82F6", colorTo: "#60A5FA" },
  price: { colorFrom: "#8B5CF6", colorTo: "#A78BFA" },
  ctrcr1: { colorFrom: "#F59E0B", colorTo: "#FBBF24" },
  overall: { colorFrom: "#10B981", colorTo: "#34D399" },
};

// ── Types ──
export interface Variant {
  index: number;
  imageUrl: string;
  viewsValue: number | null;
  clicksValue: number | null;
  ctrValue: number | null;
  installedAtIso: string;
  views: string;
  clicks: string;
  ctr: string;
  installedAtDate: string;
  installedAtTime: string;
  hours: string;
  isBest: boolean;
  ctrBoostValue: number | null;
  ctrBoostText: string;
  ctrBoostKind: string;
}

export interface ComparisonRow {
  label: string;
  before: string;
  during: string;
  after: string;
  deltaText: string;
  deltaKind: string;
}

export interface SummaryChecks {
  testCtr: string;
  testPrice: string;
  testCtrCr1: string;
  overall: string;
}

export interface TestCard {
  testId: string;
  xwayUrl: string;
  wbUrl: string;
  article: string;
  title: string;
  productName: string;
  type: string;
  campaignExternalId: string;
  cabinet: string;
  startedAt: string;
  startedAtIso: string;
  endedAt: string;
  endedAtIso: string;
  metrics: Array<{
    checkName: string;
    label: string;
    valueText: string;
    statusRaw: string;
    statusKind: string;
  }>;
  finalStatusRaw: string;
  finalStatusKind: string;
  summaryChecks: SummaryChecks;
  xwaySummaryChecks?: SummaryChecks | null;
  variants: Variant[];
  priceDeviationCount: string;
  comparisonRows: ComparisonRow[];
  reportLines: string[];
  reportText: string;
}

export interface Product {
  article: string;
  title: string;
  type: string;
  cabinets: string[];
  tests: TestCard[];
  testsCount: number;
  good: number;
  bad: number;
  unknown: number;
  latestAt: string;
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
}

export interface FunnelCard {
  cabinet: string;
  total: number;
  source: string;
  stages: FunnelStage[];
}

export interface DashboardModel {
  tests: TestCard[];
  products: Product[];
  cabinets: string[];
  statusTotals: { good: number; bad: number; neutral: number; unknown: number };
  rowCounts: { catalog: number; technical: number; results: number };
}

export interface Filters {
  search: string;
  cabinet: string;
  verdict: string;
  stage: string;
  stageSource: string;
  limit: string;
  dateFrom: string;
  dateTo: string;
  monthKeys: string[];
  view: string;
}

// ── Utility functions ──
function abFormatDateInputValue(dateRaw: Date | string): string {
  const date = dateRaw instanceof Date ? new Date(dateRaw.getTime()) : new Date(dateRaw);
  if (Number.isNaN(date.getTime())) return "";
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function abGetTodayDateInputValue(): string {
  return abFormatDateInputValue(new Date());
}

export function abGetCurrentMonthKey(): string {
  return (abGetTodayDateInputValue() || "").slice(0, 7);
}

function abGetMonthBounds(monthKeyRaw: string) {
  const monthKey = (monthKeyRaw || "").trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return { from: "", to: "" };
  const [yearRaw, monthRaw] = monthKey.split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  return {
    from: abFormatDateInputValue(new Date(year, monthIndex, 1)),
    to: abFormatDateInputValue(new Date(year, monthIndex + 1, 0)),
  };
}

export function abGetCurrentMonthRange() {
  const monthKey = abGetCurrentMonthKey();
  const bounds = abGetMonthBounds(monthKey);
  return { monthKey, from: bounds.from, to: bounds.to };
}

function abGetMonthKeyByDateInputValue(valueRaw: string): string {
  const value = (valueRaw || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  return value.slice(0, 7);
}

export function abBuildDateRangeFromMonthKeys(monthKeysRaw: string[]) {
  const monthKeys = (Array.isArray(monthKeysRaw) ? monthKeysRaw : [])
    .map(i => (i || "").trim())
    .filter(i => /^\d{4}-\d{2}$/.test(i))
    .sort();
  if (!monthKeys.length) return { from: "", to: "" };
  return { from: abGetMonthBounds(monthKeys[0]).from, to: abGetMonthBounds(monthKeys[monthKeys.length - 1]).to };
}

export function abFormatMonthLabel(monthKeyRaw: string): string {
  const monthKey = (monthKeyRaw || "").trim();
  if (!/^\d{4}-\d{2}$/.test(monthKey)) return "—";
  const [yearRaw, monthRaw] = monthKey.split("-");
  const date = new Date(Number(yearRaw), Number(monthRaw) - 1, 1);
  const label = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function abGetMonthSelectionLabel(monthKeysRaw: string[]): string {
  const monthKeys = (Array.isArray(monthKeysRaw) ? monthKeysRaw : []).filter(Boolean);
  if (!monthKeys.length) return "Месяцы";
  if (monthKeys.length === 1) return abFormatMonthLabel(monthKeys[0]);
  if (monthKeys.length === 2) return `${abFormatMonthLabel(monthKeys[0])} + ${abFormatMonthLabel(monthKeys[1])}`;
  return `${monthKeys.length} мес.`;
}

function abToNumber(valueRaw: unknown): number | null {
  if (valueRaw === null || valueRaw === undefined || valueRaw === "") return null;
  if (typeof valueRaw === "number") return Number.isFinite(valueRaw) ? valueRaw : null;
  const text = String(valueRaw).trim().replace(/[\s\u00A0]/g, "").replace(/,/g, ".").replace(/%/g, "");
  if (!text || !/^-?\d*(?:\.\d+)?$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function abToInt(valueRaw: unknown): number | null {
  const num = abToNumber(valueRaw);
  return Number.isFinite(num) ? Math.round(num!) : null;
}

export function abFormatInt(valueRaw: unknown): string {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ru-RU").format(Math.round(value));
}

function abNormalizeNumericId(valueRaw: unknown): string {
  const value = abToInt(valueRaw);
  if (Number.isFinite(value)) return String(value);
  const digits = String(valueRaw ?? "").match(/\d{3,}/);
  return digits ? digits[0] : "";
}

function abFormatPercent(valueRaw: number, digits = 2): string {
  if (!Number.isFinite(valueRaw)) return "—";
  return `${valueRaw.toFixed(digits).replace(".", ",")}%`;
}

function abFormatFractionToPercent(valueRaw: unknown, digits = 2): string {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return "—";
  return abFormatPercent(value * 100, digits);
}

function abFormatSignedPercentFraction(valueRaw: unknown, digits = 0): string {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return "—";
  const percent = value * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(digits).replace(".", ",")}%`;
}

function abFormatHours(valueRaw: unknown): string {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1).replace(".", ",")} ч`;
}

export function abNormalizeStatus(rawValue: string): string {
  const raw = (rawValue || "").trim();
  if (!raw) return "unknown";
  const key = raw.toUpperCase();
  if (AB_STATUS_MAP[key]) return AB_STATUS_MAP[key];
  if (key.includes("WIN") || key.includes("GOOD") || key.includes("ХОРОШ")) return "good";
  if (key.includes("LOOSE") || key.includes("LOSE") || key.includes("BAD") || key.includes("ПЛОХ")) return "bad";
  if (key.includes("NORM") || key.includes("NORMAL") || key.includes("СРЕД")) return "neutral";
  return "unknown";
}

export function abStatusLabel(statusKind: string): string {
  switch (statusKind) {
    case "good": return "Хорошо";
    case "bad": return "Плохо";
    case "neutral": return "Норм";
    default: return "—";
  }
}

function abParseDateLiteral(valueRaw: unknown): string | null {
  const value = String(valueRaw || "").trim();
  if (!value) return null;
  const match = value.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+))?\)$/);
  if (!match) {
    const dottedMatch = value.match(/^(\d{2})\.(\d{2})\.(\d{2}|\d{4})(?:[,\s]+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
    if (dottedMatch) {
      const day = Number(dottedMatch[1]);
      const month = Number(dottedMatch[2]) - 1;
      const yearText = dottedMatch[3];
      const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText);
      const d = new Date(year, month, day, Number(dottedMatch[4] || 0), Number(dottedMatch[5] || 0), Number(dottedMatch[6] || 0));
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }
    const direct = new Date(value);
    return Number.isNaN(direct.getTime()) ? null : direct.toISOString();
  }
  const d = new Date(Number(match[1]), Number(match[2]), Number(match[3]), Number(match[4] || 0), Number(match[5] || 0), Number(match[6] || 0));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function abResolveCabinet(testNameRaw: string): string {
  const testName = (testNameRaw || "").trim();
  if (!testName) return "?";
  if (/^\s*С\s*\//u.test(testName) || /Сытин/u.test(testName)) return "Сытин";
  if (/^\s*П\s*\//u.test(testName) || /Карпачев/u.test(testName)) return "Карпачев";
  return "?";
}

function abExtractCampaignExternalId(testTitleRaw: string): string {
  const parts = (testTitleRaw || "").trim().split("/").map(p => p.trim());
  return parts.length >= 3 ? parts[2] : "";
}

function abFormatSourceDateTime(valueRaw: unknown): string {
  const text = String(valueRaw || "").trim();
  if (!text) return "";
  if (text.includes("\n")) return text;
  const iso = abParseDateLiteral(valueRaw);
  if (!iso) return text;
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

function abFormatVariantDateTime(valueRaw: unknown) {
  const iso = typeof valueRaw === "string" && valueRaw.includes("T") ? valueRaw : abParseDateLiteral(valueRaw);
  if (!iso) return { date: "", time: "" };
  const date = new Date(iso);
  const pad = (v: number) => String(v).padStart(2, "0");
  return { date: `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${String(date.getFullYear()).slice(-2)}`, time: `${pad(date.getHours())}:${pad(date.getMinutes())}` };
}

export function abFormatCompactPeriodDateTime(isoRaw: string): string {
  const iso = (isoRaw || "").trim();
  if (!iso) return "—";
  const parts = abFormatVariantDateTime(iso);
  if (!parts.date) return "—";
  return `${parts.date} (${parts.time || "—"})`;
}

// ── Data building ──
function abCell(row: any, id: string) {
  if (!row || typeof row !== "object") return { v: "", f: "" };
  const cell = row[id];
  if (!cell || typeof cell !== "object") return { v: "", f: "" };
  return cell;
}
function abCellRaw(row: any, id: string) { return abCell(row, id).v; }
function abCellText(row: any, id: string) {
  const cell = abCell(row, id);
  const formatted = String(cell.f || "").trim();
  if (formatted) return formatted;
  const value = cell.v;
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value).trim();
}

function abNormalizeTestId(valueRaw: unknown) {
  const digits = String(valueRaw ?? "").match(/\d{3,}/);
  return digits ? digits[0] : "";
}

function abParseResultIndex(resultsSheet: any) {
  const rows = Array.isArray(resultsSheet?.rows) ? resultsSheet.rows : [];
  const map = new Map();
  for (const row of rows) {
    const testId = abNormalizeTestId(abCellRaw(row, "A"));
    if (!testId) continue;
    const coverUrl = (abCellText(row, "C") || "").trim();
    if (!coverUrl) continue;
    const views = Math.max(0, Number(abToInt(abCellRaw(row, "G")) || 0));
    const clicks = Math.max(0, Number(abToInt(abCellRaw(row, "H")) || 0));
    const ctrNum = abToNumber(abCellRaw(row, "F"));
    const installedRaw = abCellRaw(row, "D");
    const installedAt = abParseDateLiteral(installedRaw);
    const decisionRaw = abCellText(row, "E");
    if (views <= 0) continue;
    if (!map.has(testId)) map.set(testId, []);
    map.get(testId).push({ coverUrl, decisionRaw, ctr: Number.isFinite(ctrNum) ? ctrNum : null, views, clicks, installedAt, rowIndex: Number(row.__rowIndex || 0) });
  }
  for (const [testId, list] of map.entries()) {
    list.sort((a: any, b: any) => {
      const aMs = a.installedAt ? new Date(a.installedAt).getTime() : 0;
      const bMs = b.installedAt ? new Date(b.installedAt).getTime() : 0;
      if (aMs !== bMs) return aMs - bMs;
      return (a.rowIndex || 0) - (b.rowIndex || 0);
    });
    map.set(testId, list);
  }
  return map;
}

function abBuildCatalogIndex(catalogSheet: any) {
  const rows = Array.isArray(catalogSheet?.rows) ? catalogSheet.rows : [];
  const map = new Map();
  for (const row of rows) {
    const article = abNormalizeNumericId(abCellRaw(row, "C"));
    if (!article || map.has(article)) continue;
    map.set(article, {
      crmId: abNormalizeNumericId(abCellRaw(row, "A")),
      offerId: (abCellText(row, "D") || "").trim(),
      productName: (abCellText(row, "E") || "").trim(),
      wbUrl: (abCellText(row, "F") || "").trim(),
    });
  }
  return map;
}

function abBuildVariantCards(resultsList: any[], endedAtIso = ""): Variant[] {
  const testEndedMs = endedAtIso ? new Date(endedAtIso).getTime() : NaN;
  const prepared = (Array.isArray(resultsList) ? resultsList : []).map((item, index, list) => {
    const ctrValue = Number.isFinite(item.views) && item.views > 0 ? item.clicks / item.views : item.ctr;
    const next = list[index + 1] || null;
    const nextInstalledMs = next?.installedAt ? new Date(next.installedAt).getTime() : NaN;
    const currentInstalledMs = item.installedAt ? new Date(item.installedAt).getTime() : NaN;
    const endMs = Number.isFinite(nextInstalledMs) ? nextInstalledMs : testEndedMs;
    const installedAtParts = item.installedAt ? abFormatVariantDateTime(item.installedAt) : { date: "", time: "" };
    const hoursValue = Number.isFinite(currentInstalledMs) && Number.isFinite(endMs) ? (endMs - currentInstalledMs) / 3600000 : null;
    return {
      index: index + 1, imageUrl: item.coverUrl, viewsValue: item.views, clicksValue: item.clicks, ctrValue,
      installedAtIso: item.installedAt || "", views: abFormatInt(item.views), clicks: abFormatInt(item.clicks),
      ctr: Number.isFinite(ctrValue) ? abFormatFractionToPercent(ctrValue, 2) : "—",
      installedAtDate: installedAtParts.date || "—", installedAtTime: installedAtParts.time || "",
      hours: Number.isFinite(hoursValue) && hoursValue! >= 0 ? abFormatHours(hoursValue) : "—",
    };
  });
  if (prepared.length) {
    const baseCtr = Number.isFinite(prepared[0]?.ctrValue) && prepared[0].ctrValue !== 0 ? prepared[0].ctrValue : null;
    const bestCtr = prepared.reduce((max, item) => Number.isFinite(item.ctrValue) && item.ctrValue! > max ? item.ctrValue! : max, Number.NEGATIVE_INFINITY);
    return prepared.map(item => ({
      ...item, isBest: Number.isFinite(bestCtr) && Number.isFinite(item.ctrValue) ? Math.abs(item.ctrValue! - bestCtr) <= 1e-9 : false,
      ctrBoostValue: item.index > 1 && baseCtr && Number.isFinite(item.ctrValue) ? item.ctrValue! / baseCtr - 1 : null,
      ctrBoostText: item.index > 1 && baseCtr && Number.isFinite(item.ctrValue) ? abFormatSignedPercentFraction(item.ctrValue! / baseCtr - 1, 0) : "",
      ctrBoostKind: item.index > 1 && baseCtr && Number.isFinite(item.ctrValue) ? (item.ctrValue! / baseCtr - 1 > 0 ? "good" : item.ctrValue! / baseCtr - 1 < 0 ? "bad" : "neutral") : "",
    }));
  }
  return [{ index: 1, imageUrl: "", viewsValue: null, clicksValue: null, ctrValue: null, installedAtIso: "", views: "—", clicks: "—", ctr: "—", installedAtDate: "—", installedAtTime: "", hours: "—", isBest: false, ctrBoostValue: null, ctrBoostText: "", ctrBoostKind: "" }];
}

function abSafeDivide(n: unknown, d: unknown) {
  const num = Number(n), den = Number(d);
  return Number.isFinite(num) && Number.isFinite(den) && den !== 0 ? num / den : null;
}

function abBuildPriceDeltaMetrics(priceBefore: number | null, priceDuring: number | null, priceAfter: number | null) {
  const prices = [priceBefore, priceDuring, priceAfter].filter(v => Number.isFinite(v)) as number[];
  if (!prices.length) return { priceDeltaBefore: null, priceDeltaDuring: null, priceDeltaAfter: null, minPriceDelta: null, maxPriceDelta: null };
  const averagePrice = prices.reduce((s, v) => s + v, 0) / prices.length;
  if (!Number.isFinite(averagePrice) || averagePrice === 0) return { priceDeltaBefore: null, priceDeltaDuring: null, priceDeltaAfter: null, minPriceDelta: null, maxPriceDelta: null };
  const normalizeDelta = (v: number | null) => Number.isFinite(v) ? v! / averagePrice - 1 : null;
  const pdb = normalizeDelta(priceBefore), pdd = normalizeDelta(priceDuring), pda = normalizeDelta(priceAfter);
  const deltas = [pdb, pdd, pda].filter(v => Number.isFinite(v)) as number[];
  return { priceDeltaBefore: pdb, priceDeltaDuring: pdd, priceDeltaAfter: pda, minPriceDelta: deltas.length ? Math.min(...deltas) : null, maxPriceDelta: deltas.length ? Math.max(...deltas) : null };
}

function abResolveCtrDecisionRaw(boostCtr: number | null) { return Number.isFinite(boostCtr) ? (boostCtr! > 0 ? "WIN" : "LOOSE") : "?"; }
function abResolveCtrCr1DecisionRaw(boostCtrCr1: number | null) { return Number.isFinite(boostCtrCr1) ? (boostCtrCr1! >= 0.1 ? "WIN" : "LOOSE") : "?"; }
function abResolvePriceDecisionRaw(a: number | null, b: number | null, c: number | null) {
  const deltas = [a, b, c];
  if (deltas.some(v => !Number.isFinite(v))) return "?";
  return deltas.every(v => Math.abs(v!) <= 0.06) ? "WIN" : "LOOSE";
}
function abResolveOverallDecisionRaw(decisions: string[]) {
  const prepared = decisions.map(i => (i || "").trim().toUpperCase());
  if (!prepared.length || prepared.some(i => !i || i === "?")) return "?";
  return prepared.every(i => i === "WIN") ? "WIN" : "LOOSE";
}

function abBuildTimelineMetricRow(label: string, beforeValue: number | null, duringValue: number | null, afterValue: number | null, formatter: (v: number | null) => string, options: { deltaMode?: string } = {}): ComparisonRow {
  const before = formatter(beforeValue);
  const during = duringValue === undefined || duringValue === null ? "—" : formatter(duringValue);
  const after = formatter(afterValue);
  const shouldCalculateDelta = options.deltaMode !== "none";
  const canCalculateDelta = shouldCalculateDelta && Number.isFinite(beforeValue) && Number.isFinite(afterValue) && Number(beforeValue) !== 0;
  const deltaValue = canCalculateDelta ? Number(afterValue) / Number(beforeValue) - 1 : null;
  const deltaText = Number.isFinite(deltaValue) ? abFormatSignedPercentFraction(deltaValue, 0) : "—";
  const deltaKind = Number.isFinite(deltaValue) ? (deltaValue! > 0 ? "good" : deltaValue! < 0 ? "bad" : "neutral") : "unknown";
  return { label, before, during, after, deltaText, deltaKind };
}

function abCountPriceTransitions(...valuesRaw: (number | null)[]) {
  const values = valuesRaw.filter(v => Number.isFinite(v)) as number[];
  if (values.length < 2) return 0;
  let changes = 0;
  for (let i = 1; i < values.length; i++) if (Math.abs(values[i] - values[i - 1]) > 0.0001) changes++;
  return changes;
}

function abBuildComputedReportLines(metrics: any): string[] {
  return [
    `Буст CTR : ${abFormatFractionToPercent(metrics.boostCtr, 0)}`,
    `Изначальный CTR : ${abFormatFractionToPercent(metrics.oldCtr, 2)}`,
    `Лучший CTR : ${abFormatFractionToPercent(metrics.maxCtr, 2)}`,
    " ",
    `Буст CTR*CR1 : ${abFormatFractionToPercent(metrics.boostCtrCr1, 0)}`,
    `CTR*CR1 до : ${abFormatFractionToPercent(metrics.ctrCr1Before, 2)}`,
    `CTR*CR1 после : ${abFormatFractionToPercent(metrics.ctrCr1After, 2)}`,
    " ",
    `Мин. изменение цены : ${abFormatFractionToPercent(metrics.minPriceDelta, 2)}`,
    `Макс. изменение цены : ${abFormatFractionToPercent(metrics.maxPriceDelta, 2)}`,
  ].filter(l => l.trim() || l === " ");
}

function abBuildComputedMetricsBlock(sourceRow: any, variants: Variant[]) {
  const variantCtrValues = variants.map(i => i.ctrValue).filter(v => Number.isFinite(v)) as number[];
  const oldCtr = Number.isFinite(variantCtrValues[0]) ? variantCtrValues[0] : abToNumber(abCellRaw(sourceRow, "R"));
  const challengerCtrValues = variantCtrValues.slice(1);
  const maxCtr = challengerCtrValues.length ? Math.max(...challengerCtrValues) : oldCtr;
  const boostCtr = Number.isFinite(oldCtr) && oldCtr !== 0 && Number.isFinite(maxCtr) ? maxCtr! / oldCtr! - 1 : null;

  const ctrBefore = abToNumber(abCellRaw(sourceRow, "R"));
  const ctrAfter = abToNumber(abCellRaw(sourceRow, "V"));
  const cr1Before = abToNumber(abCellRaw(sourceRow, "S"));
  const cr1After = abToNumber(abCellRaw(sourceRow, "W"));
  const cr2Before = abToNumber(abCellRaw(sourceRow, "T"));
  const cr2After = abToNumber(abCellRaw(sourceRow, "X"));

  const ctrCr1Before = Number.isFinite(ctrBefore) && Number.isFinite(cr1Before) ? ctrBefore! * cr1Before! : abToNumber(abCellRaw(sourceRow, "Q"));
  const ctrCr1After = Number.isFinite(ctrAfter) && Number.isFinite(cr1After) ? ctrAfter! * cr1After! : abToNumber(abCellRaw(sourceRow, "U"));
  const boostCtrCr1 = Number.isFinite(ctrCr1Before) && ctrCr1Before !== 0 && Number.isFinite(ctrCr1After) ? ctrCr1After! / ctrCr1Before! - 1 : -1;

  const priceBefore = abToNumber(abCellRaw(sourceRow, "AU"));
  const priceDuring = abToNumber(abCellRaw(sourceRow, "AV"));
  const priceAfter = abToNumber(abCellRaw(sourceRow, "AW"));
  const { priceDeltaBefore, priceDeltaDuring, priceDeltaAfter, minPriceDelta, maxPriceDelta } = abBuildPriceDeltaMetrics(priceBefore, priceDuring, priceAfter);

  const priceDecisionRaw = abResolvePriceDecisionRaw(priceDeltaBefore, priceDeltaDuring, priceDeltaAfter);
  const ctrDecisionRaw = abResolveCtrDecisionRaw(boostCtr);
  const ctrCr1DecisionRaw = abResolveCtrCr1DecisionRaw(boostCtrCr1);
  const overallDecisionRaw = abResolveOverallDecisionRaw([ctrDecisionRaw, priceDecisionRaw, ctrCr1DecisionRaw]);

  return { oldCtr, maxCtr, boostCtr, ctrBefore, ctrAfter, cr1Before, cr1After, cr2Before, cr2After, ctrCr1Before, ctrCr1After, boostCtrCr1, priceBefore, priceDuring, priceAfter, priceDeltaBefore, priceDeltaDuring, priceDeltaAfter, minPriceDelta, maxPriceDelta, priceDecisionRaw, ctrDecisionRaw, ctrCr1DecisionRaw, overallDecisionRaw };
}

function abBuildComputedTestCard(sourceRow: any, resultsByTest: Map<string, any[]>, catalogIndex: Map<string, any>): TestCard | null {
  const testId = abNormalizeTestId(abCellRaw(sourceRow, "E"));
  if (!testId) return null;
  const article = abNormalizeNumericId(abCellRaw(sourceRow, "A"));
  const catalog = catalogIndex.get(article) || null;
  const testTitle = (abCellText(sourceRow, "AY") || "").trim();
  const productName = (abCellText(sourceRow, "AX") || "").trim() || catalog?.productName || testTitle || "—";
  const wbUrl = (abCellText(sourceRow, "B") || "").trim() || catalog?.wbUrl || "";
  const xwayUrl = (abCellText(sourceRow, "F") || "").trim();
  const startedAtIso = abParseDateLiteral(abCellRaw(sourceRow, "M"));
  const endedAtIso = abParseDateLiteral(abCellRaw(sourceRow, "O"));
  const campaignExternalId = abExtractCampaignExternalId(testTitle);

  const variants = abBuildVariantCards(resultsByTest.get(testId) || [], endedAtIso || "");
  const mb = abBuildComputedMetricsBlock(sourceRow, variants);

  const metrics = [
    { checkName: "Тест CTR", label: "Буст CTR", valueText: abFormatFractionToPercent(mb.boostCtr, 0), statusRaw: mb.ctrDecisionRaw, statusKind: abNormalizeStatus(mb.ctrDecisionRaw) },
    { checkName: "Тест CTR*CR1", label: "Буст CTR*CR1", valueText: abFormatFractionToPercent(mb.boostCtrCr1, 0), statusRaw: mb.ctrCr1DecisionRaw, statusKind: abNormalizeStatus(mb.ctrCr1DecisionRaw) },
    { checkName: "Тест изм. цены", label: "Old CTR", valueText: abFormatFractionToPercent(mb.oldCtr, 2), statusRaw: mb.priceDecisionRaw, statusKind: abNormalizeStatus(mb.priceDecisionRaw) },
    { checkName: "", label: "Max CTR", valueText: abFormatFractionToPercent(mb.maxCtr, 2), statusRaw: "", statusKind: "unknown" },
    { checkName: "Подсчет CTR*CR1", label: "CTR*CR1 до", valueText: abFormatFractionToPercent(mb.ctrCr1Before, 2), statusRaw: "", statusKind: "unknown" },
    { checkName: "ИТОГ", label: "CTR*CR1 посл��", valueText: abFormatFractionToPercent(mb.ctrCr1After, 2), statusRaw: mb.overallDecisionRaw, statusKind: abNormalizeStatus(mb.overallDecisionRaw) },
  ];

  const ocrBefore = Number.isFinite(mb.ctrBefore) && Number.isFinite(mb.cr1Before) && Number.isFinite(mb.cr2Before) ? mb.ctrBefore! * mb.cr1Before! * mb.cr2Before! * 100 : null;
  const ocrAfter = Number.isFinite(mb.ctrAfter) && Number.isFinite(mb.cr1After) && Number.isFinite(mb.cr2After) ? mb.ctrAfter! * mb.cr1After! * mb.cr2After! * 100 : null;

  const comparisonRows = [
    abBuildTimelineMetricRow("Цена", mb.priceBefore, mb.priceDuring, mb.priceAfter, v => abFormatInt(v)),
    abBuildTimelineMetricRow("Откл. цены", mb.priceDeltaBefore, mb.priceDeltaDuring, mb.priceDeltaAfter, v => abFormatFractionToPercent(v, 0), { deltaMode: "none" }),
    abBuildTimelineMetricRow("CTR", mb.ctrBefore, null, mb.ctrAfter, v => abFormatFractionToPercent(v, 2)),
    abBuildTimelineMetricRow("CR1", mb.cr1Before, null, mb.cr1After, v => abFormatFractionToPercent(v, 2)),
    abBuildTimelineMetricRow("CR2", mb.cr2Before, null, mb.cr2After, v => abFormatFractionToPercent(v, 2)),
    abBuildTimelineMetricRow("CTR*CR1", mb.ctrCr1Before, null, mb.ctrCr1After, v => abFormatFractionToPercent(v, 2)),
    abBuildTimelineMetricRow("CRF x 100", ocrBefore, null, ocrAfter, v => abFormatPercent(v as number, 2)),
  ];

  const reportLines = abBuildComputedReportLines(mb);

  return {
    testId, xwayUrl, wbUrl, article, title: testTitle || productName, productName,
    type: (abCellText(sourceRow, "D") || "").trim(), campaignExternalId,
    cabinet: abResolveCabinet(testTitle), startedAt: abFormatSourceDateTime(abCellRaw(sourceRow, "M")),
    startedAtIso: startedAtIso || "", endedAt: abFormatSourceDateTime(abCellRaw(sourceRow, "O")),
    endedAtIso: endedAtIso || "", metrics, finalStatusRaw: mb.overallDecisionRaw,
    finalStatusKind: abNormalizeStatus(mb.overallDecisionRaw),
    summaryChecks: { testCtr: mb.ctrDecisionRaw, testPrice: mb.priceDecisionRaw, testCtrCr1: mb.ctrCr1DecisionRaw, overall: mb.overallDecisionRaw },
    variants, priceDeviationCount: abFormatInt(abCountPriceTransitions(mb.priceBefore, mb.priceDuring, mb.priceAfter)),
    comparisonRows, reportLines, reportText: reportLines.join("\n"),
  };
}

function abBuildTestCardsFromTechnical(technicalSheet: any, resultsByTest: Map<string, any>, catalogIndex: Map<string, any>): TestCard[] {
  const rows = Array.isArray(technicalSheet?.rows) ? technicalSheet.rows : [];
  const rowsByTestId = new Map();
  for (const row of rows) {
    const testId = abNormalizeTestId(abCellRaw(row, "E"));
    if (!testId) continue;
    const current = rowsByTestId.get(testId);
    const currentMs = current ? new Date(abParseDateLiteral(abCellRaw(current, "M")) || 0).getTime() : -1;
    const nextMs = new Date(abParseDateLiteral(abCellRaw(row, "M")) || 0).getTime();
    if (!current || nextMs >= currentMs) rowsByTestId.set(testId, row);
  }
  return Array.from(rowsByTestId.values()).map(row => abBuildComputedTestCard(row, resultsByTest, catalogIndex)).filter(Boolean) as TestCard[];
}

function abBuildProducts(tests: TestCard[]): Product[] {
  const map = new Map<string, any>();
  for (const test of tests) {
    const key = (test.article || test.testId || "").trim();
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { article: key, title: test.productName || test.title, type: test.type, cabinetSet: new Set(), tests: [], good: 0, bad: 0, unknown: 0, latestAt: test.startedAt || test.endedAt || "" });
    }
    const item = map.get(key);
    item.tests.push(test);
    if (test.cabinet) item.cabinetSet.add(test.cabinet);
    if (test.finalStatusKind === "good") item.good++;
    else if (test.finalStatusKind === "bad") item.bad++;
    else item.unknown++;
    const currentMs = item.latestAt ? new Date(item.latestAt).getTime() : 0;
    const nextMs = test.startedAt ? new Date(test.startedAt).getTime() : 0;
    if (nextMs > currentMs) item.latestAt = test.startedAt;
  }
  return Array.from(map.values()).map(item => ({
    article: item.article, title: item.title, type: item.type,
    cabinets: Array.from(item.cabinetSet) as string[], tests: item.tests, testsCount: item.tests.length,
    good: item.good, bad: item.bad, unknown: item.unknown, latestAt: item.latestAt,
  })).sort((a, b) => b.testsCount !== a.testsCount ? b.testsCount - a.testsCount : 0);
}

function buildAbDashboardModel(source: any): DashboardModel {
  const catalogIndex = abBuildCatalogIndex(source?.catalog);
  const resultsByTest = abParseResultIndex(source?.results);
  const tests = abBuildTestCardsFromTechnical(source?.technical, resultsByTest, catalogIndex)
    .sort((a, b) => {
      const aMs = a.startedAtIso ? new Date(a.startedAtIso).getTime() : 0;
      const bMs = b.startedAtIso ? new Date(b.startedAtIso).getTime() : 0;
      if (aMs !== bMs) return bMs - aMs;
      return Number(b.testId || 0) - Number(a.testId || 0);
    });
  const products = abBuildProducts(tests);
  const cabinets = Array.from(new Set(tests.map(i => i.cabinet).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));
  const statusTotals = tests.reduce((acc, test) => {
    const key = test.finalStatusKind as keyof typeof acc;
    if (key in acc) acc[key]++;
    else acc.unknown++;
    return acc;
  }, { good: 0, bad: 0, neutral: 0, unknown: 0 });
  return { tests, products, cabinets, statusTotals, rowCounts: {
    catalog: Array.isArray(source?.catalog?.rows) ? source.catalog.rows.length : 0,
    technical: Array.isArray(source?.technical?.rows) ? source.technical.rows.length : 0,
    results: Array.isArray(source?.results?.rows) ? source.results.rows.length : 0,
  }};
}

// ── Fetch ──
function abParseGvizResponse(text: string) {
  const marker = "google.visualization.Query.setResponse(";
  const start = text.indexOf(marker);
  if (start < 0) throw new Error("Формат ответа Google Sheets не распознан.");
  const jsonStart = start + marker.length;
  const end = text.lastIndexOf(");");
  if (end <= jsonStart) throw new Error("JSON-пакет Google Sheets не найден.");
  const parsed = JSON.parse(text.slice(jsonStart, end).trim());
  const table = parsed?.table;
  if (!table) throw new Error("В ответе Google Sheets отсутствует table.");
  return table;
}

async function abFetchWithTimeout(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store", credentials: "omit", signal: controller.signal });
    if (!response.ok) throw new Error(`Google Sheets вернул ${response.status}.`);
    return await response.text();
  } catch (error: any) {
    if (error?.name === "AbortError") throw new Error("Превышено время ожидания ответа Google Sheets.");
    throw error;
  } finally { clearTimeout(timeout); }
}

async function fetchAbSheetRaw(sheetConfig: { gid: string }) {
  const gid = (sheetConfig?.gid || "").trim();
  if (!gid) throw new Error("Не задан gid листа Google Sheets.");
  const url = new URL(`https://docs.google.com/spreadsheets/d/${AB_DASHBOARD_SHEET_ID}/gviz/tq`);
  url.searchParams.set("gid", gid);
  url.searchParams.set("tqx", "out:json");
  const responseText = await abFetchWithTimeout(url.toString(), AB_DASHBOARD_FETCH_TIMEOUT_MS);
  const table = abParseGvizResponse(responseText);
  const cols = Array.isArray(table.cols) ? table.cols : [];
  const colIds = cols.map((col: any, index: number) => String(col?.id || `COL_${index + 1}`));
  const rowsRaw = Array.isArray(table.rows) ? table.rows : [];
  const rows = rowsRaw.map((rowRaw: any, rowIndex: number) => {
    const list = Array.isArray(rowRaw?.c) ? rowRaw.c : [];
    const mapped: any = { __rowIndex: rowIndex + 1 };
    for (let i = 0; i < colIds.length; i++) {
      const cell = list[i];
      if (!cell || (!Object.prototype.hasOwnProperty.call(cell, "v") && !Object.prototype.hasOwnProperty.call(cell, "f"))) {
        mapped[colIds[i]] = { v: "", f: "" };
        continue;
      }
      mapped[colIds[i]] = { v: Object.prototype.hasOwnProperty.call(cell, "v") ? cell.v : "", f: Object.prototype.hasOwnProperty.call(cell, "f") ? cell.f : "" };
    }
    return mapped;
  });
  return { cols, colIds, rows };
}

export async function loadAbDashboardData(): Promise<DashboardModel> {
  const [catalog, technical, results] = await Promise.all([
    fetchAbSheetRaw(AB_DASHBOARD_SOURCE_SHEETS.catalog),
    fetchAbSheetRaw(AB_DASHBOARD_SOURCE_SHEETS.technical),
    fetchAbSheetRaw(AB_DASHBOARD_SOURCE_SHEETS.results),
  ]);
  return buildAbDashboardModel({ catalog, technical, results });
}

export function abBuildSourceMetaText(fetchedLabel = ""): string {
  const labels = Object.values(AB_DASHBOARD_SOURCE_SHEETS).map(i => (i.label || "").trim()).filter(Boolean).join(", ");
  return `Источники: таблица «Тесты CTR» · ${labels}.${fetchedLabel ? ` Обновлено: ${fetchedLabel}` : ""}`;
}

// ── Filter & funnel ──
export function abGetTestFilterDate(test: TestCard): string {
  const iso = (test?.startedAtIso || test?.endedAtIso || "").trim();
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function abGetAvailableMonthKeys(model: DashboardModel | null): string[] {
  const tests = Array.isArray(model?.tests) ? model!.tests : [];
  const keys = new Set<string>();
  for (const test of tests) {
    const testDate = abGetTestFilterDate(test);
    const monthKey = testDate ? testDate.slice(0, 7) : "";
    if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) keys.add(monthKey);
  }
  const currentMonthKey = abGetCurrentMonthKey();
  if (currentMonthKey) keys.add(currentMonthKey);
  return Array.from(keys).sort((a, b) => b.localeCompare(a));
}

function abIsGoodStatus(rawValue: string) { return abNormalizeStatus(rawValue) === "good"; }

function abGetSummaryChecksBySource(test: TestCard, sourceKey: string): SummaryChecks | null {
  if (sourceKey === "xway") return test?.xwaySummaryChecks || null;
  return test?.summaryChecks || null;
}

function abGetSummaryStageRaw(checks: SummaryChecks | null, stageKey: string): string {
  if (!checks) return "";
  switch (stageKey) {
    case "ctr": return (checks.testCtr || "").trim();
    case "price": return (checks.testPrice || "").trim();
    case "ctrcr1": return (checks.testCtrCr1 || "").trim();
    case "overall": return (checks.overall || "").trim();
    default: return "";
  }
}

export function abStageMatches(test: TestCard, stageKey: string, sourceKey = "export"): boolean {
  const checks = abGetSummaryChecksBySource(test, sourceKey);
  if (stageKey === "all") return true;
  return abIsGoodStatus(abGetSummaryStageRaw(checks, stageKey));
}

export function abBuildCabinetFunnelCards(tests: TestCard[], cabinetOrder: string[] = [], sourceKey = "export"): FunnelCard[] {
  const list = Array.isArray(tests) ? tests : [];
  const cabinets = cabinetOrder.length ? cabinetOrder : Array.from(new Set(list.map(i => i?.cabinet).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));
  return cabinets.map(cabinet => {
    const cabinetTests = list.filter(i => i?.cabinet === cabinet);
    const total = cabinetTests.length;
    if (!total) return null;
    const ctrPassed = cabinetTests.filter(i => abIsGoodStatus(abGetSummaryStageRaw(abGetSummaryChecksBySource(i, sourceKey), "ctr"))).length;
    const pricePassed = cabinetTests.filter(i => abIsGoodStatus(abGetSummaryStageRaw(abGetSummaryChecksBySource(i, sourceKey), "price"))).length;
    const ctrCr1Passed = cabinetTests.filter(i => abIsGoodStatus(abGetSummaryStageRaw(abGetSummaryChecksBySource(i, sourceKey), "ctrcr1"))).length;
    const overallPassed = cabinetTests.filter(i => abIsGoodStatus(abGetSummaryStageRaw(abGetSummaryChecksBySource(i, sourceKey), "overall"))).length;
    return { cabinet, total, source: sourceKey, stages: [
      { key: "ctr", label: "CTR", count: ctrPassed },
      { key: "price", label: "Цена", count: pricePassed },
      { key: "ctrcr1", label: "CTR x CR1", count: ctrCr1Passed },
      { key: "overall", label: "Итог", count: overallPassed },
    ]};
  }).filter(Boolean) as FunnelCard[];
}

export function abFilterTests(model: DashboardModel, filters: Filters): TestCard[] {
  const tests = model?.tests || [];
  const search = (filters.search || "").trim().toLowerCase();
  const cabinet = filters.cabinet || "all";
  const verdict = filters.verdict || "all";
  const stage = filters.stage || "all";
  const stageSource = filters.stageSource || "export";
  const dateFrom = (filters.dateFrom || "").trim();
  const dateTo = (filters.dateTo || "").trim();
  const monthKeys = (Array.isArray(filters.monthKeys) ? filters.monthKeys : []).filter(v => /^\d{4}-\d{2}$/.test(v));
  return tests.filter(test => {
    if (cabinet !== "all" && test.cabinet !== cabinet) return false;
    if (verdict !== "all" && test.finalStatusKind !== verdict) return false;
    if (stage !== "all" && !abStageMatches(test, stage, stageSource)) return false;
    const testDate = abGetTestFilterDate(test);
    if (monthKeys.length) {
      const testMonthKey = testDate ? testDate.slice(0, 7) : "";
      if (!testMonthKey || !monthKeys.includes(testMonthKey)) return false;
    } else {
      if (dateFrom && (!testDate || testDate < dateFrom)) return false;
      if (dateTo && (!testDate || testDate > dateTo)) return false;
    }
    if (!search) return true;
    const haystack = [test.testId, test.article, test.title, test.cabinet, test.type].join(" ").toLowerCase();
    return haystack.includes(search);
  });
}

export function createDefaultFilters(): Filters {
  const currentMonth = abGetCurrentMonthRange();
  return {
    search: "", cabinet: "all", verdict: "all", stage: "all", stageSource: "export",
    limit: String(AB_TEST_LIMIT_OPTIONS[0]), dateFrom: currentMonth.from, dateTo: currentMonth.to,
    monthKeys: currentMonth.monthKey ? [currentMonth.monthKey] : [], view: "tests",
  };
}

export function abGetFunnelStageStyle(stageKey: string) {
  return AB_FUNNEL_STAGE_STYLES[stageKey] || { colorFrom: "#6B7280", colorTo: "#9CA3AF" };
}

// ── XWAY Integration ──
export interface XwayRequestMeta {
  testId: string;
  campaignType: string;
  campaignExternalId: string;
  startedAt: string;
  endedAt: string;
}

export interface XwayMetricRow {
  key: string;
  label: string;
  kind: string;
  before: number | null;
  after: number | null;
  delta: number | null;
}

export interface XwayMatchedCampaign {
  id: number;
  externalId: string;
  name: string;
}

export interface XwayTotals {
  matchedCount?: number;
  views?: number;
  clicks?: number;
  atbs?: number;
  orders?: number;
}

export interface XwayPayload {
  ok: true;
  source: "xway";
  testId: string;
  campaignType: string;
  campaignExternalId: string;
  range?: {
    before?: string;
    after?: string;
  };
  product?: {
    shopId?: number;
    productId?: number;
    article?: string;
    name?: string;
  };
  test?: {
    id?: number;
    name?: string;
    startedAt?: string;
    endedAt?: string;
  };
  matchedCampaigns?: {
    before?: XwayMatchedCampaign[];
    after?: XwayMatchedCampaign[];
  };
  totals?: {
    before?: XwayTotals;
    after?: XwayTotals;
  };
  metrics?: XwayMetricRow[];
}

function wait(durationMs: number) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(durationMs) || 0)));
}

function isRetryableXwayStatus(statusRaw: unknown) {
  const status = Number(statusRaw);
  return status === 408 || status === 425 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function isRetryableXwayError(error: unknown) {
  if (typeof error !== "object" || !error) {
    return false;
  }
  const maybeStatus = "status" in error ? (error as { status?: unknown }).status : undefined;
  if (isRetryableXwayStatus(maybeStatus)) {
    return true;
  }
  const message = String(error instanceof Error ? error.message : "").toLowerCase();
  return (
    message.includes("failed to fetch")
    || message.includes("network")
    || message.includes("load failed")
    || message.includes("timeout")
    || message.includes("502")
    || message.includes("503")
    || message.includes("504")
  );
}

export function buildXwayRequestMeta(test: Pick<TestCard, "testId" | "type" | "campaignExternalId" | "startedAtIso" | "endedAtIso">): XwayRequestMeta {
  return {
    testId: String(test?.testId || "").trim(),
    campaignType: String(test?.type || "").trim(),
    campaignExternalId: String(test?.campaignExternalId || "").trim(),
    startedAt: String(test?.startedAtIso || "").trim(),
    endedAt: String(test?.endedAtIso || "").trim(),
  };
}

export function buildXwayRequestKey(meta: XwayRequestMeta): string {
  return [
    String(meta?.testId || "").trim(),
    String(meta?.campaignType || "").trim(),
    String(meta?.campaignExternalId || "").trim(),
    String(meta?.startedAt || "").trim(),
    String(meta?.endedAt || "").trim(),
  ].join("|");
}

export async function fetchXwayPayload(
  meta: XwayRequestMeta,
  options: { force?: boolean; retries?: number } = {},
): Promise<XwayPayload> {
  const params = new URLSearchParams({
    testId: String(meta?.testId || "").trim(),
    campaignType: String(meta?.campaignType || "").trim(),
    campaignExternalId: String(meta?.campaignExternalId || "").trim(),
    startedAt: String(meta?.startedAt || "").trim(),
    endedAt: String(meta?.endedAt || "").trim(),
  });
  if (options.force) {
    params.set("_ts", String(Date.now()));
  }

  const retries = Math.max(0, Number(options.retries ?? AB_XWAY_REQUEST_RETRIES) || 0);
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(`/api/xway-ab-test?${params.toString()}`, {
        credentials: "same-origin",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });
      const responseText = await response.text();
      let payload: XwayPayload | null = null;

      if (responseText.trim()) {
        try {
          payload = JSON.parse(responseText) as XwayPayload;
        } catch {
          const parseError = new Error("Сервер вернул невалидный ответ XWAY.");
          (parseError as Error & { status?: number }).status = response.status;
          throw parseError;
        }
      }

      if (!response.ok || !payload?.ok) {
        const requestError = new Error((payload as { message?: string } | null)?.message || "Не удалось получить данные XWAY.");
        (requestError as Error & { status?: number }).status = response.status;
        throw requestError;
      }

      return payload;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error("Не удалось получить данные XWAY.");
      lastError = normalizedError;
      if (attempt < retries && isRetryableXwayError(error)) {
        await wait(AB_XWAY_REQUEST_RETRY_DELAY_MS * (attempt + 1));
        continue;
      }
      throw normalizedError;
    }
  }

  throw lastError || new Error("Не удалось получить данные XWAY.");
}

export function buildXwaySummaryChecksFromPayload(
  test: Pick<TestCard, "summaryChecks">,
  payload: XwayPayload,
): SummaryChecks {
  const exportCtrRaw = String(test?.summaryChecks?.testCtr || "").trim();
  const priceRaw = String(test?.summaryChecks?.testPrice || "").trim();
  const rows = Array.isArray(payload?.metrics) ? payload.metrics : [];
  const ctrCr1Row = rows.find((row) => String(row?.label || "").trim().toUpperCase() === "CTR*CR1");
  const ctrCr1Raw = abResolveCtrCr1DecisionRaw(Number(ctrCr1Row?.delta));
  const overallRaw = abResolveOverallDecisionRaw([exportCtrRaw, priceRaw, ctrCr1Raw]);

  return {
    testCtr: exportCtrRaw,
    testPrice: priceRaw,
    testCtrCr1: String(ctrCr1Raw || "").trim(),
    overall: String(overallRaw || "").trim(),
  };
}

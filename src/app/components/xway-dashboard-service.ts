import {
  AB_TEST_LIMIT_OPTIONS,
  abFormatInt,
  abGetCurrentMonthRange,
  abNormalizeStatus,
  buildXwaySummaryChecksFromPayload,
  loadAbDashboardData,
  type ComparisonRow,
  type DashboardModel,
  type Filters,
  type Product,
  type SummaryChecks,
  type TestCard,
  type Variant,
  type XwayPayload,
} from "./ab-service";

interface XwayAbApiItem {
  id: number;
  name: string;
  productName: string;
  productWbId: string;
  shopName: string;
  type: string;
  status: string;
  launchStatus: string;
  startedAt: string;
  finishedAt: string;
  progress: number;
  views: number;
  cpm: number;
  estimatedExpense: number;
  imagesNum: number;
  shopId: number;
  productId: number;
  imageUrls: string[];
}

interface XwayAbProductImage {
  article: string;
  name: string;
  imageUrl: string;
}

interface XwayAbApiResponse {
  ok: boolean;
  source: string;
  fetchedAt: string;
  total: number;
  items: XwayAbApiItem[];
  productImages: XwayAbProductImage[];
  message?: string;
}

export type XwayDashboardTest = TestCard & {
  shopId: number;
  productId: number;
  launchStatus: string;
  progress: number;
  views: number;
  cpm: number;
  estimatedExpense: number;
  imagesNum: number;
  imageUrls: string[];
  mainImageUrl: string;
  sheetPriceRows: ComparisonRow[];
  sheetPriceDecisionRaw: string;
  sheetPriceDeviationCount: string;
};

export interface XwayDashboardModel extends Omit<DashboardModel, "tests" | "products"> {
  tests: XwayDashboardTest[];
  products: Product[];
  fetchedAt: string;
  total: number;
  liveTotals: {
    done: number;
    launched: number;
    pending: number;
    rejected: number;
    views: number;
    estimatedExpense: number;
  };
}

interface XwaySheetPriceSnapshot {
  rows: ComparisonRow[];
  priceDecisionRaw: string;
  priceDeviationCount: string;
}

function formatDateLabel(valueRaw: string): string {
  const value = String(valueRaw || "").trim();
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function normalizeLaunchStatus(rawValue: string) {
  return String(rawValue || "").trim().toUpperCase();
}

function parseCampaignExternalId(testNameRaw: string) {
  const name = String(testNameRaw || "").trim();
  if (!name) {
    return "";
  }
  const parts = name.split("/").map((part) => part.trim());
  return parts.length >= 3 ? String(parts[2] || "").trim() : "";
}

function buildWbUrl(articleRaw: string) {
  const article = String(articleRaw || "").trim();
  return article ? `https://www.wildberries.ru/catalog/${article}/detail.aspx` : "";
}

function buildXwayUrl(item: XwayAbApiItem) {
  if (item.shopId && item.productId && item.id) {
    return `https://am.xway.ru/wb/shop/${item.shopId}/product/${item.productId}/ab-test/${item.id}`;
  }
  return "https://am.xway.ru/wb/ab-tests";
}

function buildEmptyComparisonRow(label: string): ComparisonRow {
  return {
    label,
    before: "—",
    during: "—",
    after: "—",
    deltaText: "—",
    deltaKind: "unknown",
  };
}

function cloneComparisonRow(row: ComparisonRow): ComparisonRow {
  return {
    label: String(row.label || ""),
    before: String(row.before || "—"),
    during: String(row.during || "—"),
    after: String(row.after || "—"),
    deltaText: String(row.deltaText || "—"),
    deltaKind: String(row.deltaKind || "unknown"),
  };
}

function buildSheetPriceSnapshot(test: TestCard | null): XwaySheetPriceSnapshot | null {
  if (!test) {
    return null;
  }

  const priceRow = test.comparisonRows.find((row) => String(row.label || "").trim() === "Цена");
  const priceDeltaRow = test.comparisonRows.find((row) => String(row.label || "").trim() === "Откл. цены");

  return {
    rows: [
      priceRow ? cloneComparisonRow(priceRow) : buildEmptyComparisonRow("Цена"),
      priceDeltaRow ? cloneComparisonRow(priceDeltaRow) : buildEmptyComparisonRow("Откл. цены"),
    ],
    priceDecisionRaw: String(test.summaryChecks?.testPrice || "?").trim() || "?",
    priceDeviationCount: String(test.priceDeviationCount || "—").trim() || "—",
  };
}

function buildSheetPriceRows(snapshot: XwaySheetPriceSnapshot | null | undefined) {
  if (!snapshot?.rows?.length) {
    return [buildEmptyComparisonRow("Цена"), buildEmptyComparisonRow("Откл. цены")];
  }
  return snapshot.rows.map(cloneComparisonRow);
}

function buildDefaultComparisonRows(sheetPrice: XwaySheetPriceSnapshot | null | undefined) {
  return [
    ...buildSheetPriceRows(sheetPrice),
    buildEmptyComparisonRow("Ставка"),
    buildEmptyComparisonRow("Показы"),
    buildEmptyComparisonRow("CTR"),
    buildEmptyComparisonRow("CR1"),
    buildEmptyComparisonRow("CR2"),
    buildEmptyComparisonRow("CTR*CR1"),
    buildEmptyComparisonRow("CRF x 100"),
  ];
}

function buildPlaceholderVariants(item: XwayAbApiItem, mainImageUrl: string): Variant[] {
  const imageUrls = Array.from(new Set([mainImageUrl, ...(Array.isArray(item.imageUrls) ? item.imageUrls : [])].filter(Boolean)));
  const targetCount = Math.max(1, Number(item.imagesNum) || 0, imageUrls.length);

  return Array.from({ length: targetCount }).map((_, index) => {
    const imageUrl = imageUrls[index] || "";
    const isPending = !imageUrl && index >= imageUrls.length;

    return {
      index: index + 1,
      imageUrl,
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
      statusRaw: isPending ? "IN_QUEUE" : "",
      isPending,
      isActive: false,
    };
  });
}

function buildProducts(tests: XwayDashboardTest[]): Product[] {
  const map = new Map<string, {
    article: string;
    title: string;
    type: string;
    cabinetSet: Set<string>;
    tests: TestCard[];
    good: number;
    bad: number;
    unknown: number;
    latestAt: string;
    latestMs: number;
    latestAtIso: string;
    shopId: number;
    productId: number;
    wbUrl: string;
    currentImageUrl: string;
  }>();

  for (const test of tests) {
    const key = (test.article || test.testId || "").trim();
    if (!key) continue;
    const currentMs = test.startedAtIso ? new Date(test.startedAtIso).getTime() : 0;
    if (!map.has(key)) {
      map.set(key, {
        article: key,
        title: test.productName || test.title,
        type: test.type,
        cabinetSet: new Set<string>(),
        tests: [],
        good: 0,
        bad: 0,
        unknown: 0,
        latestAt: test.startedAt || test.endedAt || "",
        latestMs: currentMs,
        latestAtIso: test.startedAtIso || test.endedAtIso || "",
        shopId: Number(test.shopId) || 0,
        productId: Number(test.productId) || 0,
        wbUrl: String(test.wbUrl || "").trim(),
        currentImageUrl: String(test.mainImageUrl || "").trim(),
      });
    }
    const item = map.get(key)!;
    item.tests.push(test);
    if (test.cabinet) item.cabinetSet.add(test.cabinet);
    if (test.finalStatusKind === "good") item.good += 1;
    else if (test.finalStatusKind === "bad") item.bad += 1;
    else item.unknown += 1;
    if (!item.currentImageUrl && test.mainImageUrl) {
      item.currentImageUrl = String(test.mainImageUrl || "").trim();
    }
    if (currentMs > item.latestMs) {
      item.latestMs = currentMs;
      item.latestAt = test.startedAt || test.endedAt || "";
      item.latestAtIso = test.startedAtIso || test.endedAtIso || item.latestAtIso;
      item.title = test.productName || test.title || item.title;
      item.type = test.type || item.type;
      item.shopId = Number(test.shopId) || item.shopId;
      item.productId = Number(test.productId) || item.productId;
      item.wbUrl = String(test.wbUrl || "").trim() || item.wbUrl;
      item.currentImageUrl = String(test.mainImageUrl || "").trim() || item.currentImageUrl;
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
      latestAtIso: item.latestAtIso,
      shopId: item.shopId,
      productId: item.productId,
      wbUrl: item.wbUrl,
      currentImageUrl: item.currentImageUrl,
      currentStockValue: null,
      currentInStock: null,
    }))
    .sort((a, b) => b.testsCount - a.testsCount);
}

function buildBaseTest(item: XwayAbApiItem, mainImageUrl: string, sheetPrice: XwaySheetPriceSnapshot | null): XwayDashboardTest {
  const article = String(item.productWbId || "").trim();
  const title = String(item.name || "").trim();
  const productName = String(item.productName || "").trim();
  const launchStatus = String(item.launchStatus || "").trim();
  const summaryChecks: SummaryChecks = {
    testCtr: "?",
    testPrice: "?",
    testCtrCr1: "?",
    overall: "?",
  };

  return {
    testId: String(item.id || "").trim(),
    xwayUrl: buildXwayUrl(item),
    wbUrl: buildWbUrl(article),
    shopId: Number(item.shopId) || 0,
    productId: Number(item.productId) || 0,
    article,
    title: title || productName || article || "—",
    productName: productName || title || article || "—",
    type: String(item.type || "").trim() || "MAIN_IMAGE",
    campaignExternalId: parseCampaignExternalId(title),
    cabinet: String(item.shopName || "").trim() || "—",
    startedAt: formatDateLabel(String(item.startedAt || "")),
    startedAtIso: String(item.startedAt || "").trim(),
    endedAt: formatDateLabel(String(item.finishedAt || "")),
    endedAtIso: String(item.finishedAt || "").trim(),
    metrics: [],
    finalStatusRaw: "?",
    finalStatusKind: "unknown",
    summaryChecks,
    xwaySummaryChecks: null,
    variants: buildPlaceholderVariants(item, mainImageUrl),
    priceDeviationCount: sheetPrice?.priceDeviationCount || "—",
    comparisonRows: buildDefaultComparisonRows(sheetPrice),
    reportLines: [],
    reportText: "",
    launchStatus,
    progress: Number(item.progress) || 0,
    views: Number(item.views) || 0,
    cpm: Number(item.cpm) || 0,
    estimatedExpense: Number(item.estimatedExpense) || 0,
    imagesNum: Number(item.imagesNum) || 0,
    imageUrls: Array.isArray(item.imageUrls) ? item.imageUrls.filter(Boolean) : [],
    mainImageUrl,
    sheetPriceRows: buildSheetPriceRows(sheetPrice),
    sheetPriceDecisionRaw: sheetPrice?.priceDecisionRaw || "?",
    sheetPriceDeviationCount: sheetPrice?.priceDeviationCount || "—",
  };
}

export async function loadXwayDashboardData(): Promise<XwayDashboardModel> {
  const [response, legacyDashboardResult] = await Promise.all([
    fetch("/api/xway-ab-tests", {
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    }),
    loadAbDashboardData()
      .then((dashboard) => dashboard)
      .catch(() => null),
  ]);

  const responseText = await response.text();
  let payload: XwayAbApiResponse | null = null;

  if (responseText.trim()) {
    try {
      payload = JSON.parse(responseText) as XwayAbApiResponse;
    } catch {
      throw new Error("Сервер вернул невалидный ответ XWAY.");
    }
  }

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.message || "Не удалось получить список AB-тестов XWAY.");
  }

  const productImageMap = new Map<string, XwayAbProductImage>();
  for (const item of Array.isArray(payload.productImages) ? payload.productImages : []) {
    const article = String(item?.article || "").trim();
    if (!article || productImageMap.has(article)) continue;
    productImageMap.set(article, item);
  }

  const legacyByTestId = new Map<string, TestCard>();
  for (const test of Array.isArray(legacyDashboardResult?.tests) ? legacyDashboardResult.tests : []) {
    const testId = String(test.testId || "").trim();
    if (testId && !legacyByTestId.has(testId)) {
      legacyByTestId.set(testId, test);
    }
  }

  const tests = (Array.isArray(payload.items) ? payload.items : [])
    .map((item) => {
      const article = String(item.productWbId || "").trim();
      const fallback = productImageMap.get(article);
      const mainImageUrl = String(fallback?.imageUrl || "").trim();
      const legacyTest = legacyByTestId.get(String(item.id || "").trim()) || null;

      return buildBaseTest(
        {
          ...item,
          productName: String(item.productName || fallback?.name || "").trim(),
        },
        mainImageUrl,
        buildSheetPriceSnapshot(legacyTest),
      );
    })
    .sort((a, b) => {
      const aMs = a.startedAtIso ? new Date(a.startedAtIso).getTime() : 0;
      const bMs = b.startedAtIso ? new Date(b.startedAtIso).getTime() : 0;
      if (aMs !== bMs) return bMs - aMs;
      return Number(b.testId || 0) - Number(a.testId || 0);
    });

  const products = buildProducts(tests);
  const cabinets = Array.from(new Set(tests.map((test) => test.cabinet).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "ru"),
  );
  const statusTotals = tests.reduce(
    (acc, test) => {
      const key = test.finalStatusKind as keyof typeof acc;
      if (key in acc) acc[key] += 1;
      else acc.unknown += 1;
      return acc;
    },
    { good: 0, bad: 0, neutral: 0, unknown: 0 },
  );

  const liveTotals = tests.reduce(
    (acc, test) => {
      acc.views += test.views;
      acc.estimatedExpense += test.estimatedExpense;
      switch (normalizeLaunchStatus(test.launchStatus)) {
        case "DONE":
          acc.done += 1;
          break;
        case "LAUNCHED":
          acc.launched += 1;
          break;
        case "PENDING":
          acc.pending += 1;
          break;
        case "REJECTED":
          acc.rejected += 1;
          break;
        default:
          break;
      }
      return acc;
    },
    { done: 0, launched: 0, pending: 0, rejected: 0, views: 0, estimatedExpense: 0 },
  );

  return {
    fetchedAt: String(payload.fetchedAt || "").trim(),
    total: Number(payload.total) || tests.length,
    tests,
    products,
    cabinets,
    statusTotals,
    rowCounts: {
      catalog: tests.length,
      technical: Array.isArray(payload.productImages) ? payload.productImages.length : 0,
      results: 0,
    },
    liveTotals,
  };
}

function safeDivide(numeratorRaw: unknown, denominatorRaw: unknown) {
  const numerator = Number(numeratorRaw);
  const denominator = Number(denominatorRaw);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }
  return numerator / denominator;
}

function formatFractionToPercent(valueRaw: number | null | undefined, digits = 2) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits).replace(".", ",")}%`;
}

function formatSignedPercentFraction(valueRaw: number | null | undefined, digits = 0) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return "—";
  const percent = value * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(digits).replace(".", ",")}%`;
}

function formatHours(valueRaw: number | null | undefined) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1).replace(".", ",")} ч`;
}

function formatVariantDateTime(isoRaw: string) {
  const value = String(isoRaw || "").trim();
  if (!value) return { date: "—", time: "" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: "—", time: "" };
  if (date.getFullYear() >= new Date().getFullYear() + 2) return { date: "—", time: "" };
  const pad = (num: number) => String(num).padStart(2, "0");
  return {
    date: `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${String(date.getFullYear()).slice(-2)}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function parseDisplayNumber(valueRaw: string) {
  const value = String(valueRaw || "").trim();
  if (!value || value === "—") return null;
  const normalized = value.replace(/\s+/g, "").replace(",", ".").replace("%", "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function buildPriceDeltaMetrics(priceBefore: number | null, priceDuring: number | null, priceAfter: number | null) {
  const prices = [priceBefore, priceDuring, priceAfter].filter((value) => Number.isFinite(value)) as number[];
  if (!prices.length) {
    return { before: null, during: null, after: null, min: null, max: null };
  }
  const averagePrice = prices.reduce((sum, value) => sum + value, 0) / prices.length;
  if (!Number.isFinite(averagePrice) || averagePrice === 0) {
    return { before: null, during: null, after: null, min: null, max: null };
  }
  const normalizeDelta = (value: number | null) => (Number.isFinite(value) ? value! / averagePrice - 1 : null);
  const before = normalizeDelta(priceBefore);
  const during = normalizeDelta(priceDuring);
  const after = normalizeDelta(priceAfter);
  const deltas = [before, during, after].filter((value) => Number.isFinite(value)) as number[];
  return {
    before,
    during,
    after,
    min: deltas.length ? Math.min(...deltas) : null,
    max: deltas.length ? Math.max(...deltas) : null,
  };
}

function resolveCtrDecisionRaw(boostCtr: number | null) {
  return Number.isFinite(boostCtr) ? (boostCtr! > 0 ? "WIN" : "LOOSE") : "?";
}

function resolveCtrCr1DecisionRaw(deltaRaw: number | null | undefined) {
  const delta = Number(deltaRaw);
  return Number.isFinite(delta) ? (delta >= 0.1 ? "WIN" : "LOOSE") : "?";
}

function resolveOverallDecisionRaw(decisions: string[]) {
  const prepared = decisions.map((value) => String(value || "").trim().toUpperCase());
  if (!prepared.length || prepared.some((value) => !value || value === "?")) return "?";
  return prepared.every((value) => value === "WIN") ? "WIN" : "LOOSE";
}

function normalizeVariantStatus(statusRaw: string) {
  return String(statusRaw || "").trim().toUpperCase();
}

function isPendingVariantStatus(statusRaw: string) {
  const status = normalizeVariantStatus(statusRaw);
  return status === "IN_QUEUE" || status === "PENDING" || status === "WAITING" || status === "CREATED";
}

function isActiveVariantStatus(statusRaw: string) {
  const status = normalizeVariantStatus(statusRaw);
  return status === "LAUNCHED" || status === "ACTIVE" || status === "RUNNING";
}

function getVariantStatusOrder(statusRaw: string) {
  const status = normalizeVariantStatus(statusRaw);
  if (status === "DONE" || status === "TESTED" || status === "COMPLETED") return 0;
  if (status === "LAUNCHED" || status === "ACTIVE" || status === "RUNNING") return 1;
  if (status === "IN_QUEUE" || status === "PENDING" || status === "WAITING" || status === "CREATED") return 2;
  return 3;
}

function buildSheetPriceMetrics(snapshot: XwaySheetPriceSnapshot | null | undefined) {
  const priceRow = snapshot?.rows?.find((row) => String(row.label || "").trim() === "Цена");
  const priceBefore = parseDisplayNumber(priceRow?.before || "");
  const priceDuring = parseDisplayNumber(priceRow?.during || "");
  const priceAfter = parseDisplayNumber(priceRow?.after || "");

  return {
    priceBefore,
    priceDuring,
    priceAfter,
    priceDeltas: buildPriceDeltaMetrics(priceBefore, priceDuring, priceAfter),
  };
}

function buildTimelineMetricRow(
  label: string,
  beforeValue: number | null,
  duringValue: number | null,
  afterValue: number | null,
  formatter: (value: number | null) => string,
  options: { deltaMode?: "default" | "none" } = {},
): ComparisonRow {
  const before = formatter(beforeValue);
  const during = formatter(duringValue);
  const after = formatter(afterValue);
  const shouldCalculateDelta = options.deltaMode !== "none";
  const canCalculateDelta = shouldCalculateDelta && Number.isFinite(beforeValue) && Number.isFinite(afterValue) && Number(beforeValue) !== 0;
  const deltaValue = canCalculateDelta ? Number(afterValue) / Number(beforeValue) - 1 : null;
  const deltaText = Number.isFinite(deltaValue) ? formatSignedPercentFraction(deltaValue, 0) : "—";
  const deltaKind =
    Number.isFinite(deltaValue)
      ? deltaValue! > 0
        ? "good"
        : deltaValue! < 0
          ? "bad"
          : "neutral"
      : "unknown";

  return { label, before, during, after, deltaText, deltaKind };
}

function formatBidValue(valueRaw: number | null) {
  return Number.isFinite(Number(valueRaw)) ? abFormatInt(valueRaw) : "—";
}

function buildVariantCards(test: XwayDashboardTest, payload: XwayPayload) {
  const rawVariants = Array.isArray(payload.variantStats) ? payload.variantStats : [];
  if (!rawVariants.length) {
    return test.variants;
  }

  const seenKeys = new Set<string>();
  const combined: Array<{
    url?: string;
    views?: number | null;
    clicks?: number | null;
    ctr?: number | null;
    status?: string;
    dateStart?: string;
    main?: boolean;
  }> = [];

  const pushVariant = (item: {
    url?: string;
    views?: number | null;
    clicks?: number | null;
    ctr?: number | null;
    status?: string;
    dateStart?: string;
    main?: boolean;
  }) => {
    const url = String(item.url || "").trim();
    if (!url) return;
    const key = url;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    combined.push(item);
  };

  for (const item of rawVariants) {
    pushVariant(item);
  }

  if (!combined.length) {
    return test.variants;
  }

  const ordered = combined.map((item) => ({
    ...item,
    dateMs: item.dateStart ? new Date(item.dateStart).getTime() : 0,
  }))
    .sort((a, b) => {
      const orderDiff = getVariantStatusOrder(String(a.status || "")) - getVariantStatusOrder(String(b.status || ""));
      if (orderDiff !== 0) return orderDiff;
      return 0;
    });
  const baseline = ordered.find((item) => item.main) || ordered.find((item) => Number.isFinite(item.ctr)) || ordered[0];
  const baselineCtr = Number(baseline?.ctr);
  const bestCtr = ordered.reduce((max, item) => {
    if (isPendingVariantStatus(String(item.status || ""))) return max;
    const ctr = Number(item.ctr);
    const views = Number(item.views);
    return Number.isFinite(ctr) && Number.isFinite(views) && views > 0 && ctr > max ? ctr : max;
  }, Number.NEGATIVE_INFINITY);
  const fallbackEndMs = test.endedAtIso ? new Date(test.endedAtIso).getTime() : Date.now();

  return ordered.map((item, index) => {
    const next = ordered[index + 1];
    const statusRaw = normalizeVariantStatus(String(item.status || ""));
    const isPending = isPendingVariantStatus(statusRaw);
    const isActive = isActiveVariantStatus(statusRaw);
    const currentMs = item.dateStart ? new Date(item.dateStart).getTime() : 0;
    const nextMsRaw = next?.dateStart ? new Date(next.dateStart).getTime() : 0;
    const nextMs = nextMsRaw && !isPendingVariantStatus(String(next?.status || "")) && nextMsRaw >= currentMs && nextMsRaw <= fallbackEndMs
      ? nextMsRaw
      : fallbackEndMs;
    const hoursValue = !isPending && currentMs && nextMs && nextMs >= currentMs ? (nextMs - currentMs) / 3_600_000 : null;
    const ctrValue = Number(item.ctr);
    const installedAtIso = !isPending && Number.isFinite(currentMs) && currentMs > 0 && currentMs <= fallbackEndMs ? String(item.dateStart || "").trim() : "";
    const installedAt = formatVariantDateTime(installedAtIso);
    const ctrBoostValue = item !== baseline && !isPending && Number.isFinite(baselineCtr) && baselineCtr !== 0 && Number.isFinite(ctrValue)
      ? ctrValue / baselineCtr - 1
      : null;

    return {
      index: index + 1,
      imageUrl: String(item.url || "").trim(),
      viewsValue: Number.isFinite(Number(item.views)) ? Number(item.views) : null,
      clicksValue: Number.isFinite(Number(item.clicks)) ? Number(item.clicks) : null,
      ctrValue: Number.isFinite(ctrValue) ? ctrValue : null,
      installedAtIso,
      views: abFormatInt(item.views),
      clicks: abFormatInt(item.clicks),
      ctr: formatFractionToPercent(Number.isFinite(ctrValue) ? ctrValue : null, 2),
      installedAtDate: installedAt.date,
      installedAtTime: installedAt.time,
      hours: formatHours(hoursValue),
      isBest: Number.isFinite(bestCtr) && Number.isFinite(ctrValue) && Math.abs(ctrValue - bestCtr) <= 1e-9,
      ctrBoostValue,
      ctrBoostText: Number.isFinite(ctrBoostValue) ? formatSignedPercentFraction(ctrBoostValue, 0) : "",
      ctrBoostKind:
        Number.isFinite(ctrBoostValue)
          ? ctrBoostValue! > 0
            ? "good"
            : ctrBoostValue! < 0
              ? "bad"
              : "neutral"
          : "",
      statusRaw,
      isPending,
      isActive,
    } satisfies Variant;
  });
}

function buildXwaySummaryChecks(payload: XwayPayload, sheetPrice: XwaySheetPriceSnapshot | null): {
  checks: SummaryChecks;
  boostCtr: number | null;
  ctrCr1Delta: number | null;
  priceDeltas: ReturnType<typeof buildPriceDeltaMetrics>;
} {
  const variants = Array.isArray(payload.variantStats) ? payload.variantStats : [];
  const baseline = variants.find((item) => item.main) || variants.find((item) => Number.isFinite(Number(item.ctr))) || variants[0];
  const baselineCtr = Number(baseline?.ctr);
  const bestCtr = variants.reduce((max, item) => {
    const ctr = Number(item?.ctr);
    return Number.isFinite(ctr) && ctr > max ? ctr : max;
  }, Number.NEGATIVE_INFINITY);
  const boostCtr = Number.isFinite(baselineCtr) && baselineCtr !== 0 && Number.isFinite(bestCtr) ? bestCtr / baselineCtr - 1 : null;
  const ctrCr1Delta = payload.metrics?.find((row) => String(row.label || "").trim().toUpperCase() === "CTR*CR1")?.delta ?? null;
  const { priceDeltas } = buildSheetPriceMetrics(sheetPrice);
  const priceDecisionRaw = String(sheetPrice?.priceDecisionRaw || "?").trim() || "?";
  const checks = buildXwaySummaryChecksFromPayload(
    {
      summaryChecks: {
        testCtr: "",
        testPrice: priceDecisionRaw,
        testCtrCr1: "",
        overall: "",
      },
    },
    payload,
  );

  return {
    checks,
    boostCtr,
    ctrCr1Delta: Number.isFinite(Number(ctrCr1Delta)) ? Number(ctrCr1Delta) : null,
    priceDeltas,
  };
}

function buildComparisonRows(payload: XwayPayload, sheetPrice: XwaySheetPriceSnapshot | null): ComparisonRow[] {
  const rowMap = new Map((Array.isArray(payload.metrics) ? payload.metrics : []).map((row) => [String(row.key || ""), row]));
  const metricRow = (key: string) => rowMap.get(key) || null;

  return [
    ...buildSheetPriceRows(sheetPrice),
    buildTimelineMetricRow("Ставка", metricRow("bid")?.before ?? null, metricRow("bid")?.during ?? null, metricRow("bid")?.after ?? null, formatBidValue),
    buildTimelineMetricRow("Показы", metricRow("views")?.before ?? null, metricRow("views")?.during ?? null, metricRow("views")?.after ?? null, (value) => abFormatInt(value)),
    buildTimelineMetricRow("CTR", metricRow("ctr")?.before ?? null, metricRow("ctr")?.during ?? null, metricRow("ctr")?.after ?? null, (value) => formatFractionToPercent(value, 2)),
    buildTimelineMetricRow("CR1", metricRow("cr1")?.before ?? null, metricRow("cr1")?.during ?? null, metricRow("cr1")?.after ?? null, (value) => formatFractionToPercent(value, 2)),
    buildTimelineMetricRow("CR2", metricRow("cr2")?.before ?? null, metricRow("cr2")?.during ?? null, metricRow("cr2")?.after ?? null, (value) => formatFractionToPercent(value, 2)),
    buildTimelineMetricRow("CTR*CR1", metricRow("ctrCr1")?.before ?? null, metricRow("ctrCr1")?.during ?? null, metricRow("ctrCr1")?.after ?? null, (value) => formatFractionToPercent(value, 2)),
    buildTimelineMetricRow("CRF x 100", metricRow("crf100")?.before ?? null, metricRow("crf100")?.during ?? null, metricRow("crf100")?.after ?? null, (value) => formatFractionToPercent(safeDivide(value, 100), 2)),
  ];
}

function buildReportLines(
  payload: XwayPayload,
  boostCtr: number | null,
  ctrCr1Delta: number | null,
  priceDeltas: ReturnType<typeof buildPriceDeltaMetrics>,
) {
  const baseline = Array.isArray(payload.variantStats) ? payload.variantStats.find((item) => item.main) || payload.variantStats[0] : null;
  const bestCtr = (Array.isArray(payload.variantStats) ? payload.variantStats : []).reduce((max, item) => {
    const ctr = Number(item?.ctr);
    return Number.isFinite(ctr) && ctr > max ? ctr : max;
  }, Number.NEGATIVE_INFINITY);

  return [
    `Буст CTR: ${formatFractionToPercent(boostCtr, 0)}`,
    `CTR базовой обложки: ${formatFractionToPercent(Number.isFinite(Number(baseline?.ctr)) ? Number(baseline?.ctr) : null, 2)}`,
    `Лучший CTR: ${formatFractionToPercent(Number.isFinite(bestCtr) ? bestCtr : null, 2)}`,
    " ",
    `Буст CTR*CR1: ${formatFractionToPercent(ctrCr1Delta, 0)}`,
    `CTR*CR1 до: ${formatFractionToPercent(payload.metrics?.find((row) => row.key === "ctrCr1")?.before ?? null, 2)}`,
    `CTR*CR1 после: ${formatFractionToPercent(payload.metrics?.find((row) => row.key === "ctrCr1")?.after ?? null, 2)}`,
    " ",
    `Мин. изменение цены: ${formatFractionToPercent(priceDeltas.min, 2)}`,
    `Макс. изменение цены: ${formatFractionToPercent(priceDeltas.max, 2)}`,
  ].filter((line) => line.trim() || line === " ");
}

export function buildXwayDashboardPatch(test: XwayDashboardTest, payload: XwayPayload): Partial<XwayDashboardTest> {
  const sheetPrice: XwaySheetPriceSnapshot = {
    rows: buildSheetPriceRows({
      rows: Array.isArray(test.sheetPriceRows) ? test.sheetPriceRows : [],
      priceDecisionRaw: test.sheetPriceDecisionRaw,
      priceDeviationCount: test.sheetPriceDeviationCount,
    }),
    priceDecisionRaw: String(test.sheetPriceDecisionRaw || "?").trim() || "?",
    priceDeviationCount: String(test.sheetPriceDeviationCount || "—").trim() || "—",
  };
  const variants = buildVariantCards(test, payload);
  const comparisonRows = buildComparisonRows(payload, sheetPrice);
  const { checks, boostCtr, ctrCr1Delta, priceDeltas } = buildXwaySummaryChecks(payload, sheetPrice);
  const reportLines = buildReportLines(payload, boostCtr, ctrCr1Delta, priceDeltas);
  const overallRaw = String(checks.overall || "").trim();
  const finalStatusRaw = overallRaw && overallRaw !== "?" ? overallRaw : "?";
  const finalStatusKind = overallRaw && overallRaw !== "?"
    ? (abNormalizeStatus(overallRaw) as TestCard["finalStatusKind"])
    : "unknown";

  return {
    summaryChecks: checks,
    xwaySummaryChecks: checks,
    finalStatusRaw,
    finalStatusKind,
    variants,
    comparisonRows,
    priceDeviationCount: sheetPrice.priceDeviationCount,
    reportLines,
    reportText: reportLines.join("\n"),
  };
}

export function buildXwayDashboardSourceMetaText(fetchedLabel = "") {
  return `Источники: XWAY /wb/ab-tests + цена из Google-таблицы.${fetchedLabel ? ` Обновлено: ${fetchedLabel}` : ""}`;
}

export function createDefaultXwayDashboardFilters(): Filters {
  const currentMonth = abGetCurrentMonthRange();
  return {
    search: "",
    cabinet: "all",
    verdict: "all",
    stage: "all",
    stageSource: "xway",
    limit: String(AB_TEST_LIMIT_OPTIONS[0]),
    dateFrom: currentMonth.from,
    dateTo: currentMonth.to,
    monthKeys: currentMonth.monthKey ? [currentMonth.monthKey] : [],
    view: "tests",
  };
}

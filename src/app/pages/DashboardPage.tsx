import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Database, AlertTriangle, Loader2 } from "lucide-react";

import {
  AB_TEST_LIMIT_OPTIONS,
  AB_XWAY_ERROR_CACHE_TTL_MS,
  abBuildDateRangeFromMonthKeys,
  abBuildSourceMetaText,
  abFilterTests,
  abFormatInt,
  abNormalizeStatus,
  buildXwayRequestKey,
  buildXwayRequestMeta,
  buildXwaySummaryChecksFromPayload,
  createDefaultFilters,
  fetchXwayPayload,
  loadAbDashboardData,
  type DashboardModel,
  type Filters,
  type Product,
  type SummaryChecks,
  type TestCard,
  type XwayPayload,
} from "../components/ab-service";
import { BestTestsSection, getBestCompletedTests } from "../components/BestTestsSection";
import { FilterToolbar } from "../components/FilterToolbar";
import { FunnelDashboard } from "../components/FunnelDashboard";
import { ProductGroupsWithTests } from "../components/ProductGroupsWithTests";
import { ProductsTable } from "../components/ProductsTable";
import { TestCardComponent } from "../components/TestCard";
import { XwayDetailsDialog } from "../components/XwayDetailsDialog";

type XwayStatus = "idle" | "loading" | "ready" | "error";

interface XwayStatusEntry {
  status: XwayStatus;
  error?: string;
  updatedAt?: number;
}

type XwayResolvedResult =
  | {
      status: "ready";
      payload: XwayPayload;
      checks: SummaryChecks;
      savedAt: number;
    }
  | {
      status: "error";
      error: string;
      savedAt: number;
    };

interface XwayDialogState {
  open: boolean;
  test: TestCard | null;
  status: XwayStatus;
  payload: XwayPayload | null;
  error: string;
}

interface ProductSnapshotMeta {
  key: string;
  article: string;
  shopId: number;
  productId: number;
}

interface XwayProductSnapshot {
  key: string;
  article: string;
  shopId: number;
  productId: number;
  name: string;
  mainImageUrl: string;
  stockValue: number | null;
  inStock: boolean | null;
}

interface XwayProductSnapshotResponse {
  ok: boolean;
  source: string;
  fetchedAt: string;
  items: XwayProductSnapshot[];
  message?: string;
}

function buildProductSnapshotKey(shopIdRaw: unknown, productIdRaw: unknown) {
  const shopId = Number(shopIdRaw);
  const productId = Number(productIdRaw);
  if (!Number.isFinite(shopId) || shopId <= 0 || !Number.isFinite(productId) || productId <= 0) {
    return "";
  }
  return `${shopId}:${productId}`;
}

function extractProductSnapshotMeta(test: TestCard, payload: XwayPayload): ProductSnapshotMeta | null {
  const shopId = Number(payload?.product?.shopId);
  const productId = Number(payload?.product?.productId);
  const key = buildProductSnapshotKey(shopId, productId);
  if (!key) {
    return null;
  }
  return {
    key,
    article: String(payload?.product?.article || test.article || "").trim(),
    shopId,
    productId,
  };
}

function resolveXwayVerdictKind(test: TestCard) {
  const overall = String(test.xwaySummaryChecks?.overall || "").trim();
  if (!overall || overall === "?") {
    return "unknown";
  }
  return abNormalizeStatus(overall);
}

function buildProducts(tests: TestCard[], productMetaByTestId: Record<string, ProductSnapshotMeta>): Product[] {
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
  }>();

  for (const test of tests) {
    const key = (test.article || test.testId || "").trim();
    if (!key) continue;
    const currentMs = test.startedAtIso ? new Date(test.startedAtIso).getTime() : 0;
    const productMeta = productMetaByTestId[test.testId] || null;
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
        shopId: Number(productMeta?.shopId) || 0,
        productId: Number(productMeta?.productId) || 0,
        wbUrl: String(test.wbUrl || "").trim(),
      });
    }
    const item = map.get(key)!;
    item.tests.push(test);
    if (test.cabinet) item.cabinetSet.add(test.cabinet);
    const xwayVerdictKind = resolveXwayVerdictKind(test);
    if (xwayVerdictKind === "good") item.good += 1;
    else if (xwayVerdictKind === "bad") item.bad += 1;
    else item.unknown += 1;
    if (currentMs > item.latestMs) {
      item.latestMs = currentMs;
      item.latestAt = test.startedAt || test.endedAt || "";
      item.latestAtIso = test.startedAtIso || test.endedAtIso || item.latestAtIso;
      item.title = test.productName || test.title || item.title;
      item.type = test.type || item.type;
      item.wbUrl = String(test.wbUrl || "").trim() || item.wbUrl;
      if (productMeta) {
        item.shopId = Number(productMeta.shopId) || item.shopId;
        item.productId = Number(productMeta.productId) || item.productId;
      }
    } else if ((!item.shopId || !item.productId) && productMeta) {
      item.shopId = Number(productMeta.shopId) || item.shopId;
      item.productId = Number(productMeta.productId) || item.productId;
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
      currentImageUrl: "",
      currentStockValue: null,
      currentInStock: null,
    }))
    .sort((a, b) => b.testsCount - a.testsCount);
}

function mergeProductSnapshots(productsRaw: Product[], snapshotsByKey: Record<string, XwayProductSnapshot>) {
  return productsRaw.map((product) => {
    const snapshot = snapshotsByKey[buildProductSnapshotKey(product.shopId, product.productId)];
    if (!snapshot) {
      return product;
    }
    return {
      ...product,
      currentImageUrl: snapshot.mainImageUrl || product.currentImageUrl || "",
      currentStockValue: snapshot.stockValue,
      currentInStock: snapshot.inStock,
    };
  });
}

function areSummaryChecksEqual(a: SummaryChecks | null | undefined, b: SummaryChecks | null | undefined) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    String(a.testCtr || "") === String(b.testCtr || "")
    && String(a.testPrice || "") === String(b.testPrice || "")
    && String(a.testCtrCr1 || "") === String(b.testCtrCr1 || "")
    && String(a.overall || "") === String(b.overall || "")
  );
}

export function DashboardPage() {
  const [model, setModel] = useState<DashboardModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(createDefaultFilters);
  const [filterCollapsed, setFilterCollapsed] = useState(false);
  const [xwayStatusByTestId, setXwayStatusByTestId] = useState<Record<string, XwayStatusEntry>>({});
  const [xwayDialogState, setXwayDialogState] = useState<XwayDialogState>({
    open: false,
    test: null,
    status: "idle",
    payload: null,
    error: "",
  });
  const [productSnapshotsByKey, setProductSnapshotsByKey] = useState<Record<string, XwayProductSnapshot>>({});

  const xwayCacheRef = useRef(new Map<string, XwayResolvedResult>());
  const xwayInflightRef = useRef(new Map<string, Promise<XwayResolvedResult>>());
  const productSnapshotCacheRef = useRef(new Map<string, XwayProductSnapshot>());
  const productSnapshotInflightRef = useRef(new Set<string>());
  const xwayDialogRequestIdRef = useRef(0);

  const applyXwayChecksToModel = useCallback((testId: string, checks: SummaryChecks | null) => {
    startTransition(() => {
      setModel((current) => {
        if (!current) return current;
        let changed = false;
        const nextTests = current.tests.map((test) => {
          if (test.testId !== testId) return test;
          if (areSummaryChecksEqual(test.xwaySummaryChecks || null, checks)) {
            return test;
          }
          changed = true;
          return {
            ...test,
            xwaySummaryChecks: checks || null,
          };
        });
        return changed ? { ...current, tests: nextTests } : current;
      });
    });
  }, []);

  const updateXwayStatus = useCallback((testId: string, nextStatus: XwayStatus, nextError = "") => {
    if (!testId) return;
    setXwayStatusByTestId((current) => {
      const previous = current[testId];
      if (previous?.status === nextStatus && String(previous?.error || "") === String(nextError || "")) {
        return current;
      }
      return {
        ...current,
        [testId]: {
          status: nextStatus,
          error: nextError || "",
          updatedAt: Date.now(),
        },
      };
    });
  }, []);

  const resolveXwayForTest = useCallback(async (test: TestCard, options: { force?: boolean } = {}) => {
    const meta = buildXwayRequestMeta(test);
    if (!meta.testId) {
      return {
        status: "error" as const,
        error: "Не найден testId.",
        savedAt: Date.now(),
      };
    }

    const key = buildXwayRequestKey(meta);
    if (!options.force) {
      const cached = xwayCacheRef.current.get(key);
      if (cached?.status === "ready") {
        return cached;
      }
      if (cached?.status === "error" && Date.now() - cached.savedAt < AB_XWAY_ERROR_CACHE_TTL_MS) {
        return cached;
      }
    } else {
      xwayCacheRef.current.delete(key);
    }

    const inflight = xwayInflightRef.current.get(key);
    if (inflight) {
      return inflight;
    }

    const task = fetchXwayPayload(meta, { force: options.force })
      .then((payload) => {
        const checks = buildXwaySummaryChecksFromPayload(test, payload);
        const result: XwayResolvedResult = {
          status: "ready",
          payload,
          checks,
          savedAt: Date.now(),
        };
        xwayCacheRef.current.set(key, result);
        return result;
      })
      .catch((requestError) => {
        const result: XwayResolvedResult = {
          status: "error",
          error: requestError instanceof Error ? requestError.message : "Не удалось получить данные XWAY.",
          savedAt: Date.now(),
        };
        xwayCacheRef.current.set(key, result);
        return result;
      })
      .finally(() => {
        xwayInflightRef.current.delete(key);
      });

    xwayInflightRef.current.set(key, task);
    return task;
  }, []);

  const hydrateXwayForTests = useCallback(async (testsRaw: TestCard[], options: { force?: boolean; reset?: boolean } = {}) => {
    const queue = testsRaw
      .map((test) => ({ test, meta: buildXwayRequestMeta(test) }))
      .filter((item) => item.meta.testId);

    if (!queue.length) return;

    const targetIds = new Set(queue.map((item) => item.test.testId));
    if (options.reset) {
      for (const item of queue) {
        xwayCacheRef.current.delete(buildXwayRequestKey(item.meta));
      }
      startTransition(() => {
        setModel((current) => {
          if (!current) return current;
          let changed = false;
          const nextTests = current.tests.map((test) => {
            if (!targetIds.has(test.testId) || !test.xwaySummaryChecks) return test;
            changed = true;
            return {
              ...test,
              xwaySummaryChecks: null,
            };
          });
          return changed ? { ...current, tests: nextTests } : current;
        });
      });
    }

    setXwayStatusByTestId((current) => {
      const next = { ...current };
      let changed = false;
      for (const item of queue) {
        const previous = next[item.test.testId];
        if (previous?.status === "loading" && !options.force) continue;
        next[item.test.testId] = {
          status: "loading",
          error: "",
          updatedAt: Date.now(),
        };
        changed = true;
      }
      return changed ? next : current;
    });

    const worker = async () => {
      while (queue.length) {
        const item = queue.shift();
        if (!item) return;
        const result = await resolveXwayForTest(item.test, { force: options.force });
        if (result.status === "ready") {
          applyXwayChecksToModel(item.test.testId, result.checks);
          updateXwayStatus(item.test.testId, "ready");
        } else {
          applyXwayChecksToModel(item.test.testId, null);
          updateXwayStatus(item.test.testId, "error", result.error);
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, () => worker()));
  }, [applyXwayChecksToModel, resolveXwayForTest, updateXwayStatus]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    xwayCacheRef.current.clear();
    xwayInflightRef.current.clear();
    productSnapshotCacheRef.current.clear();
    productSnapshotInflightRef.current.clear();
    setProductSnapshotsByKey({});
    try {
      const data = await loadAbDashboardData();
      setModel(data);
      setFetchedAt(new Date().toISOString());
      setXwayStatusByTestId({});
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось загрузить AB-данные.");
    } finally {
      setLoading(false);
    }
  }, []);

  const hydrateProductSnapshots = useCallback(async (productsRaw: Product[]) => {
    const queue = productsRaw
      .map((product) => ({
        key: buildProductSnapshotKey(product.shopId, product.productId),
        shopId: Number(product.shopId) || 0,
        productId: Number(product.productId) || 0,
        article: String(product.article || "").trim(),
      }))
      .filter((item) => item.key)
      .filter((item, index, list) => list.findIndex((candidate) => candidate.key === item.key) === index)
      .filter((item) => !productSnapshotCacheRef.current.has(item.key) && !productSnapshotInflightRef.current.has(item.key));

    if (!queue.length) return;

    for (const item of queue) {
      productSnapshotInflightRef.current.add(item.key);
    }

    const chunkSize = 24;
    try {
      for (let start = 0; start < queue.length; start += chunkSize) {
        const chunk = queue.slice(start, start + chunkSize);
        const params = new URLSearchParams();
        for (const item of chunk) {
          params.append("item", `${item.shopId}:${item.productId}:${item.article}`);
        }

        const response = await fetch(`/api/xway-product-snapshots?${params.toString()}`, {
          credentials: "same-origin",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        });
        const responseText = await response.text();
        const payload = responseText.trim() ? (JSON.parse(responseText) as XwayProductSnapshotResponse) : null;
        if (!response.ok || !payload?.ok) {
          throw new Error(payload?.message || "Не удалось получить текущие данные товаров из XWAY.");
        }

        if (Array.isArray(payload.items) && payload.items.length) {
          for (const snapshot of payload.items) {
            const key = buildProductSnapshotKey(snapshot.shopId, snapshot.productId) || String(snapshot.key || "").trim();
            if (!key) continue;
            productSnapshotCacheRef.current.set(key, { ...snapshot, key });
          }

          setProductSnapshotsByKey((current) => {
            const next = { ...current };
            for (const snapshot of payload.items) {
              const key = buildProductSnapshotKey(snapshot.shopId, snapshot.productId) || String(snapshot.key || "").trim();
              if (!key) continue;
              next[key] = { ...snapshot, key };
            }
            return next;
          });
        }
      }
    } finally {
      for (const item of queue) {
        productSnapshotInflightRef.current.delete(item.key);
      }
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleFilterChange = useCallback((partial: Partial<Filters>) => {
    setFilters((previous) => {
      const next = { ...previous, ...partial };
      if (partial.monthKeys) {
        const range = abBuildDateRangeFromMonthKeys(partial.monthKeys);
        if (range.from || range.to) {
          next.dateFrom = range.from;
          next.dateTo = range.to;
        }
      }
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setFilters(createDefaultFilters());
  }, []);

  const handleStageFilter = useCallback((cabinet: string, stage: string, source: string) => {
    setFilters((previous) => {
      const isSame =
        previous.cabinet === cabinet
        && previous.stage === stage
        && (previous.stageSource || "export") === source
        && previous.view === "tests";
      if (isSame) {
        return {
          ...previous,
          cabinet: "all",
          stage: "all",
          stageSource: "export",
        };
      }
      return {
        ...previous,
        cabinet: cabinet || "all",
        stage: stage || "all",
        stageSource: source || "export",
        verdict: "all",
        view: "tests",
      };
    });
  }, []);

  const filteredTests = model ? abFilterTests(model, filters) : [];
  const filteredXwaySignature = useMemo(
    () =>
      filteredTests
        .map((test) => buildXwayRequestKey(buildXwayRequestMeta(test)))
        .sort()
        .join("||"),
    [filteredTests],
  );

  const productMetaByTestId = useMemo(() => {
    const next: Record<string, ProductSnapshotMeta> = {};
    for (const test of filteredTests) {
      const cached = xwayCacheRef.current.get(buildXwayRequestKey(buildXwayRequestMeta(test)));
      if (cached?.status !== "ready") continue;
      const meta = extractProductSnapshotMeta(test, cached.payload);
      if (!meta) continue;
      next[test.testId] = meta;
    }
    return next;
  }, [filteredTests, filteredXwaySignature, xwayStatusByTestId]);

  useEffect(() => {
    if (!model || !filteredXwaySignature) return;
    void hydrateXwayForTests(filteredTests, { force: true, reset: true });
  }, [filteredXwaySignature, filteredTests, hydrateXwayForTests, model]);

  const handleRefreshFilteredXway = useCallback(async () => {
    await hydrateXwayForTests(filteredTests, { force: true, reset: true });
  }, [filteredTests, hydrateXwayForTests]);

  const handleRefreshSingleXway = useCallback(async (test: TestCard) => {
    const meta = buildXwayRequestMeta(test);
    if (!meta.testId) return;
    xwayCacheRef.current.delete(buildXwayRequestKey(meta));
    applyXwayChecksToModel(test.testId, null);
    updateXwayStatus(test.testId, "loading");
    const result = await resolveXwayForTest(test, { force: true });
    if (result.status === "ready") {
      applyXwayChecksToModel(test.testId, result.checks);
      updateXwayStatus(test.testId, "ready");
      if (xwayDialogState.open && xwayDialogState.test?.testId === test.testId) {
        setXwayDialogState({
          open: true,
          test,
          status: "ready",
          payload: result.payload,
          error: "",
        });
      }
      return;
    }
    applyXwayChecksToModel(test.testId, null);
    updateXwayStatus(test.testId, "error", result.error);
    if (xwayDialogState.open && xwayDialogState.test?.testId === test.testId) {
      setXwayDialogState({
        open: true,
        test,
        status: "error",
        payload: null,
        error: result.error,
      });
    }
  }, [applyXwayChecksToModel, resolveXwayForTest, updateXwayStatus, xwayDialogState.open, xwayDialogState.test?.testId]);

  const handleCloseXwayDialog = useCallback(() => {
    xwayDialogRequestIdRef.current += 1;
    setXwayDialogState({
      open: false,
      test: null,
      status: "idle",
      payload: null,
      error: "",
    });
  }, []);

  const handleOpenXwayDialog = useCallback(async (test: TestCard) => {
    const requestId = xwayDialogRequestIdRef.current + 1;
    xwayDialogRequestIdRef.current = requestId;
    setXwayDialogState({
      open: true,
      test,
      status: "loading",
      payload: null,
      error: "",
    });

    const cached = xwayCacheRef.current.get(buildXwayRequestKey(buildXwayRequestMeta(test)));
    const result = await resolveXwayForTest(test, { force: cached?.status === "error" });
    if (xwayDialogRequestIdRef.current !== requestId) return;

    if (result.status === "ready") {
      applyXwayChecksToModel(test.testId, result.checks);
      updateXwayStatus(test.testId, "ready");
      setXwayDialogState({
        open: true,
        test,
        status: "ready",
        payload: result.payload,
        error: "",
      });
      return;
    }

    applyXwayChecksToModel(test.testId, null);
    updateXwayStatus(test.testId, "error", result.error);
    setXwayDialogState({
      open: true,
      test,
      status: "error",
      payload: null,
      error: result.error,
    });
  }, [applyXwayChecksToModel, resolveXwayForTest, updateXwayStatus]);

  const testLimit = Math.max(1, Number(filters.limit) || AB_TEST_LIMIT_OPTIONS[0]);
  const limitedTests = filteredTests.slice(0, testLimit);
  const bestTests = useMemo(() => getBestCompletedTests(filteredTests), [filteredTests]);
  const limitedBestTests = useMemo(() => bestTests.slice(0, testLimit), [bestTests, testLimit]);
  const groupedProducts = buildProducts(filteredTests, productMetaByTestId);
  const filteredProducts = mergeProductSnapshots(groupedProducts, productSnapshotsByKey);
  const limitedProducts = useMemo(
    () => mergeProductSnapshots(buildProducts(limitedTests, productMetaByTestId), productSnapshotsByKey),
    [limitedTests, productMetaByTestId, productSnapshotsByKey],
  );

  const showTests = filters.view === "tests";
  const showProducts = filters.view === "products";
  const showBoth = filters.view === "both";
  const showBest = filters.view === "best";
  const toolbarTests = showBest ? bestTests : filteredTests;

  useEffect(() => {
    if ((!showProducts && !showBoth) || !groupedProducts.length) return;
    void hydrateProductSnapshots(groupedProducts);
  }, [groupedProducts, hydrateProductSnapshots, showBoth, showProducts]);

  const sourceRowsLabel = model
    ? `Строк в подложке: ${abFormatInt(model.rowCounts.catalog)} · строк в техвыгрузке: ${abFormatInt(model.rowCounts.technical)} · строк в результатах обложек: ${abFormatInt(model.rowCounts.results)}`
    : "";

  const fetchedLabel = fetchedAt
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(fetchedAt))
    : "";

  return (
    <div className="space-y-4">
      <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 md:p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
          <div>
            <p className="text-[11px] text-teal-700 dark:text-teal-400 uppercase tracking-[0.14em] mb-0.5" style={{ fontWeight: 700 }}>
              AB-тесты обложек
            </p>
            <h1 className="text-[28px] md:text-[36px] text-slate-900 dark:text-slate-100 tracking-tight" style={{ fontWeight: 800, lineHeight: 1.05 }}>
              Дашборд аналитики
            </h1>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5" style={{ fontWeight: 500, lineHeight: 1.4 }}>
              {fetchedLabel ? abBuildSourceMetaText(fetchedLabel) : "Загрузка источников данных…"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className={`h-10 px-5 rounded-xl border text-[14px] inline-flex items-center gap-2 cursor-pointer transition-all ${
                loading
                  ? "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 cursor-wait"
                  : "border-teal-300 bg-gradient-to-b from-teal-600 to-teal-700 text-white shadow-sm hover:shadow-md hover:from-teal-500 hover:to-teal-600"
              }`}
              style={{ fontWeight: 700 }}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {loading ? "Загрузка…" : "Обновить данные"}
            </button>
          </div>
        </div>
      </header>

      {loading && !model ? (
        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-teal-600 animate-spin shrink-0" />
            <span className="text-[14px] text-slate-600 dark:text-slate-300" style={{ fontWeight: 600 }}>
              Загружаю AB-выгрузки и пересчитываю тесты…
            </span>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="bg-red-50/80 dark:bg-red-900/20 border border-red-200/80 dark:border-red-800/60 rounded-2xl p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] text-red-800 dark:text-red-300" style={{ fontWeight: 600 }}>{error}</p>
              <p className="text-[13px] text-red-500 dark:text-red-400 mt-1" style={{ fontWeight: 500 }}>
                Проверьте доступ к Google Sheets и нажмите «Обновить данные».
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && !error && !model ? (
        <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-slate-400 shrink-0" />
            <span className="text-[14px] text-slate-500 dark:text-slate-400" style={{ fontWeight: 500 }}>
              Нет данных для AB-дашборда.
            </span>
          </div>
        </div>
      ) : null}

      {model ? (
        <>
          <FilterToolbar
            model={model}
            filteredTests={toolbarTests}
            filters={filters}
            onChange={handleFilterChange}
            onReset={handleReset}
            collapsed={filterCollapsed}
            onToggleCollapse={() => setFilterCollapsed((current) => !current)}
          />

          {sourceRowsLabel ? (
            <div className="bg-sky-50/60 dark:bg-sky-900/20 border border-sky-200/60 dark:border-sky-800/40 rounded-xl px-4 py-2 text-[12px] text-sky-800/70 dark:text-sky-300/70" style={{ fontWeight: 600 }}>
              {sourceRowsLabel}
            </div>
          ) : null}

          <FunnelDashboard
            filteredTests={filteredTests}
            filters={filters}
            onStageFilter={handleStageFilter}
            xwayStatusByTestId={xwayStatusByTestId}
            onRefreshXway={handleRefreshFilteredXway}
          />

          {showTests ? (
            <div className="space-y-4">
              {limitedTests.length === 0 ? (
                <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-6 shadow-sm text-center">
                  <p className="text-[14px] text-slate-400" style={{ fontWeight: 500 }}>
                    Нет тестов под выбранные фильтры.
                  </p>
                </div>
              ) : (
                limitedTests.map((test) => (
                  <TestCardComponent
                    key={test.testId}
                    test={test}
                    xwayStatus={xwayStatusByTestId[test.testId]}
                    onRefreshXway={handleRefreshSingleXway}
                    onOpenXwayMetrics={handleOpenXwayDialog}
                  />
                ))
              )}
            </div>
          ) : null}

          {showProducts ? <ProductsTable products={filteredProducts} /> : null}

          {showBoth ? (
            <ProductGroupsWithTests
              products={limitedProducts}
              stickyOffsetClassName={filterCollapsed ? "top-[54px]" : "top-[122px]"}
              renderTest={(test) => (
                <TestCardComponent
                  test={test}
                  xwayStatus={xwayStatusByTestId[test.testId]}
                  onRefreshXway={handleRefreshSingleXway}
                  onOpenXwayMetrics={handleOpenXwayDialog}
                />
              )}
            />
          ) : null}

          {showBest ? <BestTestsSection tests={limitedBestTests} /> : null}
        </>
      ) : null}

      <XwayDetailsDialog
        open={xwayDialogState.open}
        test={xwayDialogState.test}
        status={xwayDialogState.status}
        payload={xwayDialogState.payload}
        error={xwayDialogState.error}
        onClose={handleCloseXwayDialog}
      />
    </div>
  );
}

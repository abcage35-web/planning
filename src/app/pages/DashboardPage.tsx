import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Database, AlertTriangle, Loader2 } from "lucide-react";

import {
  AB_TEST_LIMIT_OPTIONS,
  AB_XWAY_ERROR_CACHE_TTL_MS,
  abBuildDateRangeFromMonthKeys,
  abBuildSourceMetaText,
  abFilterTests,
  abFormatInt,
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
import { FilterToolbar } from "../components/FilterToolbar";
import { FunnelDashboard } from "../components/FunnelDashboard";
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

function buildProducts(tests: TestCard[]): Product[] {
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
  }>();

  for (const test of tests) {
    const key = (test.article || test.testId || "").trim();
    if (!key) continue;
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
      });
    }
    const item = map.get(key)!;
    item.tests.push(test);
    if (test.cabinet) item.cabinetSet.add(test.cabinet);
    if (test.finalStatusKind === "good") item.good += 1;
    else if (test.finalStatusKind === "bad") item.bad += 1;
    else item.unknown += 1;
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
    .sort((a, b) => b.testsCount - a.testsCount);
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
  const [filterCollapsed, setFilterCollapsed] = useState(true);
  const [xwayStatusByTestId, setXwayStatusByTestId] = useState<Record<string, XwayStatusEntry>>({});
  const [xwayDialogState, setXwayDialogState] = useState<XwayDialogState>({
    open: false,
    test: null,
    status: "idle",
    payload: null,
    error: "",
  });

  const xwayCacheRef = useRef(new Map<string, XwayResolvedResult>());
  const xwayInflightRef = useRef(new Map<string, Promise<XwayResolvedResult>>());
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

  useEffect(() => {
    if (!model || !filteredXwaySignature) return;
    void hydrateXwayForTests(filteredTests);
  }, [filteredXwaySignature, hydrateXwayForTests, model]); // filteredTests is encoded in signature.

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
  const filteredProducts = buildProducts(filteredTests);

  const showTests = filters.view === "tests" || filters.view === "both";
  const showProducts = filters.view === "products" || filters.view === "both";

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
            filteredTests={filteredTests}
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

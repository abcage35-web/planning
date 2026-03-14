import { useState } from "react";
import { RefreshCw, BarChart2, PieChart as PieChartIcon } from "lucide-react";
import {
  type TestCard, type FunnelCard, type Filters,
  abBuildCabinetFunnelCards, abGetFunnelStageStyle, abFormatInt,
} from "./ab-service";

type ChartMode = "bars" | "pies";
type XwayStatus = "idle" | "loading" | "ready" | "error";

interface Props {
  filteredTests: TestCard[];
  filters: Filters;
  onStageFilter: (cabinet: string, stage: string, source: string) => void;
  xwayStatusByTestId: Record<string, { status: XwayStatus; error?: string }>;
  onRefreshXway: () => void;
}

export function FunnelDashboard({ filteredTests, filters, onStageFilter, xwayStatusByTestId, onRefreshXway }: Props) {
  const [chartMode, setChartMode] = useState<ChartMode>("bars");

  if (!filteredTests.length) return null;
  const cabinetOrder = Array.from(new Set(filteredTests.map(i => i?.cabinet).filter(Boolean))).sort((a, b) => a.localeCompare(b, "ru"));
  const exportFunnelCards = abBuildCabinetFunnelCards(filteredTests, cabinetOrder, "export");
  if (!exportFunnelCards.length) return null;

  const xwayTrackedTests = filteredTests.filter((item) => String(item?.testId || "").trim());
  const xwayProgress = xwayTrackedTests.reduce(
    (acc, test) => {
      const state = xwayStatusByTestId[test.testId]?.status || "idle";
      if (state === "ready") acc.ready += 1;
      else if (state === "error") acc.errors += 1;
      else if (state === "loading") acc.loading += 1;
      else acc.idle += 1;
      return acc;
    },
    { ready: 0, errors: 0, loading: 0, idle: 0 },
  );
  const xwayTotal = xwayTrackedTests.length;
  const xwayDone = xwayProgress.ready + xwayProgress.errors;
  const hasXwayChecks = filteredTests.some(i => i?.xwaySummaryChecks);
  const xwayFunnelCards = hasXwayChecks
    ? abBuildCabinetFunnelCards(filteredTests, cabinetOrder, "xway")
    : null;
  const xwayStatusText = xwayTotal === 0
    ? "Нет тестов"
    : xwayProgress.loading > 0 || xwayProgress.idle > 0
      ? `Считаю XWAY… ${abFormatInt(xwayDone)} / ${abFormatInt(xwayTotal)}`
      : xwayProgress.errors > 0 && xwayProgress.ready === 0
        ? "XWAY недоступен"
        : xwayProgress.errors > 0
          ? `Готово: ${abFormatInt(xwayProgress.ready)} · ошибки: ${abFormatInt(xwayProgress.errors)}`
          : `Готово: ${abFormatInt(xwayProgress.ready)}`;
  const xwayRefreshDisabled = xwayTotal === 0 || xwayProgress.loading > 0;

  return (
    <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h3 className="text-slate-800 dark:text-slate-100 text-[16px] mb-1" style={{ fontWeight: 700 }}>
            Воронка удачных AB-тестов по кабинетам
          </h3>
          <p className="text-[12px] text-slate-500 dark:text-slate-400 max-w-2xl" style={{ fontWeight: 500, lineHeight: 1.4 }}>
            Текущая выборка по выбранным фильтрам. Отдельно показаны расчеты по выгрузке и по XWAY. Клик по этапу отфильтрует тесты.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Chart mode toggle */}
          <div className="inline-flex items-center p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80">
            <button
              onClick={() => setChartMode("bars")}
              className={`w-8 h-8 rounded-md inline-flex items-center justify-center cursor-pointer transition-all ${
                chartMode === "bars"
                  ? "bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 shadow-sm"
                  : "border border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
              title="Полосы"
            >
              <BarChart2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setChartMode("pies")}
              className={`w-8 h-8 rounded-md inline-flex items-center justify-center cursor-pointer transition-all ${
                chartMode === "pies"
                  ? "bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 shadow-sm"
                  : "border border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
              title="Круговые диаграммы"
            >
              <PieChartIcon className="w-4 h-4" />
            </button>
          </div>
          <span className="inline-flex items-center gap-1.5 h-7 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 text-[12px] text-slate-500 dark:text-slate-400 shrink-0" style={{ fontWeight: 600 }}>
            Кабинетов: <strong className="text-slate-800 dark:text-slate-200">{abFormatInt(exportFunnelCards.length)}</strong>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Export section */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <h4 className="text-[13px] text-slate-700 dark:text-slate-300" style={{ fontWeight: 700 }}>Из выгрузки</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {exportFunnelCards.map(card => (
              <FunnelCardChart key={card.cabinet} card={card} sourceKey="export" filters={filters} onStageFilter={onStageFilter} mode={chartMode} />
            ))}
          </div>
        </div>

        {/* XWAY section */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h4 className="text-[13px] text-slate-700 dark:text-slate-300" style={{ fontWeight: 700 }}>Из XWAY</h4>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center h-6 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 text-[11px] text-slate-500 dark:text-slate-400" style={{ fontWeight: 600 }}>
                {xwayStatusText}
              </span>
              <button
                type="button"
                onClick={onRefreshXway}
                disabled={xwayRefreshDisabled}
                className="h-8 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[12px] inline-flex items-center gap-1.5 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 transition-all disabled:cursor-wait disabled:opacity-70"
                style={{ fontWeight: 600 }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${xwayProgress.loading > 0 ? "animate-spin" : ""}`} />
                Обновить XWAY
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {xwayFunnelCards ? (
              xwayFunnelCards.map(card => (
                <FunnelCardChart key={card.cabinet} card={card} sourceKey="xway" filters={filters} onStageFilter={onStageFilter} mode={chartMode} />
              ))
            ) : (
              exportFunnelCards.map(card => (
                <PendingFunnelCard key={card.cabinet} cabinet={card.cabinet} mode={chartMode} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SVG Donut chart for a single stage ──
function DonutStage({ percent, colorFrom, colorTo, label, count, total, size = 64 }: {
  percent: number;
  colorFrom: string;
  colorTo: string;
  label: string;
  count: number;
  total: number;
  size?: number;
}) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;
  const gradientId = `donut-${label.replace(/\s/g, "")}-${percent}`;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={colorFrom} />
              <stop offset="100%" stopColor={colorTo} />
            </linearGradient>
          </defs>
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-slate-100 dark:text-slate-700/60"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-700 ease-out"
            style={{ filter: `drop-shadow(0 0 4px ${colorFrom}40)` }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[12px] text-slate-800 dark:text-slate-200" style={{ fontWeight: 700 }}>
            {percent}%
          </span>
        </div>
      </div>
      <span className="text-[11px] text-slate-600 dark:text-slate-300 text-center" style={{ fontWeight: 700 }}>
        {label}
      </span>
      <span className="text-[9px] text-slate-400 dark:text-slate-500" style={{ fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>
        {abFormatInt(count)} из {abFormatInt(total)}
      </span>
    </div>
  );
}

// ── Funnel card with bar/pie mode ──
function FunnelCardChart({ card, sourceKey, filters, onStageFilter, mode }: {
  card: FunnelCard;
  sourceKey: string;
  filters: Filters;
  onStageFilter: (c: string, s: string, src: string) => void;
  mode: ChartMode;
}) {
  const finalCount = card.stages[card.stages.length - 1]?.count || 0;
  const finalPercent = card.total > 0 ? Math.round((finalCount / card.total) * 100) : 0;

  return (
    <div className="border border-slate-200/80 dark:border-slate-700/80 rounded-xl bg-gradient-to-br from-white via-white to-slate-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/50 p-5 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h4 className="text-[16px] text-slate-800 dark:text-slate-100" style={{ fontWeight: 700 }}>{card.cabinet}</h4>
          <div className="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5" style={{ fontWeight: 500 }}>
            Успешных итоговых: {abFormatInt(finalCount)} из {abFormatInt(card.total)}
          </div>
        </div>
        <span className={`inline-flex items-center justify-center h-[32px] min-w-[56px] rounded-full border text-[14px] px-3 ${
          finalPercent >= 50
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
            : finalPercent >= 25
            ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
            : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
        }`} style={{ fontWeight: 700 }}>
          {finalPercent}%
        </span>
      </div>

      {mode === "bars" ? (
        /* Bar mode */
        <div className="space-y-3">
          {card.stages.map(stage => {
            const style = abGetFunnelStageStyle(stage.key);
            const percent = card.total > 0 ? Math.round((stage.count / card.total) * 100) : 0;
            const isActive = filters.cabinet === card.cabinet && filters.stage === stage.key && (filters.stageSource || "export") === sourceKey;

            return (
              <button
                key={stage.key}
                onClick={() => onStageFilter(card.cabinet, stage.key, sourceKey)}
                className={`w-full text-left rounded-lg px-1 py-0.5 border transition-all cursor-pointer ${
                  isActive
                    ? "border-sky-300/60 bg-sky-50/40 dark:bg-sky-900/20 dark:border-sky-700/60 shadow-sm"
                    : "border-transparent hover:bg-slate-50/80 dark:hover:bg-slate-800/80"
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[13px] text-slate-700 dark:text-slate-300" style={{ fontWeight: 700 }}>
                    {stage.label}
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[14px] text-slate-800 dark:text-slate-200" style={{ fontWeight: 700 }}>
                      {percent}%
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500" style={{ fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>
                      {abFormatInt(stage.count)} из {abFormatInt(card.total)}
                    </span>
                  </div>
                </div>
                <div className="relative w-full h-[7px] rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${Math.max(percent, 2)}%`,
                      background: `linear-gradient(90deg, ${style.colorFrom}, ${style.colorTo})`,
                      boxShadow: `0 0 8px ${style.colorFrom}40`,
                    }}
                  />
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        /* Pie/donut mode */
        <div className="grid grid-cols-2 gap-4 pt-1">
          {card.stages.map(stage => {
            const style = abGetFunnelStageStyle(stage.key);
            const percent = card.total > 0 ? Math.round((stage.count / card.total) * 100) : 0;
            const isActive = filters.cabinet === card.cabinet && filters.stage === stage.key && (filters.stageSource || "export") === sourceKey;

            return (
              <button
                key={stage.key}
                onClick={() => onStageFilter(card.cabinet, stage.key, sourceKey)}
                className={`rounded-lg p-2 border transition-all cursor-pointer ${
                  isActive
                    ? "border-sky-300/60 bg-sky-50/40 dark:bg-sky-900/20 dark:border-sky-700/60 shadow-sm"
                    : "border-transparent hover:bg-slate-50/80 dark:hover:bg-slate-800/80"
                }`}
              >
                <DonutStage
                  percent={percent}
                  colorFrom={style.colorFrom}
                  colorTo={style.colorTo}
                  label={stage.label}
                  count={stage.count}
                  total={card.total}
                />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PendingFunnelCard({ cabinet, mode }: { cabinet: string; mode: ChartMode }) {
  return (
    <div className="border border-slate-200/80 dark:border-slate-700/80 rounded-xl bg-gradient-to-br from-white via-white to-slate-50/50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800/50 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h4 className="text-[16px] text-slate-800 dark:text-slate-100" style={{ fontWeight: 700 }}>{cabinet}</h4>
          <div className="text-[12px] text-slate-400 dark:text-slate-500 mt-0.5" style={{ fontWeight: 500 }}>Считаю XWAY…</div>
        </div>
        <span className="inline-flex items-center justify-center h-[32px] min-w-[44px] rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-400 text-[14px] px-3" style={{ fontWeight: 700 }}>
          …
        </span>
      </div>

      {mode === "bars" ? (
        <div className="space-y-3">
          {["CTR", "Цена", "CTR x CR1", "Итог"].map((label, i) => (
            <div key={label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] text-slate-400 dark:text-slate-500" style={{ fontWeight: 600 }}>{label}</span>
                <span className="text-[11px] text-slate-300 dark:text-slate-600">—</span>
              </div>
              <div className="relative w-full h-[7px] rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
                <div
                  className="h-full rounded-full animate-pulse"
                  style={{ width: `${(4 - i) * 18 + 10}%`, background: "linear-gradient(90deg, #e2e8f0, #cbd5e1)" }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 pt-1">
          {["CTR", "Цена", "CTR x CR1", "Итог"].map((label) => (
            <div key={label} className="flex flex-col items-center gap-1">
              <div className="relative" style={{ width: 64, height: 64 }}>
                <svg width={64} height={64} viewBox="0 0 64 64" className="-rotate-90">
                  <circle cx={32} cy={32} r={29} fill="none" stroke="currentColor" className="text-slate-100 dark:text-slate-700/60" strokeWidth={6} />
                  <circle cx={32} cy={32} r={29} fill="none" stroke="#e2e8f0" strokeWidth={6} strokeLinecap="round" strokeDasharray={182} strokeDashoffset={140} className="animate-pulse" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-[12px] text-slate-400" style={{ fontWeight: 700 }}>—</span>
                </div>
              </div>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 text-center" style={{ fontWeight: 600 }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

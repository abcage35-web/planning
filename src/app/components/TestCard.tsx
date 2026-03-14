import { useState, useRef, useCallback } from "react";
import { ExternalLink, Info, RefreshCw, BarChart3, ArrowRight, ChevronRight } from "lucide-react";
import { type TestCard as TestCardType, abFormatCompactPeriodDateTime, AB_MATRIX_METRIC_COL_WIDTH, AB_MATRIX_VARIANT_COL_WIDTH } from "./ab-service";
import { StatusPill } from "./StatusPill";

type XwayStatus = "idle" | "loading" | "ready" | "error";

interface Props {
  test: TestCardType;
  xwayStatus?: {
    status: XwayStatus;
    error?: string;
  };
  onRefreshXway: (test: TestCardType) => void;
  onOpenXwayMetrics: (test: TestCardType) => void;
}

export function TestCardComponent({ test, xwayStatus, onRefreshXway, onOpenXwayMetrics }: Props) {
  const [showReport, setShowReport] = useState(false);
  const matrixWidthPx = AB_MATRIX_METRIC_COL_WIDTH + test.variants.length * AB_MATRIX_VARIANT_COL_WIDTH;
  const testPeriodText = `${abFormatCompactPeriodDateTime(test.startedAtIso)} — ${abFormatCompactPeriodDateTime(test.endedAtIso)}`;
  const xwayChecksFlow = test.xwaySummaryChecks
    ? [
        { label: "CTR", raw: test.xwaySummaryChecks.testCtr },
        { label: "Цена", raw: test.xwaySummaryChecks.testPrice },
        { label: "CTR x CR1", raw: test.xwaySummaryChecks.testCtrCr1 },
        { label: "Итог", raw: test.xwaySummaryChecks.overall },
      ]
    : null;

  const checksFlow = [
    { label: "CTR", raw: test.summaryChecks.testCtr },
    { label: "Цена", raw: test.summaryChecks.testPrice },
    { label: "CTR x CR1", raw: test.summaryChecks.testCtrCr1 },
    { label: "Итог", raw: test.summaryChecks.overall },
  ];

  return (
    <article className="border border-slate-200/80 dark:border-slate-700/80 rounded-2xl bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <header className="px-4 pt-2.5 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
              <h4 className="text-[15px] text-slate-900 dark:text-slate-100" style={{ fontWeight: 800, fontFamily: "Inter, sans-serif" }}>
                Тест {test.testId}
              </h4>
              <div className="flex flex-wrap gap-1">
                <Chip label="Артикул" value={test.article || "—"} />
                <Chip label="Тип РК" value={test.type || "—"} />
                <Chip label="Кабинет" value={test.cabinet || "—"} />
              </div>
            </div>
            <p className="text-[12px] text-slate-600 dark:text-slate-400 truncate max-w-[600px]" style={{ fontWeight: 600 }} title={test.title}>
              {test.title || "—"}
            </p>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0" style={{ fontWeight: 500 }}>
              {testPeriodText}
            </p>
          </div>

          {/* Action buttons - top right */}
          <div className="shrink-0 flex items-center gap-1 flex-wrap justify-end">
            <div className="relative">
              <button
                onClick={() => setShowReport(!showReport)}
                className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 inline-flex items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 transition-all"
                title="Показать отчет по расчетам"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
              {showReport && (
                <div className="absolute top-full right-0 mt-1.5 w-[340px] max-w-[calc(100vw-32px)] p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl z-10">
                  <div className="text-[12px] text-slate-700 dark:text-slate-200 mb-1.5" style={{ fontWeight: 700 }}>Отчет по расчетам</div>
                  {test.reportLines.length ? (
                    <ul className="space-y-0.5 pl-4 list-disc">
                      {test.reportLines.map((line, i) =>
                        line.trim() ? (
                          <li key={i} className="text-[11px] text-slate-600 dark:text-slate-400" style={{ fontWeight: 500 }}>{line.replace(/^[-•]\s*/, "")}</li>
                        ) : <li key={i} className="list-none h-1.5" />
                      )}
                    </ul>
                  ) : <div className="text-[11px] text-slate-400" style={{ fontWeight: 500 }}>Без текстового отчета.</div>}
                </div>
              )}
            </div>
            <SmallIconBtn
              icon={<RefreshCw className={`w-3.5 h-3.5 ${xwayStatus?.status === "loading" ? "animate-spin" : ""}`} />}
              title="Обновить XWAY"
              disabled={xwayStatus?.status === "loading"}
              onClick={() => onRefreshXway(test)}
            />
            <SmallIconBtn
              icon={<BarChart3 className="w-3.5 h-3.5" />}
              title="XWAY конверсии"
              onClick={() => onOpenXwayMetrics(test)}
            />
            <LinkBtn url={test.xwayUrl} label="XWay" />
            <LinkBtn url={test.wbUrl} label="WB" />
          </div>
        </div>
      </header>

      {/* Summary checks row - horizontal, visually appealing */}
      <div className="px-4 pb-2">
        <div className="flex gap-2">
          <SummaryCard label="ВЫГРУЗКА" checks={checksFlow} />
          <SummaryCard label="XWAY" checks={xwayChecksFlow} status={xwayStatus?.status || "idle"} error={xwayStatus?.error || ""} />
        </div>
      </div>

      {/* Content: matrix + comparison side by side, same height */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_minmax(420px,0.88fr)] gap-3 px-4 pb-3">
        {/* Left: Variant matrix */}
        <div className="overflow-auto rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900">
          <table
            className="border-collapse"
            style={{ width: `${matrixWidthPx}px`, minWidth: `${matrixWidthPx}px`, tableLayout: "fixed" }}
          >
            <colgroup>
              <col style={{ width: AB_MATRIX_METRIC_COL_WIDTH }} />
              {test.variants.map((_, i) => <col key={i} style={{ width: AB_MATRIX_VARIANT_COL_WIDTH }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className="border-b border-r border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-left text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider" style={{ fontWeight: 700 }}>
                  Метрика
                </th>
                {test.variants.map(v => (
                  <th
                    key={v.index}
                    className={`border-b border-r border-slate-100 dark:border-slate-700 px-2 py-1.5 text-center text-[10px] uppercase tracking-wider ${
                      v.isBest ? "bg-emerald-50/60 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                    }`}
                    style={{ fontWeight: 700 }}
                  >
                    Вариант {v.index}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className="border-b border-r border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 px-2 py-1.5 text-left text-[12px] text-slate-600 dark:text-slate-300" style={{ fontWeight: 700 }}>
                  Обложка
                </th>
                {test.variants.map(v => (
                  <td key={v.index} className="border-b border-r border-slate-100 dark:border-slate-700 px-1.5 py-1.5 text-center h-[80px]">
                    <div className="flex items-center justify-center h-full">
                      {v.imageUrl ? (
                        <CoverImage imageUrl={v.imageUrl} index={v.index} isBest={v.isBest} />
                      ) : (
                        <div className="w-[56px] aspect-[3/4] rounded-md border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-[8px] text-slate-400" style={{ fontWeight: 500 }}>
                          нет обложки
                        </div>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
              <CompactMatrixRow label="Показы" variants={test.variants} render={v => v.views} />
              <CompactMatrixRow label="Клики" variants={test.variants} render={v => v.clicks} />
              <tr>
                <th className="border-b border-r border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 px-2 py-1 text-left text-[12px] text-slate-600 dark:text-slate-300" style={{ fontWeight: 700 }}>
                  CTR
                </th>
                {test.variants.map(v => (
                  <td key={v.index} className="border-b border-r border-slate-100 dark:border-slate-700 px-1.5 py-1 text-center text-[13px] text-slate-800 dark:text-slate-200" style={{ fontWeight: 700 }}>
                    <div className="inline-flex items-center gap-1 flex-wrap justify-center">
                      <span>{v.ctr}</span>
                      {v.ctrBoostText && v.ctrBoostKind && (
                        <span className={`inline-flex items-center h-[18px] px-1 rounded-full text-[9px] border ${
                          v.ctrBoostKind === "good" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                          v.ctrBoostKind === "bad" ? "border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/40 dark:text-red-400" :
                          "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                        }`} style={{ fontWeight: 700 }}>
                          {v.ctrBoostText}
                        </span>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
              <tr>
                <th className="border-b border-r border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 px-2 py-1 text-left text-[12px] text-slate-600 dark:text-slate-300" style={{ fontWeight: 700 }}>
                  Время установки
                </th>
                {test.variants.map(v => (
                  <td key={v.index} className="border-b border-r border-slate-100 dark:border-slate-700 px-1.5 py-1 text-center text-[12px] text-slate-700 dark:text-slate-300" style={{ fontWeight: 600 }}>
                    <div>
                      <div>{v.installedAtDate}</div>
                      <div className="text-[10px] text-slate-400">{v.installedAtTime || "—"}</div>
                    </div>
                  </td>
                ))}
              </tr>
              <CompactMatrixRow label="Время активности" variants={test.variants} render={v => v.hours} isLast />
            </tbody>
          </table>
        </div>

        {/* Right: comparison metrics - no external title, info inside table, matching height */}
        <div className="overflow-auto rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 self-stretch">
          <table className="w-full border-collapse min-w-[360px] h-full">
            <thead>
              <tr>
                <th className="border-b border-r border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-left text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider" style={{ fontWeight: 700 }}>
                  Метрика
                </th>
                <th className="border-b border-r border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-center text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider" style={{ fontWeight: 700 }}>
                  До
                </th>
                <th className="border-b border-r border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-center text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider" style={{ fontWeight: 700 }}>
                  Во время
                </th>
                <th className="border-b border-r border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-center text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider" style={{ fontWeight: 700 }}>
                  После
                </th>
                <th className="border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 text-center text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider" style={{ fontWeight: 700 }}>
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Прирост</span>
                    <div className="relative group">
                      <button className="w-5 h-5 rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-400 inline-flex items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-600 transition-all">
                        <Info className="w-3 h-3" />
                      </button>
                      <div className="invisible group-hover:visible opacity-0 group-hover:opacity-100 absolute top-full right-0 mt-1.5 w-[260px] p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl z-10 transition-all text-left">
                        <div className="text-[11px] text-slate-600 dark:text-slate-400 normal-case tracking-normal" style={{ fontWeight: 500 }}>
                          Количество отклонений цены: {test.priceDeviationCount || "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {test.comparisonRows.map((row, i) => (
                <tr key={i} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors">
                  <td className="border-b border-r border-slate-100 dark:border-slate-700/50 bg-slate-50/60 dark:bg-slate-800/60 px-3 py-1.5 text-[12px] text-slate-700 dark:text-slate-200 whitespace-nowrap" style={{ fontWeight: 700 }}>
                    {row.label}
                  </td>
                  <td className="border-b border-r border-slate-100 dark:border-slate-700/50 px-3 py-1.5 text-center text-slate-600 dark:text-slate-300 whitespace-nowrap" style={{ fontWeight: 600, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
                    {row.before}
                  </td>
                  <td className="border-b border-r border-slate-100 dark:border-slate-700/50 px-3 py-1.5 text-center text-slate-600 dark:text-slate-300 whitespace-nowrap" style={{ fontWeight: 600, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
                    {row.during}
                  </td>
                  <td className="border-b border-r border-slate-100 dark:border-slate-700/50 px-3 py-1.5 text-center text-slate-600 dark:text-slate-300 whitespace-nowrap" style={{ fontWeight: 600, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>
                    {row.after}
                  </td>
                  <td className="border-b border-slate-100 dark:border-slate-700/50 px-3 py-1.5 text-center">
                    {row.deltaText !== "—" ? (
                      <span className={`inline-flex items-center h-[20px] px-1.5 rounded-full text-[10px] border ${
                        row.deltaKind === "good" ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                        row.deltaKind === "bad" ? "border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/40 dark:text-red-400" :
                        row.deltaKind === "neutral" ? "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400" :
                        "border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800"
                      }`} style={{ fontWeight: 700 }}>
                        {row.deltaText}
                      </span>
                    ) : <span className="text-[11px] text-slate-300 dark:text-slate-600">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  );
}

// ── Summary Card - horizontal flow, visually appealing ──
function SummaryCard({
  label,
  checks,
  status = "idle",
  error = "",
}: {
  label: string;
  checks: Array<{ label: string; raw: string }> | null;
  status?: XwayStatus;
  error?: string;
}) {
  return (
    <div className="flex-1 border border-slate-200/80 dark:border-slate-700 rounded-xl bg-gradient-to-r from-slate-50/80 to-white dark:from-slate-800/60 dark:to-slate-900 px-4 py-2.5 overflow-hidden">
      <div className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-[0.12em] mb-2" style={{ fontWeight: 700 }}>{label}</div>
      {checks ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          {checks.map((item, i) => (
            <div key={i} className="inline-flex items-center gap-1.5">
              <StatusPill rawValue={item.raw} compact labelOverride={item.label} />
              {i < checks.length - 1 && (
                <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-600 shrink-0" />
              )}
            </div>
          ))}
        </div>
      ) : status === "error" ? (
        <div className="flex items-center gap-2 py-0.5">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-red-400/80" />
          <span className="text-[11px] text-red-500 dark:text-red-400" style={{ fontWeight: 600 }} title={error || "XWAY недоступен"}>
            XWAY недоступен
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-2 py-0.5">
          <div className={`w-2 h-2 rounded-full ${status === "loading" ? "bg-teal-400/60 animate-pulse" : "bg-slate-300 dark:bg-slate-600"}`} />
          <span className="text-[11px] text-slate-400" style={{ fontWeight: 600 }}>
            {status === "loading" ? "Считаю XWAY…" : "Ожидаю XWAY…"}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Cover image with hover preview ──
function CoverImage({ imageUrl, index, isBest }: { imageUrl: string; index: number; isBest: boolean }) {
  const [preview, setPreview] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });
  const linkRef = useRef<HTMLAnchorElement>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const previewW = 220;
    const previewH = 293;
    let x = e.clientX;
    let y = e.clientY - previewH / 2 - 10;
    if (x + previewW / 2 > window.innerWidth) x = window.innerWidth - previewW / 2 - 8;
    if (x - previewW / 2 < 0) x = previewW / 2 + 8;
    if (y < 8) y = 8;
    if (y + previewH > window.innerHeight - 8) y = window.innerHeight - previewH - 8;
    setPreview({ visible: true, x, y });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setPreview({ visible: false, x: 0, y: 0 });
  }, []);

  return (
    <div className="relative">
      {isBest && (
        <span className="absolute -top-1 -left-1 z-10 inline-flex items-center h-[14px] px-1 rounded-full bg-emerald-500 text-white text-[7px]" style={{ fontWeight: 700 }}>
          Лучшая
        </span>
      )}
      <a
        ref={linkRef}
        href={imageUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`block w-[56px] rounded-md overflow-hidden border-2 transition-all ${isBest ? "border-emerald-400 shadow-sm shadow-emerald-100" : "border-slate-200 dark:border-slate-600 hover:border-slate-300"}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <img src={imageUrl} alt={`Обложка ${index}`} loading="lazy" decoding="async" className="w-full aspect-[3/4] object-cover block" />
      </a>
      {preview.visible && (
        <div
          className="fixed pointer-events-none z-[10000] transition-opacity duration-150"
          style={{ left: preview.x, top: preview.y, width: 220, transform: "translateX(-50%)", opacity: 1 }}
        >
          <img
            src={imageUrl}
            alt={`Обложка ${index} (увеличенная)`}
            className="w-full aspect-[3/4] object-cover block rounded-2xl border border-slate-200/80 bg-white"
            style={{ boxShadow: "0 22px 44px rgba(16,31,41,0.24), 0 4px 12px rgba(16,31,41,0.16)" }}
          />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──
function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-0.5 h-[22px] rounded-full border border-slate-200/80 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 px-2 text-[10px] text-slate-500 dark:text-slate-400" style={{ fontWeight: 600 }}>
      {label}: <strong className="text-slate-700 dark:text-slate-200">{value}</strong>
    </span>
  );
}

function SmallIconBtn({
  icon,
  title,
  onClick,
  disabled = false,
}: {
  icon: React.ReactNode;
  title: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-7 h-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 inline-flex items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 transition-all disabled:cursor-wait disabled:opacity-70"
      title={title}
    >
      {icon}
    </button>
  );
}

function LinkBtn({ url, label }: { url: string; label: string }) {
  if (!url) return <span className="text-[11px] text-slate-300">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-teal-700 dark:text-teal-400 text-[11px] inline-flex items-center gap-1 hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:border-teal-200 dark:hover:border-teal-700 transition-all no-underline"
      style={{ fontWeight: 700 }}
    >
      <ExternalLink className="w-3 h-3" />
      {label}
    </a>
  );
}

function CompactMatrixRow({ label, variants, render, isLast }: { label: string; variants: any[]; render: (v: any) => string; isLast?: boolean }) {
  return (
    <tr>
      <th className={`${isLast ? "" : "border-b"} border-r border-slate-100 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/60 px-2 py-1 text-left text-[12px] text-slate-600 dark:text-slate-300`} style={{ fontWeight: 700 }}>
        {label}
      </th>
      {variants.map(v => (
        <td key={v.index} className={`${isLast ? "" : "border-b"} border-r border-slate-100 dark:border-slate-700 px-1.5 py-1 text-center text-[13px] text-slate-700 dark:text-slate-300`} style={{ fontWeight: 600 }}>
          {render(v)}
        </td>
      ))}
    </tr>
  );
}

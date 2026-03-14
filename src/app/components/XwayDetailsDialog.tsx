import { AlertTriangle, Loader2, X } from "lucide-react";
import { useEffect } from "react";

import {
  buildXwaySummaryChecksFromPayload,
  type SummaryChecks,
  type TestCard,
  type XwayMetricRow,
  type XwayPayload,
  type XwayTotals,
} from "./ab-service";
import { StatusPill } from "./StatusPill";

type DialogStatus = "idle" | "loading" | "ready" | "error";

interface XwayDetailsDialogProps {
  open: boolean;
  test: TestCard | null;
  status: DialogStatus;
  payload: XwayPayload | null;
  error: string;
  onClose: () => void;
}

function formatIsoDate(isoDateRaw: string | undefined) {
  const value = String(isoDateRaw || "").trim();
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(date);
}

function formatXwayMetricValue(valueRaw: number | null | undefined, kind: string | undefined) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return "—";
  if (kind === "percent") {
    return `${(value * 100).toFixed(2).replace(".", ",")}%`;
  }
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatXwayDelta(valueRaw: number | null | undefined) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return "—";
  const percent = value * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(0).replace(".", ",")}%`;
}

function getDeltaKind(valueRaw: number | null | undefined) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return "neutral";
  if (value > 0) return "good";
  if (value < 0) return "bad";
  return "neutral";
}

function buildSummaryFlow(checks: SummaryChecks | null) {
  const items = [
    { label: "CTR", raw: checks?.testCtr || "" },
    { label: "Цена", raw: checks?.testPrice || "" },
    { label: "CTR x CR1", raw: checks?.testCtrCr1 || "" },
    { label: "Итог", raw: checks?.overall || "" },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item, index) => (
        <div key={item.label} className="inline-flex items-center gap-1.5">
          <StatusPill rawValue={item.raw} compact labelOverride={item.label} />
          {index < items.length - 1 ? (
            <span className="text-[11px] text-slate-300 dark:text-slate-600" style={{ fontWeight: 700 }}>
              →
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function getExportComparisonRows(test: TestCard | null) {
  const rows = Array.isArray(test?.comparisonRows) ? test.comparisonRows : [];
  return rows.filter((row) => {
    const label = String(row?.label || "").trim().toUpperCase();
    return label && label !== "ЦЕНА" && label !== "ОТКЛ. ЦЕНЫ";
  });
}

function TotalsCard({ title, totals }: { title: string; totals: XwayTotals | undefined }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700/80 dark:bg-slate-900/70">
      <h4 className="mb-2 text-[13px] text-slate-900 dark:text-slate-100" style={{ fontWeight: 700 }}>
        {title}
      </h4>
      <div className="space-y-1.5 text-[13px] text-slate-600 dark:text-slate-300" style={{ fontWeight: 500 }}>
        <div>
          Кампаний: <strong>{new Intl.NumberFormat("ru-RU").format(Number(totals?.matchedCount) || 0)}</strong>
        </div>
        <div>
          Показы: <strong>{new Intl.NumberFormat("ru-RU").format(Number(totals?.views) || 0)}</strong>
        </div>
        <div>
          Клики: <strong>{new Intl.NumberFormat("ru-RU").format(Number(totals?.clicks) || 0)}</strong>
        </div>
        <div>
          ATB: <strong>{new Intl.NumberFormat("ru-RU").format(Number(totals?.atbs) || 0)}</strong>
        </div>
        <div>
          Заказы: <strong>{new Intl.NumberFormat("ru-RU").format(Number(totals?.orders) || 0)}</strong>
        </div>
      </div>
    </div>
  );
}

function MetricsTable({
  rows,
  useRawExportRows = false,
  emptyMessage,
}: {
  rows: Array<XwayMetricRow | TestCard["comparisonRows"][number]>;
  useRawExportRows?: boolean;
  emptyMessage: string;
}) {
  if (!rows.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200/80 px-4 py-6 text-[13px] text-slate-400 dark:border-slate-700/80 dark:text-slate-500">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
      <table className="w-full min-w-[440px] border-collapse">
        <thead>
          <tr>
            {["Метрика", "До", "После", "Прирост"].map((head) => (
              <th
                key={head}
                className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-left text-[10px] uppercase tracking-[0.12em] text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                style={{ fontWeight: 700 }}
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const isExportRow = useRawExportRows;
            const beforeText = isExportRow
              ? String((row as TestCard["comparisonRows"][number]).before || "—")
              : formatXwayMetricValue((row as XwayMetricRow).before, (row as XwayMetricRow).kind);
            const afterText = isExportRow
              ? String((row as TestCard["comparisonRows"][number]).after || "—")
              : formatXwayMetricValue((row as XwayMetricRow).after, (row as XwayMetricRow).kind);
            const deltaText = isExportRow
              ? String((row as TestCard["comparisonRows"][number]).deltaText || "—")
              : formatXwayDelta((row as XwayMetricRow).delta);
            const deltaKind = isExportRow
              ? String((row as TestCard["comparisonRows"][number]).deltaKind || "unknown")
              : getDeltaKind((row as XwayMetricRow).delta);
            return (
              <tr key={`${String(row.label || "metric")}-${index}`} className="odd:bg-white even:bg-slate-50/40 dark:odd:bg-slate-950 dark:even:bg-slate-900/70">
                <td className="border-b border-slate-100 px-3 py-2 text-[12px] text-slate-700 dark:border-slate-700 dark:text-slate-200" style={{ fontWeight: 700 }}>
                  {String(row.label || "—")}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 font-mono text-[12px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  {beforeText}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 font-mono text-[12px] text-slate-600 dark:border-slate-700 dark:text-slate-300">
                  {afterText}
                </td>
                <td className="border-b border-slate-100 px-3 py-2 dark:border-slate-700">
                  {deltaText !== "—" ? (
                    <span
                      className={`inline-flex h-[22px] items-center rounded-full border px-2 text-[11px] ${
                        deltaKind === "good"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                          : deltaKind === "bad"
                            ? "border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/40 dark:text-red-400"
                            : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                      style={{ fontWeight: 700 }}
                    >
                      {deltaText}
                    </span>
                  ) : (
                    <span className="text-[12px] text-slate-300 dark:text-slate-600">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CampaignList({ title, items }: { title: string; items: Array<{ id?: number; name?: string }> }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700/80 dark:bg-slate-900/70">
      <h4 className="mb-2 text-[13px] text-slate-900 dark:text-slate-100" style={{ fontWeight: 700 }}>
        {title}
      </h4>
      {items.length ? (
        <ul className="space-y-1 text-[13px] text-slate-600 dark:text-slate-300" style={{ fontWeight: 500 }}>
          {items.map((item, index) => (
            <li key={`${String(item.id || "item")}-${index}`}>{item.name || String(item.id || "—")}</li>
          ))}
        </ul>
      ) : (
        <div className="text-[13px] text-slate-400 dark:text-slate-500">Нет кампаний этого типа.</div>
      )}
    </div>
  );
}

export function XwayDetailsDialog({
  open,
  test,
  status,
  payload,
  error,
  onClose,
}: XwayDetailsDialogProps) {
  useEffect(() => {
    if (!open) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose, open]);

  if (!open || !test) return null;

  const exportRows = getExportComparisonRows(test);
  const xwayChecks = payload ? buildXwaySummaryChecksFromPayload(test, payload) : test.xwaySummaryChecks || null;
  const campaignType = String(payload?.campaignType || test.type || "").trim() || "—";
  const campaignExternalId = String(payload?.campaignExternalId || test.campaignExternalId || "").trim();
  const beforeDate = formatIsoDate(payload?.range?.before);
  const afterDate = formatIsoDate(payload?.range?.after);
  const xwayRows = Array.isArray(payload?.metrics) ? payload.metrics : [];
  const campaignsBefore = Array.isArray(payload?.matchedCampaigns?.before) ? payload?.matchedCampaigns?.before : [];
  const campaignsAfter = Array.isArray(payload?.matchedCampaigns?.after) ? payload?.matchedCampaigns?.after : [];

  return (
    <div className="fixed inset-0 z-[110]">
      <button
        type="button"
        aria-label="Закрыть XWAY диалог"
        className="absolute inset-0 bg-slate-950/58 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="absolute inset-x-0 top-0 flex justify-center px-4 py-6 md:px-8">
        <div className="relative flex max-h-[calc(100vh-48px)] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-slate-200/80 bg-white shadow-[0_32px_90px_-40px_rgba(15,23,42,0.6)] dark:border-slate-700/80 dark:bg-slate-950">
          <header className="flex items-start justify-between gap-4 border-b border-slate-200/80 px-6 py-5 dark:border-slate-800">
            <div>
              <h3 className="text-[24px] text-slate-900 dark:text-slate-50" style={{ fontWeight: 800 }}>
                XWAY • Тест {test.testId}
              </h3>
              <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400" style={{ fontWeight: 500 }}>
                Тип РК: {campaignType}
                {campaignExternalId ? ` · ID РК: ${campaignExternalId}` : ""}
                {payload ? ` · До: ${beforeDate} · После: ${afterDate}` : ""}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="overflow-y-auto px-6 py-5">
            {status === "loading" ? (
              <div className="flex min-h-[260px] items-center justify-center">
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-5 py-4 text-[14px] text-slate-600 dark:border-slate-700/80 dark:bg-slate-900/70 dark:text-slate-300">
                  <Loader2 className="h-5 w-5 animate-spin text-teal-600 dark:text-teal-400" />
                  <span style={{ fontWeight: 600 }}>Загружаю XWAY-метрики по выбранному типу РК…</span>
                </div>
              </div>
            ) : null}

            {status === "error" ? (
              <div className="space-y-5">
                <div className="flex items-start gap-3 rounded-2xl border border-red-200/80 bg-red-50/80 px-4 py-3 text-red-800 dark:border-red-800/70 dark:bg-red-950/30 dark:text-red-300">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <div className="text-[14px]" style={{ fontWeight: 700 }}>
                      {error || "Ошибка загрузки XWAY-данных."}
                    </div>
                    <div className="mt-1 text-[13px]" style={{ fontWeight: 500 }}>
                      Ниже показан результат по выгрузке, чтобы сравнение не терялось полностью.
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700/80 dark:bg-slate-900/70">
                    <div className="mb-3 text-[13px] text-slate-900 dark:text-slate-100" style={{ fontWeight: 700 }}>
                      Результат по выгрузке
                    </div>
                    {buildSummaryFlow(test.summaryChecks)}
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700/80 dark:bg-slate-900/70">
                    <div className="mb-3 text-[13px] text-slate-900 dark:text-slate-100" style={{ fontWeight: 700 }}>
                      Результат по XWAY
                    </div>
                    <div className="text-[13px] text-slate-500 dark:text-slate-400" style={{ fontWeight: 500 }}>
                      XWAY сейчас недоступен, поэтому сравнение по серверным метрикам не построено.
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-3">
                    <div className="text-[13px] text-slate-900 dark:text-slate-100" style={{ fontWeight: 700 }}>
                      Из выгрузки
                    </div>
                    <MetricsTable rows={exportRows} useRawExportRows emptyMessage="Нет метрик в выгрузке." />
                  </div>
                </div>
              </div>
            ) : null}

            {status === "ready" && payload ? (
              <div className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <TotalsCard title="До" totals={payload.totals?.before} />
                  <TotalsCard title="После" totals={payload.totals?.after} />
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700/80 dark:bg-slate-900/70">
                    <div className="mb-3 text-[13px] text-slate-900 dark:text-slate-100" style={{ fontWeight: 700 }}>
                      Результат по выгрузке
                    </div>
                    {buildSummaryFlow(test.summaryChecks)}
                  </div>
                  <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 dark:border-slate-700/80 dark:bg-slate-900/70">
                    <div className="mb-3 text-[13px] text-slate-900 dark:text-slate-100" style={{ fontWeight: 700 }}>
                      Результат по XWAY
                    </div>
                    {buildSummaryFlow(xwayChecks)}
                    <div className="mt-3 text-[12px] text-slate-500 dark:text-slate-400" style={{ fontWeight: 500 }}>
                      Этап «Цена» для XWAY берется из выгрузки, потому что XWAY не отдает ценовые изменения.
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className="space-y-3">
                    <div className="text-[13px] text-slate-900 dark:text-slate-100" style={{ fontWeight: 700 }}>
                      Из выгрузки
                    </div>
                    <MetricsTable rows={exportRows} useRawExportRows emptyMessage="Нет метрик в выгрузке." />
                  </div>
                  <div className="space-y-3">
                    <div className="text-[13px] text-slate-900 dark:text-slate-100" style={{ fontWeight: 700 }}>
                      Из XWAY
                    </div>
                    <MetricsTable rows={xwayRows} emptyMessage="Нет метрик для выбранного типа РК." />
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <CampaignList title="Кампании до" items={campaignsBefore} />
                  <CampaignList title="Кампании после" items={campaignsAfter} />
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

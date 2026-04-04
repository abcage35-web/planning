import { useState, type ReactNode } from "react";
import { ExternalLink, Trophy } from "lucide-react";

import { abBuildXwayAbTestUrl, abBuildXwayRkUrl, abFormatCompactPeriodDateTime, abNormalizeStatus, type ComparisonRow, type TestCard, type Variant } from "./ab-service";

interface Props {
  tests: TestCard[];
  emptyMessage?: string;
}

interface MetricRow {
  key: string;
  label: string;
  before: ReactNode;
  during?: ReactNode;
  after: ReactNode;
  growthText?: string;
  growthKind?: string;
  growthNode?: ReactNode;
  highlight?: boolean;
}

type BestViewMode = "full" | "compact";

const BEST_RK_METRICS = ["Цена", "Откл. цены", "Ставка", "Показы", "CTR", "CR1", "CTR*CR1"];

function shouldShowCampaignType(typeRaw: string | null | undefined) {
  const value = String(typeRaw || "").trim();
  if (!value) return false;
  return !/^MAIN[\s_-]?IMAGE$/i.test(value);
}

function parseDisplayNumber(valueRaw: string | number | null | undefined) {
  if (typeof valueRaw === "number") {
    return Number.isFinite(valueRaw) ? valueRaw : null;
  }
  const value = String(valueRaw || "").trim();
  if (!value || value === "—") return null;
  const normalized = value.replace(/\s+/g, "").replace("%", "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatSignedPercentDelta(beforeRaw: number | null, afterRaw: number | null) {
  const before = Number(beforeRaw);
  const after = Number(afterRaw);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === 0) return "";
  const delta = after / before - 1;
  if (!Number.isFinite(delta)) return "";
  const percent = delta * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(0).replace(".", ",")}%`;
}

function resolveDeltaKind(beforeRaw: number | null, afterRaw: number | null) {
  const before = Number(beforeRaw);
  const after = Number(afterRaw);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === 0) return "unknown";
  const delta = after / before - 1;
  if (!Number.isFinite(delta)) return "unknown";
  if (delta > 0) return "good";
  if (delta < 0) return "bad";
  return "neutral";
}

function getComparisonRow(test: TestCard, label: string) {
  return test.comparisonRows.find((row) => String(row.label || "").trim() === label) || null;
}

function getCtrCr1GrowthScore(test: TestCard) {
  const row = getComparisonRow(test, "CTR*CR1");
  const before = parseDisplayNumber(row?.before ?? null);
  const after = parseDisplayNumber(row?.after ?? null);
  if (!Number.isFinite(before) || !Number.isFinite(after) || before === 0) {
    return null;
  }
  return after / before - 1;
}

function getCtrCr1GrowthText(test: TestCard) {
  const row = getComparisonRow(test, "CTR*CR1");
  const current = String(row?.deltaText || "").trim();
  if (current && current !== "—") {
    return current;
  }
  return formatSignedPercentDelta(parseDisplayNumber(row?.before ?? null), parseDisplayNumber(row?.after ?? null)) || "—";
}

function isCompletedTest(test: TestCard) {
  const launchStatus = String((test as { launchStatus?: string })?.launchStatus || "").trim().toUpperCase();
  if (["DONE", "COMPLETED", "FINISHED", "REJECTED", "STOPPED"].includes(launchStatus)) return true;
  if (["LAUNCHED", "PENDING", "ACTIVE", "RUNNING", "CREATED", "IN_PROGRESS"].includes(launchStatus)) return false;
  return Boolean(String(test.endedAtIso || "").trim());
}

function isSuccessfulCleanTest(test: TestCard) {
  return abNormalizeStatus(String(test.summaryChecks?.overall || "").trim()) === "good";
}

function sortTimestampDesc(a: TestCard, b: TestCard) {
  const aMs = a.endedAtIso ? new Date(a.endedAtIso).getTime() : a.startedAtIso ? new Date(a.startedAtIso).getTime() : 0;
  const bMs = b.endedAtIso ? new Date(b.endedAtIso).getTime() : b.startedAtIso ? new Date(b.startedAtIso).getTime() : 0;
  return bMs - aMs;
}

function getBaselineVariant(test: TestCard) {
  return test.variants[0] || null;
}

function getBestVariant(test: TestCard) {
  const explicitBest = test.variants.find((variant) => variant.isBest);
  if (explicitBest) return explicitBest;
  return test.variants.reduce<Variant | null>((best, current) => {
    if (!best) return current;
    if (!Number.isFinite(best.ctrValue) && Number.isFinite(current.ctrValue)) return current;
    if (Number.isFinite(best.ctrValue) && Number.isFinite(current.ctrValue) && Number(current.ctrValue) > Number(best.ctrValue)) {
      return current;
    }
    return best;
  }, null);
}

function formatBlockDate(isoRaw: string, fallbackRaw = "") {
  const iso = String(isoRaw || "").trim();
  if (iso) return abFormatCompactPeriodDateTime(iso);
  const fallback = String(fallbackRaw || "").trim();
  return fallback || "—";
}

function shiftIsoDateTime(isoRaw: string, days: number) {
  const iso = String(isoRaw || "").trim();
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function formatAbTestActivityPeriod(test: TestCard) {
  const startedAt = formatBlockDate(String(test.abActivityStartedAtIso || "").trim() || test.startedAtIso, test.startedAt);
  const endedAt = formatBlockDate(String(test.abActivityEndedAtIso || "").trim() || test.endedAtIso, test.endedAt);
  if (startedAt === "—" && endedAt === "—") {
    return "—";
  }
  if (startedAt === endedAt || endedAt === "—") {
    return startedAt;
  }
  if (startedAt === "—") {
    return endedAt;
  }
  return `${startedAt} — ${endedAt}`;
}

function getVisibleComparisonRows(test: TestCard) {
  return BEST_RK_METRICS
    .map((label) => getComparisonRow(test, label))
    .filter(Boolean) as ComparisonRow[];
}

function getRkGrowth(row: ComparisonRow) {
  const current = String(row.deltaText || "").trim();
  if (current && current !== "—") {
    return { text: current, kind: row.deltaKind || "unknown" };
  }
  const before = parseDisplayNumber(row.before);
  const after = parseDisplayNumber(row.after);
  return {
    text: formatSignedPercentDelta(before, after),
    kind: resolveDeltaKind(before, after),
  };
}

function CoverPreview({
  variant,
  fallbackLabel,
  badge,
}: {
  variant: Variant | null;
  fallbackLabel: string;
  badge?: string;
}) {
  const imageUrl = String(variant?.imageUrl || "").trim();

  return (
    <div className="flex items-center justify-center">
      <div className="relative">
        {badge ? (
          <span className="absolute -left-1.5 -top-1.5 z-10 inline-flex h-5 items-center rounded-full border border-emerald-400/40 bg-emerald-500 px-1.5 text-[9px] text-white" style={{ fontWeight: 800 }}>
            {badge}
          </span>
        ) : null}
        {imageUrl ? (
          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block overflow-hidden rounded-[14px] border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
          >
            <img src={imageUrl} alt={fallbackLabel} loading="lazy" decoding="async" className="block w-[60px] aspect-[3/4] object-cover" />
          </a>
        ) : (
          <div className="flex w-[60px] aspect-[3/4] items-center justify-center rounded-[14px] border border-dashed border-slate-300 bg-slate-50 px-2 text-center text-[9px] text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500" style={{ fontWeight: 700 }}>
            Нет
          </div>
        )}
      </div>
    </div>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-slate-200 bg-white px-2 text-[10px] text-slate-500 dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-300" style={{ fontWeight: 700 }}>
      {label}: <span className="ml-1 text-slate-900 dark:text-slate-100">{value || "—"}</span>
    </span>
  );
}

function LinkChip({ href, label }: { href: string; label: string }) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-7 items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 text-[10px] text-slate-700 transition-colors hover:border-teal-300 hover:bg-teal-50 dark:border-slate-700/80 dark:bg-slate-900/80 dark:text-slate-200 dark:hover:border-teal-500/60 dark:hover:bg-teal-950/30"
      style={{ fontWeight: 700 }}
    >
      <ExternalLink className="h-3 w-3" />
      {label}
    </a>
  );
}

function DeltaBadge({ kind, text }: { kind?: string; text?: string }) {
  const value = String(text || "").trim();
  if (!value) {
    return <span className="text-[11px] text-slate-500">—</span>;
  }

  const palette =
    kind === "good"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/12 dark:text-emerald-300"
      : kind === "bad"
        ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/12 dark:text-rose-300"
        : "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300";

  return (
    <span className={`inline-flex h-5 items-center rounded-full border px-2 text-[9px] ${palette}`} style={{ fontWeight: 800 }}>
      {value}
    </span>
  );
}

function DateBadge({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full border px-2 text-[9px] ${
        accent
          ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-300"
          : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-950/80 dark:text-slate-300"
      }`}
      style={{ fontWeight: 800 }}
    >
      {label}: {value}
    </span>
  );
}

function CompactMetricTable({
  rows,
  showDuring = false,
  showHeader = true,
  dense = false,
}: {
  rows: MetricRow[];
  showDuring?: boolean;
  showHeader?: boolean;
  dense?: boolean;
}) {
  const headerCellPaddingClass = dense ? "px-1.5 py-0.5" : "px-2 py-1";
  const labelCellPaddingClass = dense ? "px-2 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]";
  const valueCellPaddingClass = dense ? "px-1.5 py-0.5" : "px-1.5 py-1";

  return (
    <section className="overflow-hidden rounded-[16px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="overflow-hidden">
        <table className="w-full border-collapse">
          <colgroup>
            <col style={{ width: "1%" }} />
            {showDuring ? (
              <>
                <col style={{ width: "25%" }} />
                <col style={{ width: "25%" }} />
                <col style={{ width: "25%" }} />
                <col style={{ width: "25%" }} />
              </>
            ) : (
              <>
                <col style={{ width: "33%" }} />
                <col style={{ width: "33%" }} />
                <col style={{ width: "33%" }} />
              </>
            )}
          </colgroup>
          {showHeader ? (
            <thead>
              <tr>
                <th className={`whitespace-nowrap border-b border-r border-slate-200 bg-slate-100/80 text-left text-[9px] uppercase tracking-[0.12em] text-slate-500 dark:border-slate-800 dark:bg-slate-800/75 dark:text-slate-300 ${headerCellPaddingClass}`} style={{ fontWeight: 800 }}>
                  Метрика
                </th>
                <th className={`border-b border-r border-slate-200 bg-slate-50 text-center text-[10px] text-slate-800 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-100 ${headerCellPaddingClass}`} style={{ fontWeight: 800 }}>
                  До
                </th>
                {showDuring ? (
                  <th className={`border-b border-r border-slate-200 bg-slate-50 text-center text-[10px] text-slate-800 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-100 ${headerCellPaddingClass}`} style={{ fontWeight: 800 }}>
                    Во время
                  </th>
                ) : null}
                <th className={`border-b border-r border-slate-200 bg-slate-50 text-center text-[10px] text-slate-800 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-100 ${headerCellPaddingClass}`} style={{ fontWeight: 800 }}>
                  После
                </th>
                <th className={`border-b border-slate-200 bg-slate-50 text-center text-[10px] text-slate-800 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-100 ${headerCellPaddingClass}`} style={{ fontWeight: 800 }}>
                  Прирост
                </th>
              </tr>
            </thead>
          ) : null}
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={row.highlight ? "bg-emerald-50/60 dark:bg-emerald-500/8" : ""}>
                <td
                  className={`whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-800 ${labelCellPaddingClass} ${
                    row.highlight
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/18 dark:text-emerald-200"
                      : "bg-slate-50 text-slate-700 dark:bg-slate-800/55 dark:text-slate-200"
                  }`}
                  style={{ fontWeight: 800 }}
                >
                  {row.label}
                </td>
                <td
                  className={`border-b border-r border-slate-200 text-center dark:border-slate-800 ${valueCellPaddingClass} ${
                    row.highlight ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/6 dark:text-emerald-100" : "text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {row.before}
                </td>
                {showDuring ? (
                  <td
                    className={`border-b border-r border-slate-200 text-center dark:border-slate-800 ${valueCellPaddingClass} ${
                      row.highlight ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/6 dark:text-emerald-100" : "text-slate-800 dark:text-slate-100"
                    }`}
                  >
                    {row.during || <span className="text-[10px] text-slate-400 dark:text-slate-500">—</span>}
                  </td>
                ) : null}
                <td
                  className={`border-b border-r border-slate-200 text-center dark:border-slate-800 ${valueCellPaddingClass} ${
                    row.highlight ? "bg-emerald-50 text-emerald-900 dark:bg-emerald-500/6 dark:text-emerald-100" : "text-slate-800 dark:text-slate-100"
                  }`}
                >
                  {row.after}
                </td>
                <td
                  className={`border-b border-slate-200 text-center dark:border-slate-800 ${valueCellPaddingClass} ${
                    row.highlight ? "bg-emerald-50 dark:bg-emerald-500/6" : ""
                  }`}
                >
                  {row.growthNode || <DeltaBadge kind={row.growthKind} text={row.growthText} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function buildValueNode(value: string) {
  return (
    <span className="font-mono text-[10px] text-slate-800 dark:text-slate-100" style={{ fontWeight: 800 }}>
      {value || "—"}
    </span>
  );
}

function buildComparisonMetricRow(test: TestCard, label: string, options: { highlight?: boolean } = {}): MetricRow {
  const row = getComparisonRow(test, label);
  const growth = row ? getRkGrowth(row) : { text: "—", kind: "unknown" };

  return {
    key: label,
    label,
    before: buildValueNode(row?.before || "—"),
    after: buildValueNode(row?.after || "—"),
    growthText: growth.text,
    growthKind: growth.kind,
    highlight: Boolean(options.highlight),
  };
}

function BestTestCard({ test, rank, mode }: { test: TestCard; rank: number; mode: BestViewMode }) {
  const isCompact = mode === "compact";
  const baselineVariant = getBaselineVariant(test);
  const bestVariant = getBestVariant(test) || baselineVariant;
  const rkCtrCr1GrowthText = getCtrCr1GrowthText(test);
  const abTestActivityPeriod = formatAbTestActivityPeriod(test);
  const beforeRkDate = formatBlockDate(shiftIsoDateTime(test.startedAtIso, -1), test.startedAt);
  const afterRkDate = formatBlockDate(shiftIsoDateTime(test.endedAtIso, 1), test.endedAt);
  const title = test.title || test.productName || `Тест ${test.testId}`;
  const abTestUrl = abBuildXwayAbTestUrl(test.xwayUrl);
  const rkUrl = abBuildXwayRkUrl(test.xwayUrl);

  const abRows: MetricRow[] = [
    {
      key: "cover",
      label: "Обложка",
      before: <CoverPreview variant={baselineVariant} fallbackLabel={`Тест ${test.testId} до`} />,
      after: <CoverPreview variant={bestVariant} fallbackLabel={`Тест ${test.testId} после`} />,
      growthNode: <span className="text-[10px] text-slate-500">—</span>,
    },
    {
      key: "views",
      label: "Показы",
      before: buildValueNode(baselineVariant?.views || "—"),
      after: buildValueNode(bestVariant?.views || "—"),
      growthText: formatSignedPercentDelta(baselineVariant?.viewsValue ?? null, bestVariant?.viewsValue ?? null),
      growthKind: resolveDeltaKind(baselineVariant?.viewsValue ?? null, bestVariant?.viewsValue ?? null),
    },
    {
      key: "clicks",
      label: "Клики",
      before: buildValueNode(baselineVariant?.clicks || "—"),
      after: buildValueNode(bestVariant?.clicks || "—"),
      growthText: formatSignedPercentDelta(baselineVariant?.clicksValue ?? null, bestVariant?.clicksValue ?? null),
      growthKind: resolveDeltaKind(baselineVariant?.clicksValue ?? null, bestVariant?.clicksValue ?? null),
    },
    {
      key: "ctr",
      label: "CTR",
      before: buildValueNode(baselineVariant?.ctr || "—"),
      after: buildValueNode(bestVariant?.ctr || "—"),
      growthText: formatSignedPercentDelta(baselineVariant?.ctrValue ?? null, bestVariant?.ctrValue ?? null),
      growthKind: resolveDeltaKind(baselineVariant?.ctrValue ?? null, bestVariant?.ctrValue ?? null),
      highlight: true,
    },
  ];

  const rkRows: MetricRow[] = getVisibleComparisonRows(test).map((row) => {
    const growth = getRkGrowth(row);
    return {
      key: row.label,
      label: row.label,
      before: buildValueNode(row.before || "—"),
      during: buildValueNode(row.during || "—"),
      after: buildValueNode(row.after || "—"),
      growthText: growth.text,
      growthKind: growth.kind,
      highlight: String(row.label || "").trim() === "CTR*CR1",
    };
  });

  const compactAbRows: MetricRow[] = [abRows[0], abRows[3]].filter(Boolean);
  const compactRkMainRows: MetricRow[] = [
    buildComparisonMetricRow(test, "CTR"),
    buildComparisonMetricRow(test, "CR1"),
    buildComparisonMetricRow(test, "CTR*CR1", { highlight: true }),
  ];
  const compactRkSupportRows: MetricRow[] = [
    buildComparisonMetricRow(test, "Цена"),
    buildComparisonMetricRow(test, "Ставка"),
    buildComparisonMetricRow(test, "Показы"),
  ];

  return (
    <article className="overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_18px_48px_-28px_rgba(15,23,42,0.7)]">
      <header className={`border-b border-slate-200 bg-slate-50/85 dark:border-slate-800 dark:bg-slate-900/85 ${isCompact ? "px-2.5 py-2" : "px-2.5 py-2.5"}`}>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-xl bg-slate-100 px-2 text-[11px] text-slate-900" style={{ fontWeight: 900 }}>
                #{rank}
              </span>
              <div className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[10px] text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300" style={{ fontWeight: 800 }}>
                <Trophy className="h-3 w-3" />
                Прирост CTR*CR1: {rkCtrCr1GrowthText}
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1">
              <LinkChip href={abTestUrl} label="AB-тест" />
              <LinkChip href={rkUrl} label="РК" />
              <LinkChip href={test.wbUrl} label="WB" />
            </div>
          </div>

          <h3
            className="w-full overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-slate-900 dark:text-white"
            style={{ fontWeight: 900, lineHeight: 1.15 }}
            title={title}
          >
            {title}
          </h3>

          <p className={`text-slate-500 dark:text-slate-400 ${isCompact ? "text-[11px]" : "text-[10px]"}`} style={{ fontWeight: 600 }}>
            Тест {test.testId} · {abTestActivityPeriod}
          </p>

          <div className="flex flex-wrap gap-1.5">
            <MetaPill label="Артикул" value={test.article || "—"} />
            {!isCompact && shouldShowCampaignType(test.type) ? <MetaPill label="Тип" value={test.type || "—"} /> : null}
            <MetaPill label="Кабинет" value={test.cabinet || "—"} />
            {!isCompact ? <DateBadge label="До" value={beforeRkDate} /> : null}
            {!isCompact ? <DateBadge label="После" value={afterRkDate} accent /> : null}
          </div>
        </div>
      </header>

      <div className={`grid ${isCompact ? "gap-1 p-1.5" : "gap-1.5 p-2"}`}>
        {isCompact ? (
          <>
            <CompactMetricTable rows={compactAbRows} />
            <CompactMetricTable rows={compactRkMainRows} showHeader={false} />
            <CompactMetricTable rows={compactRkSupportRows} showHeader={false} />
          </>
        ) : (
          <>
            <section className="space-y-1">
              <div className="px-1 text-[11px] uppercase tracking-[0.08em] text-slate-700 dark:text-slate-100" style={{ fontWeight: 900 }}>
                AB-тест
              </div>
              <CompactMetricTable rows={abRows} />
            </section>

            <section className="space-y-1">
              <div className="px-1 text-[11px] uppercase tracking-[0.08em] text-slate-700 dark:text-slate-100" style={{ fontWeight: 900 }}>
                РК
              </div>
              <CompactMetricTable rows={rkRows} />
            </section>
          </>
        )}
      </div>
    </article>
  );
}

export function getBestCompletedTests<T extends TestCard>(testsRaw: T[]) {
  const tests = Array.isArray(testsRaw) ? testsRaw : [];

  return [...tests]
    .filter((test) => isCompletedTest(test) && isSuccessfulCleanTest(test) && Number.isFinite(getCtrCr1GrowthScore(test)))
    .sort((a, b) => {
      const scoreDiff = Number(getCtrCr1GrowthScore(b)) - Number(getCtrCr1GrowthScore(a));
      if (scoreDiff !== 0) return scoreDiff;
      return sortTimestampDesc(a, b);
    });
}

export function BestTestsSection({
  tests,
  emptyMessage = "Нет завершённых успешных чистых тестов с рассчитанным приростом CTR*CR1 под выбранные фильтры.",
}: Props) {
  const [viewMode, setViewMode] = useState<BestViewMode>("full");

  if (!tests.length) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white px-6 py-8 text-center text-[14px] text-slate-500 shadow-sm dark:border-slate-700/80 dark:bg-slate-900 dark:text-slate-400" style={{ fontWeight: 600 }}>
        {emptyMessage}
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <div className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm dark:border-slate-700/80 dark:bg-slate-900">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-[20px] text-slate-900 dark:text-slate-50" style={{ fontWeight: 900, lineHeight: 1.1 }}>
              Лучшие
            </h2>
            <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400" style={{ fontWeight: 600 }}>
              Только успешные по воронке чистых тестов, сортировка по `приросту CTR*CR1` по убыванию.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-2xl border border-slate-200/80 bg-slate-50 p-0.5 dark:border-slate-700/80 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setViewMode("full")}
                className={`inline-flex h-8 items-center rounded-[14px] px-3 text-[12px] transition-colors ${
                  viewMode === "full"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
                }`}
                style={{ fontWeight: 800 }}
              >
                Полный
              </button>
              <button
                type="button"
                onClick={() => setViewMode("compact")}
                className={`inline-flex h-8 items-center rounded-[14px] px-3 text-[12px] transition-colors ${
                  viewMode === "compact"
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
                }`}
                style={{ fontWeight: 800 }}
              >
                Сжатый
              </button>
            </div>

            <div className="inline-flex h-9 items-center rounded-2xl border border-slate-200/80 bg-slate-50 px-3 text-[12px] text-slate-700 dark:border-slate-700/80 dark:bg-slate-800 dark:text-slate-200" style={{ fontWeight: 800 }}>
              Найдено: {tests.length}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 xl:grid-cols-3">
        {tests.map((test, index) => (
          <BestTestCard key={test.testId || `${test.article}-${index}`} test={test} rank={index + 1} mode={viewMode} />
        ))}
      </div>
    </section>
  );
}

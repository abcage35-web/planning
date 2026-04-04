import type { ReactNode } from "react";
import { ExternalLink, Trophy } from "lucide-react";

import { abFormatCompactPeriodDateTime, abNormalizeStatus, type ComparisonRow, type TestCard, type Variant } from "./ab-service";

interface Props {
  tests: TestCard[];
  emptyMessage?: string;
}

interface MetricRow {
  key: string;
  label: string;
  before: ReactNode;
  after: ReactNode;
  growthText?: string;
  growthKind?: string;
  growthNode?: ReactNode;
  highlight?: boolean;
}

const BEST_RK_METRICS = ["Цена", "Откл. цены", "CTR", "CR1", "CTR*CR1"];

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

function getAfterCtrCr1Score(test: TestCard) {
  const row = getComparisonRow(test, "CTR*CR1");
  return parseDisplayNumber(row?.after ?? null);
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
            className="block overflow-hidden rounded-[14px] border border-slate-700 bg-slate-900"
          >
            <img src={imageUrl} alt={fallbackLabel} loading="lazy" decoding="async" className="block w-[60px] aspect-[3/4] object-cover" />
          </a>
        ) : (
          <div className="flex w-[60px] aspect-[3/4] items-center justify-center rounded-[14px] border border-dashed border-slate-700 bg-slate-900 px-2 text-center text-[9px] text-slate-500" style={{ fontWeight: 700 }}>
            Нет
          </div>
        )}
      </div>
    </div>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full border border-slate-700/80 bg-slate-900/80 px-2 text-[10px] text-slate-300" style={{ fontWeight: 700 }}>
      {label}: <span className="ml-1 text-slate-100">{value || "—"}</span>
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
      className="inline-flex h-7 items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-900/80 px-2 text-[10px] text-slate-200 transition-colors hover:border-teal-500/60 hover:bg-teal-950/30"
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
      ? "border-emerald-500/40 bg-emerald-500/12 text-emerald-300"
      : kind === "bad"
        ? "border-rose-500/40 bg-rose-500/12 text-rose-300"
        : "border-slate-600 bg-slate-800 text-slate-300";

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
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-slate-700 bg-slate-950/80 text-slate-300"
      }`}
      style={{ fontWeight: 800 }}
    >
      {label}: {value}
    </span>
  );
}

function CompactMetricTable({
  title,
  rows,
}: {
  title: string;
  rows: MetricRow[];
}) {
  return (
    <section className="overflow-hidden rounded-[16px] border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-2.5 py-0.5">
        <div className="text-[11px] uppercase tracking-[0.08em] text-white" style={{ fontWeight: 900 }}>
          {title}
        </div>
      </div>

      <div className="overflow-hidden">
        <table className="w-full border-collapse">
          <colgroup>
            <col style={{ width: "1%" }} />
            <col style={{ width: "33%" }} />
            <col style={{ width: "33%" }} />
            <col style={{ width: "33%" }} />
          </colgroup>
          <thead>
            <tr>
              <th className="whitespace-nowrap border-b border-r border-slate-800 bg-slate-800/75 px-2 py-1 text-left text-[9px] uppercase tracking-[0.12em] text-slate-300" style={{ fontWeight: 800 }}>
                Метрика
              </th>
              <th className="border-b border-r border-slate-800 bg-slate-950/70 px-2 py-1 text-center text-[10px] text-slate-100" style={{ fontWeight: 800 }}>
                До
              </th>
              <th className="border-b border-r border-slate-800 bg-slate-950/70 px-2 py-1 text-center text-[10px] text-slate-100" style={{ fontWeight: 800 }}>
                После
              </th>
              <th className="border-b border-slate-800 bg-slate-950/70 px-2 py-1 text-center text-[10px] text-slate-100" style={{ fontWeight: 800 }}>
                Прирост
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={row.highlight ? "bg-slate-950/60" : ""}>
                <td className={`whitespace-nowrap border-b border-r border-slate-800 px-2 py-1 text-[10px] ${row.highlight ? "bg-slate-800/85 text-white" : "bg-slate-800/55 text-slate-200"}`} style={{ fontWeight: 800 }}>
                  {row.label}
                </td>
                <td className="border-b border-r border-slate-800 px-1.5 py-1 text-center text-slate-100">
                  {row.before}
                </td>
                <td className="border-b border-r border-slate-800 px-1.5 py-1 text-center text-slate-100">
                  {row.after}
                </td>
                <td className="border-b border-slate-800 px-1.5 py-1 text-center">
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
    <span className="font-mono text-[10px] text-slate-100" style={{ fontWeight: 800 }}>
      {value || "—"}
    </span>
  );
}

function BestTestCard({ test, rank }: { test: TestCard; rank: number }) {
  const baselineVariant = getBaselineVariant(test);
  const bestVariant = getBestVariant(test) || baselineVariant;
  const rkCtrCr1Row = getComparisonRow(test, "CTR*CR1");
  const beforeRkDate = formatBlockDate(shiftIsoDateTime(test.startedAtIso, -1), test.startedAt);
  const afterRkDate = formatBlockDate(shiftIsoDateTime(test.endedAtIso, 1), test.endedAt);

  const abRows: MetricRow[] = [
    {
      key: "cover",
      label: "Обложка",
      before: <CoverPreview variant={baselineVariant} fallbackLabel={`Тест ${test.testId} до`} />,
      after: <CoverPreview variant={bestVariant} fallbackLabel={`Тест ${test.testId} после`} badge="Лучшая" />,
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
      after: buildValueNode(row.after || "—"),
      growthText: growth.text,
      growthKind: growth.kind,
      highlight: String(row.label || "").trim() === "CTR*CR1",
    };
  });

  return (
    <article className="overflow-hidden rounded-[22px] border border-slate-800 bg-slate-950 shadow-[0_18px_48px_-28px_rgba(15,23,42,0.7)]">
      <header className="border-b border-slate-800 bg-slate-900/85 px-2.5 py-2.5">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-xl bg-slate-100 px-2 text-[11px] text-slate-900" style={{ fontWeight: 900 }}>
                  #{rank}
                </span>
                <div className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-300" style={{ fontWeight: 800 }}>
                  <Trophy className="h-3 w-3" />
                  CTR*CR1: {rkCtrCr1Row?.after || "—"}
                </div>
              </div>

              <h3 className="mt-1.5 line-clamp-2 text-[13px] text-white" style={{ fontWeight: 900, lineHeight: 1.15 }}>
                {test.title || test.productName || `Тест ${test.testId}`}
              </h3>
              <p className="mt-0.5 text-[10px] text-slate-400" style={{ fontWeight: 600 }}>
                Тест {test.testId} · {beforeRkDate} — {afterRkDate}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-1">
              <LinkChip href={test.xwayUrl} label="XWAY" />
              <LinkChip href={test.wbUrl} label="WB" />
            </div>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <MetaPill label="Артикул" value={test.article || "—"} />
            {shouldShowCampaignType(test.type) ? <MetaPill label="Тип" value={test.type || "—"} /> : null}
            <MetaPill label="Кабинет" value={test.cabinet || "—"} />
            <DateBadge label="До" value={beforeRkDate} />
            <DateBadge label="После" value={afterRkDate} accent />
          </div>
        </div>
      </header>

      <div className="grid gap-1.5 p-2">
        <CompactMetricTable title="AB-тест" rows={abRows} />
        <CompactMetricTable title="РК" rows={rkRows} />
      </div>
    </article>
  );
}

export function getBestCompletedTests<T extends TestCard>(testsRaw: T[]) {
  const tests = Array.isArray(testsRaw) ? testsRaw : [];

  return [...tests]
    .filter((test) => isCompletedTest(test) && isSuccessfulCleanTest(test) && Number.isFinite(getAfterCtrCr1Score(test)))
    .sort((a, b) => {
      const scoreDiff = Number(getAfterCtrCr1Score(b)) - Number(getAfterCtrCr1Score(a));
      if (scoreDiff !== 0) return scoreDiff;
      return sortTimestampDesc(a, b);
    });
}

export function BestTestsSection({
  tests,
  emptyMessage = "Нет завершённых успешных чистых тестов с рассчитанным CTR*CR1 после под выбранные фильтры.",
}: Props) {
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
              Только успешные по воронке чистых тестов, сортировка по `CTR*CR1 после` по убыванию.
            </p>
          </div>
          <div className="inline-flex h-9 items-center rounded-2xl border border-slate-200/80 bg-slate-50 px-3 text-[12px] text-slate-700 dark:border-slate-700/80 dark:bg-slate-800 dark:text-slate-200" style={{ fontWeight: 800 }}>
            Найдено: {tests.length}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2 2xl:grid-cols-3">
        {tests.map((test, index) => (
          <BestTestCard key={test.testId || `${test.article}-${index}`} test={test} rank={index + 1} />
        ))}
      </div>
    </section>
  );
}

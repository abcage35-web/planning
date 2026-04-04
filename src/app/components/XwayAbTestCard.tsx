import { ExternalLink, ImageIcon } from "lucide-react";

import { abFormatInt } from "./ab-service";
import { StatusPill } from "./StatusPill";
import { type XwayAbTest, xwayAbLaunchStatusLabel } from "./xway-ab-service";

interface Props {
  test: XwayAbTest;
}

function shouldShowCampaignType(typeRaw: string | null | undefined) {
  const value = String(typeRaw || "").trim();
  if (!value) return false;
  return !/^MAIN[\s_-]?IMAGE$/i.test(value);
}

function formatMoney(valueRaw: number) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(value);
}

function launchStatusStyles(rawValue: string) {
  switch (String(rawValue || "").trim().toUpperCase()) {
    case "DONE":
      return "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300";
    case "LAUNCHED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300";
    case "PENDING":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
    case "REJECTED":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300";
    default:
      return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300";
  }
}

export function XwayAbTestCard({ test }: Props) {
  const gallery = test.imageUrls.length ? test.imageUrls : (test.mainImageUrl ? [test.mainImageUrl] : []);

  return (
    <article className="border border-slate-200/80 dark:border-slate-700/80 rounded-2xl bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <header className="px-4 pt-3 pb-2 border-b border-slate-100/80 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <h4 className="text-[15px] text-slate-900 dark:text-slate-100" style={{ fontWeight: 800 }}>
                Тест {test.testId}
              </h4>
              <Chip label="Артикул" value={test.article || "—"} mono />
              {shouldShowCampaignType(test.type) ? <Chip label="Тип" value={test.type || "—"} /> : null}
              <Chip label="Кабинет" value={test.cabinet || "—"} />
            </div>

            <p className="text-[13px] text-slate-800 dark:text-slate-200 truncate" style={{ fontWeight: 700 }} title={test.productName || test.title}>
              {test.productName || test.title || "—"}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate" style={{ fontWeight: 500 }} title={test.title}>
              {test.title || "Без названия"}
            </p>
          </div>

          <a
            href={test.xwayUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 h-9 px-3 rounded-xl border border-teal-300 bg-gradient-to-b from-teal-600 to-teal-700 text-white text-[13px] inline-flex items-center gap-2 shadow-sm hover:shadow-md hover:from-teal-500 hover:to-teal-600 transition-all"
            style={{ fontWeight: 700 }}
          >
            <span>XWAY</span>
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-3">
          <StatusPill rawValue={test.statusRaw} />
          <span
            className={`inline-flex items-center justify-center min-w-[72px] h-[24px] rounded-full border px-2 text-[11px] whitespace-nowrap ${launchStatusStyles(test.launchStatus)}`}
            style={{ fontWeight: 700 }}
          >
            {xwayAbLaunchStatusLabel(test.launchStatus)}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400" style={{ fontWeight: 600 }}>
            Старт: {test.startedAtLabel}
          </span>
          <span className="text-[11px] text-slate-400 dark:text-slate-500">•</span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400" style={{ fontWeight: 600 }}>
            Финиш: {test.finishedAtLabel}
          </span>
        </div>
      </header>

      <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-2">
        <MetricCard label="Показы" value={abFormatInt(test.views)} />
        <MetricCard label="Расход" value={formatMoney(test.estimatedExpense)} />
        <MetricCard label="CPM" value={formatMoney(test.cpm)} />
        <MetricCard label="Прогресс" value={`${Math.max(0, Math.min(100, Math.round(test.progress || 0)))}%`} />
      </div>

      <div className="px-4 pb-4">
        <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-800/40 p-3">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="text-[12px] text-slate-600 dark:text-slate-300" style={{ fontWeight: 700 }}>
              Варианты обложек
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500" style={{ fontWeight: 600 }}>
              {abFormatInt(test.imagesNum || gallery.length)} шт.
            </div>
          </div>

          {gallery.length ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {gallery.slice(0, 4).map((imageUrl, index) => (
                <div key={`${test.testId}-${index}`} className="aspect-[3/4] rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900">
                  <img src={imageUrl} alt={`Вариант ${index + 1}`} className="w-full h-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          ) : (
            <div className="min-h-[132px] rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 flex items-center justify-center gap-2 text-[12px] text-slate-400 dark:text-slate-500">
              <ImageIcon className="w-4 h-4" />
              Нет изображений в ответе XWAY
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-800/50 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500" style={{ fontWeight: 700 }}>
        {label}
      </div>
      <div className="text-[15px] text-slate-900 dark:text-slate-100 mt-1" style={{ fontWeight: 800 }}>
        {value}
      </div>
    </div>
  );
}

function Chip({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] text-slate-500 dark:text-slate-300">
      <span style={{ fontWeight: 700 }}>{label}</span>
      <span style={{ fontWeight: 700, fontFamily: mono ? "JetBrains Mono, monospace" : "Inter, sans-serif" }}>{value}</span>
    </span>
  );
}

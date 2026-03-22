import { Fragment, useCallback, useMemo, useState, type MouseEvent, type ReactNode } from "react";

import { type Product, type TestCard, abFormatInt } from "./ab-service";

interface Props {
  products: Product[];
  renderTest: (test: TestCard) => ReactNode;
  emptyText?: string;
  stickyOffsetClassName?: string;
}

const GROUP_HEADER_COLUMNS = "92px 132px minmax(280px,1.8fr) 140px minmax(170px,1fr) 84px 110px 110px 170px";

export function ProductGroupsWithTests({
  products,
  renderTest,
  emptyText = "Нет тестов под выбранные фильтры.",
  stickyOffsetClassName = "top-[112px]",
}: Props) {
  const groupedProducts = useMemo(() => {
    return [...products]
      .map((product) => ({
        ...product,
        tests: [...product.tests].sort(sortTestsByDateDesc),
      }))
      .sort((a, b) => {
        const aDate = getProductTimestamp(a);
        const bDate = getProductTimestamp(b);
        if (aDate !== bDate) return bDate - aDate;
        if (a.testsCount !== b.testsCount) return b.testsCount - a.testsCount;
        return String(a.article || "").localeCompare(String(b.article || ""), "ru");
      });
  }, [products]);

  if (!groupedProducts.length) {
    return (
      <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-6 shadow-sm text-center">
        <p className="text-[14px] text-slate-400" style={{ fontWeight: 500 }}>
          {emptyText}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {groupedProducts.map((product) => (
        <section key={product.article} className="space-y-3">
          <div className={`sticky z-20 ${stickyOffsetClassName}`}>
            <div className="overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/95 shadow-sm backdrop-blur-sm">
              <div className="overflow-x-auto">
                <div className="min-w-[1160px]">
                  <div
                    className="grid border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2"
                    style={{ gridTemplateColumns: GROUP_HEADER_COLUMNS }}
                  >
                    {["Обложка WB", "Артикул", "Название", "Остаток", "Кабинеты", "Тестов", "Хорошо XWAY", "Плохо XWAY", "Последний старт"].map((label) => (
                      <div
                        key={label}
                        className="pr-3 text-left text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400"
                        style={{ fontWeight: 700 }}
                      >
                        {label}
                      </div>
                    ))}
                  </div>

                  <div
                    className="grid items-center gap-3 px-4 py-3"
                    style={{ gridTemplateColumns: GROUP_HEADER_COLUMNS }}
                  >
                    <div className="pr-3">
                      <CurrentCoverThumb product={product} />
                    </div>

                    <div
                      className="pr-3 text-[13px] text-slate-700 dark:text-slate-300 whitespace-nowrap"
                      style={{ fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}
                    >
                      {product.article || "—"}
                    </div>

                    <div className="min-w-0 pr-3">
                      <div
                        className="truncate text-[13px] text-slate-800 dark:text-slate-100"
                        style={{ fontWeight: 700 }}
                        title={product.title}
                      >
                        {product.title || "—"}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {product.wbUrl ? (
                          <a
                            href={product.wbUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center h-[22px] px-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-[11px] text-teal-700 dark:text-teal-400 no-underline hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:border-teal-200 dark:hover:border-teal-700 transition-all"
                            style={{ fontWeight: 700 }}
                          >
                            WB
                          </a>
                        ) : null}
                        <span className="inline-flex items-center h-[22px] px-2 rounded-full border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-[11px] text-slate-500 dark:text-slate-400" style={{ fontWeight: 700 }}>
                          {product.type || "—"}
                        </span>
                      </div>
                    </div>

                    <div className="pr-3">
                      <StockBadge value={product.currentStockValue} inStock={product.currentInStock} />
                    </div>

                    <div className="pr-3 text-[12px] text-slate-600 dark:text-slate-400" style={{ fontWeight: 600 }}>
                      {product.cabinets.join(", ") || "—"}
                    </div>

                    <div className="pr-3 text-[13px] text-slate-800 dark:text-slate-200" style={{ fontWeight: 800 }}>
                      {abFormatInt(product.testsCount)}
                    </div>

                    <div className="pr-3">
                      <InlineStatus value={product.good} type="good" />
                    </div>

                    <div className="pr-3">
                      <InlineStatus value={product.bad} type="bad" />
                    </div>

                    <div className="pr-3 text-[12px] text-slate-500 dark:text-slate-400 whitespace-nowrap" style={{ fontWeight: 600 }}>
                      <LastStartCell product={product} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 dark:border-slate-700 px-4 py-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {product.tests.map((test) => (
                    <a
                      key={`${product.article}-${test.testId}`}
                      href={test.xwayUrl || test.wbUrl || "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center h-[22px] px-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 text-teal-700 dark:text-teal-400 text-[11px] no-underline hover:bg-teal-50 dark:hover:bg-teal-900/30 hover:border-teal-200 dark:hover:border-teal-700 transition-all"
                      style={{ fontWeight: 700 }}
                      title={test.title}
                    >
                      #{test.testId}
                    </a>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {product.tests.map((test) => (
              <Fragment key={`${product.article}-test-${test.testId}`}>{renderTest(test)}</Fragment>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function sortTestsByDateDesc(a: TestCard, b: TestCard) {
  return getTestTimestamp(b) - getTestTimestamp(a);
}

function getProductTimestamp(product: Product) {
  const direct = parseProductDate(product.latestAtIso, product.latestAt);
  if (direct) return direct.getTime();
  return product.tests.reduce((maxValue, test) => Math.max(maxValue, getTestTimestamp(test)), 0);
}

function getTestTimestamp(test: TestCard) {
  const startedAt = String(test.startedAtIso || "").trim();
  if (startedAt) {
    const startedDate = new Date(startedAt);
    if (!Number.isNaN(startedDate.getTime())) {
      return startedDate.getTime();
    }
  }

  const endedAt = String(test.endedAtIso || "").trim();
  if (endedAt) {
    const endedDate = new Date(endedAt);
    if (!Number.isNaN(endedDate.getTime())) {
      return endedDate.getTime();
    }
  }

  return 0;
}

function CurrentCoverThumb({ product }: { product: Product }) {
  const [preview, setPreview] = useState<{ visible: boolean; x: number; y: number }>({ visible: false, x: 0, y: 0 });
  const imageUrl = String(product.currentImageUrl || "").trim();

  const handleMouseMove = useCallback((event: MouseEvent) => {
    const previewWidth = 220;
    const previewHeight = 293;

    let x = event.clientX;
    let y = event.clientY - previewHeight / 2 - 10;

    if (x + previewWidth / 2 > window.innerWidth) x = window.innerWidth - previewWidth / 2 - 8;
    if (x - previewWidth / 2 < 0) x = previewWidth / 2 + 8;
    if (y < 8) y = 8;
    if (y + previewHeight > window.innerHeight - 8) y = window.innerHeight - previewHeight - 8;

    setPreview({ visible: true, x, y });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setPreview({ visible: false, x: 0, y: 0 });
  }, []);

  if (!imageUrl) {
    return (
      <div className="w-[52px] h-[72px] rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-700/80 bg-slate-100/80 dark:bg-slate-800/70 flex items-center justify-center text-[10px] text-slate-400 dark:text-slate-500 text-center px-1" style={{ fontWeight: 600 }}>
        нет
      </div>
    );
  }

  const thumb = (
    <div className="w-[52px] h-[72px] rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-700/80 bg-slate-100/80 dark:bg-slate-800/70 shadow-sm">
      <img src={imageUrl} alt={product.title || product.article || "Обложка"} className="w-full h-full object-cover" loading="lazy" />
    </div>
  );

  const trigger = product.wbUrl ? (
    <a
      href={product.wbUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex no-underline"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {thumb}
    </a>
  ) : (
    <div className="inline-flex" onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      {thumb}
    </div>
  );

  return (
    <div className="relative">
      {trigger}
      {preview.visible ? (
        <div
          className="fixed pointer-events-none z-[10000] transition-opacity duration-150"
          style={{ left: preview.x, top: preview.y, width: 220, transform: "translateX(-50%)", opacity: 1 }}
        >
          <img
            src={imageUrl}
            alt={`${product.title || product.article || "Обложка"} (увеличенная)`}
            className="w-full aspect-[3/4] object-cover block rounded-2xl border border-slate-200/80 bg-white dark:border-slate-700/80"
            style={{ boxShadow: "0 22px 44px rgba(16,31,41,0.24), 0 4px 12px rgba(16,31,41,0.16)" }}
          />
        </div>
      ) : null}
    </div>
  );
}

function LastStartCell({ product }: { product: Product }) {
  const date = parseProductDate(product.latestAtIso, product.latestAt);
  const daysAgoText = date ? formatDaysAgo(date) : "";

  return (
    <div className="flex flex-col">
      <span>{product.latestAt || "—"}</span>
      {daysAgoText ? (
        <span className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5" style={{ fontWeight: 600 }}>
          {daysAgoText}
        </span>
      ) : null}
    </div>
  );
}

function parseProductDate(isoRaw: string | undefined, displayRaw: string | undefined) {
  const iso = String(isoRaw || "").trim();
  if (iso) {
    const date = new Date(iso);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  const display = String(displayRaw || "").trim();
  const match = display.match(/^(\d{2})\.(\d{2})\.(\d{4}),\s*(\d{2}):(\d{2})$/);
  if (match) {
    const date = new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1]),
      Number(match[4]),
      Number(match[5]),
    );
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  if (display) {
    const fallback = new Date(display);
    if (!Number.isNaN(fallback.getTime())) {
      return fallback;
    }
  }

  return null;
}

function formatDaysAgo(date: Date) {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.max(0, Math.round((todayStart - targetStart) / 86_400_000));

  if (diffDays === 0) return "сегодня";
  if (diffDays === 1) return "1 день назад";

  const mod10 = diffDays % 10;
  const mod100 = diffDays % 100;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${abFormatInt(diffDays)} дня назад`;
  }
  return `${abFormatInt(diffDays)} дней назад`;
}

function StockBadge({ value, inStock }: { value: number | null | undefined; inStock: boolean | null | undefined }) {
  const stockValue = Number(value);
  if (Number.isFinite(stockValue)) {
    const styles = stockValue > 20
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
      : stockValue > 0
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
        : "border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/40 dark:text-red-400";

    return (
      <span className={`inline-flex items-center justify-center h-[28px] min-w-[92px] rounded-full border px-3 text-[12px] whitespace-nowrap ${styles}`} style={{ fontWeight: 700 }}>
        {abFormatInt(stockValue)} шт
      </span>
    );
  }

  if (inStock === false) {
    return (
      <span className="inline-flex items-center justify-center h-[28px] min-w-[92px] rounded-full border px-3 text-[12px] whitespace-nowrap border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/40 dark:text-red-400" style={{ fontWeight: 700 }}>
        Нет
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-center h-[28px] min-w-[92px] rounded-full border px-3 text-[12px] whitespace-nowrap border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400" style={{ fontWeight: 700 }}>
      —
    </span>
  );
}

function InlineStatus({ value, type }: { value: number; type: "good" | "bad" }) {
  const styles = type === "good"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
    : "border-red-200 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/40 dark:text-red-400";

  return (
    <span className={`inline-flex items-center justify-center min-w-[32px] h-[22px] rounded-full border px-2 text-[12px] ${styles}`} style={{ fontWeight: 700 }}>
      {abFormatInt(value)}
    </span>
  );
}

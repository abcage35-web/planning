import { type Product, abFormatInt } from "./ab-service";

interface Props {
  products: Product[];
}

export function ProductsTable({ products }: Props) {
  if (!products.length) return null;

  return (
    <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-sm border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-5 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h3 className="text-[16px] text-slate-800 dark:text-slate-100" style={{ fontWeight: 700 }}>
          Товары и все проведенные AB-тесты
        </h3>
        <span className="text-[13px] text-slate-400 dark:text-slate-500" style={{ fontWeight: 500 }}>
          Группировка по артикулу
        </span>
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200/80 dark:border-slate-700/80">
        <table className="w-full min-w-[1100px] border-collapse">
          <thead>
            <tr>
              {["Артикул", "Название", "Кабинеты", "Тестов", "Хорошо", "Плохо", "Последний старт", "Тесты"].map(h => (
                <th
                  key={h}
                  className="sticky top-0 z-[1] border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-left text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                  style={{ fontWeight: 700 }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {products.map(item => (
              <tr key={item.article} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/60 transition-colors">
                <td className="border-b border-slate-50 dark:border-slate-700/50 px-3 py-2 text-[12px] text-slate-700 dark:text-slate-300 whitespace-nowrap" style={{ fontWeight: 600, fontFamily: "JetBrains Mono, monospace" }}>
                  {item.article}
                </td>
                <td className="border-b border-slate-50 dark:border-slate-700/50 px-3 py-2 text-[12px] text-slate-700 dark:text-slate-300 max-w-[280px] truncate" style={{ fontWeight: 500 }} title={item.title}>
                  {item.title || "—"}
                </td>
                <td className="border-b border-slate-50 dark:border-slate-700/50 px-3 py-2 text-[12px] text-slate-600 dark:text-slate-400" style={{ fontWeight: 500 }}>
                  {item.cabinets.join(", ") || "—"}
                </td>
                <td className="border-b border-slate-50 dark:border-slate-700/50 px-3 py-2 text-[12px] text-slate-700 dark:text-slate-300" style={{ fontWeight: 700 }}>
                  {abFormatInt(item.testsCount)}
                </td>
                <td className="border-b border-slate-50 dark:border-slate-700/50 px-3 py-2">
                  <InlineStatus value={item.good} type="good" />
                </td>
                <td className="border-b border-slate-50 dark:border-slate-700/50 px-3 py-2">
                  <InlineStatus value={item.bad} type="bad" />
                </td>
                <td className="border-b border-slate-50 dark:border-slate-700/50 px-3 py-2 text-[12px] text-slate-500 dark:text-slate-400" style={{ fontWeight: 500 }}>
                  {item.latestAt || "—"}
                </td>
                <td className="border-b border-slate-50 dark:border-slate-700/50 px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {item.tests.slice(0, 12).map(test => (
                      <a
                        key={test.testId}
                        href={test.xwayUrl || "#"}
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
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

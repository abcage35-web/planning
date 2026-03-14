import { Search, RotateCcw, ChevronDown, ChevronUp, Filter, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import {
  type Filters, type DashboardModel, type TestCard,
  AB_TEST_LIMIT_OPTIONS, abFormatInt, abFormatMonthLabel,
  abGetMonthSelectionLabel, abGetAvailableMonthKeys,
} from "./ab-service";

interface Props {
  model: DashboardModel;
  filteredTests: TestCard[];
  filters: Filters;
  onChange: (f: Partial<Filters>) => void;
  onReset: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function FilterToolbar({ model, filteredTests, filters, onChange, onReset, collapsed, onToggleCollapse }: Props) {
  const cabinets = model.cabinets || [];
  const availableMonthKeys = abGetAvailableMonthKeys(model);
  const selectedMonthKeys = (filters.monthKeys || []).filter(v => /^\d{4}-\d{2}$/.test(v)).sort((a, b) => b.localeCompare(a));
  const selectedMonthsLabel = abGetMonthSelectionLabel(selectedMonthKeys);

  const totalTests = model.tests?.length || 0;
  const visibleTests = filteredTests.length;
  const testLimit = Math.max(1, Number(filters.limit) || AB_TEST_LIMIT_OPTIONS[0]);
  const shownTests = Math.min(visibleTests, testLimit);
  const filteredGood = filteredTests.filter(t => t?.finalStatusKind === "good").length;
  const filteredBad = filteredTests.filter(t => t?.finalStatusKind === "bad").length;

  const activeStageLabelMap: Record<string, string> = { ctr: "CTR", price: "Цена", ctrcr1: "CTR x CR1", overall: "Итог" };
  const activeStageSourceMap: Record<string, string> = { export: "Выгрузка", xway: "XWAY" };
  const activeStageLabel = filters.stage && filters.stage !== "all"
    ? `${activeStageSourceMap[filters.stageSource || "export"] || "Выгрузка"} · ${activeStageLabelMap[filters.stage] || filters.stage}`
    : "";

  const cabinetOptions = [{ value: "all", label: "Все кабинеты" }, ...cabinets.map(c => ({ value: c, label: c }))];
  const verdictOptions = [
    { value: "all", label: "Все исходы" },
    { value: "good", label: "Хорошо" },
    { value: "bad", label: "Плохо" },
    { value: "unknown", label: "Нет данных" },
  ];
  const limitOptions = AB_TEST_LIMIT_OPTIONS.map(v => ({ value: String(v), label: String(v) }));

  if (collapsed) {
    return (
      <div className="sticky top-2 z-40 flex justify-end">
        <button
          onClick={onToggleCollapse}
          className="h-9 px-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm text-slate-700 dark:text-slate-200 text-[14px] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 transition-all inline-flex items-center gap-2 shadow-sm"
          style={{ fontWeight: 600 }}
        >
          <Filter className="w-3.5 h-3.5" />
          Фильтры
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="sticky top-2 z-40 bg-white/95 backdrop-blur-sm border border-slate-200/80 rounded-2xl shadow-sm dark:bg-slate-900/95 dark:border-slate-700/80">
      <div className="px-4 py-3">
        {/* Single row of filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="flex items-center gap-2 h-9 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 bg-white dark:bg-slate-800 focus-within:border-sky-400 focus-within:ring-2 focus-within:ring-sky-100 dark:focus-within:ring-sky-900 transition-all min-w-[200px] flex-1 max-w-[280px]">
            <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <input
              type="search"
              value={filters.search}
              onChange={e => onChange({ search: e.target.value })}
              placeholder="Поиск: test id, артикул, название"
              className="w-full border-0 outline-0 bg-transparent text-slate-800 dark:text-slate-200 text-[13px] placeholder:text-slate-400"
              style={{ fontWeight: 500 }}
            />
          </div>
          {/* Cabinet */}
          <CustomSelect
            value={filters.cabinet}
            onChange={v => onChange({ cabinet: v })}
            options={cabinetOptions}
            minWidth={130}
          />
          {/* Verdict */}
          <CustomSelect
            value={filters.verdict}
            onChange={v => onChange({ verdict: v })}
            options={verdictOptions}
            minWidth={120}
          />
          {/* Date from */}
          <input
            type="date"
            value={filters.dateFrom}
            onChange={e => onChange({ dateFrom: e.target.value, monthKeys: [] })}
            className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[13px] px-2.5 cursor-pointer hover:border-slate-300 transition-colors"
            style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
          />
          {/* Date to */}
          <input
            type="date"
            value={filters.dateTo}
            onChange={e => onChange({ dateTo: e.target.value, monthKeys: [] })}
            className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[13px] px-2.5 cursor-pointer hover:border-slate-300 transition-colors"
            style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}
          />
          {/* Months */}
          <MonthsDropdown
            availableMonthKeys={availableMonthKeys}
            selectedMonthKeys={selectedMonthKeys}
            selectedMonthsLabel={selectedMonthsLabel}
            onToggle={(mk, checked) => {
              const next = new Set(selectedMonthKeys);
              checked ? next.add(mk) : next.delete(mk);
              onChange({ monthKeys: Array.from(next).sort() });
            }}
          />
          {/* Limit */}
          <CustomSelect
            value={filters.limit}
            onChange={v => onChange({ limit: v })}
            options={limitOptions}
            minWidth={64}
          />
          {/* Collapse button */}
          <button
            onClick={onToggleCollapse}
            className="w-9 h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 inline-flex items-center justify-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 transition-all ml-auto shrink-0"
            title="Скрыть фильтры"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>

        {/* Row 2: View switch + stats */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80">
              {(["tests", "products", "both"] as const).map(v => (
                <button
                  key={v}
                  onClick={() => onChange({ view: v })}
                  className={`h-7 px-2.5 rounded-md text-[12px] cursor-pointer transition-all ${
                    filters.view === v
                      ? "bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-900 dark:text-slate-100 shadow-sm"
                      : "border border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-700/60"
                  }`}
                  style={{ fontWeight: 700 }}
                >
                  {v === "tests" ? "По тестам" : v === "products" ? "По товарам" : "Оба вида"}
                </button>
              ))}
            </div>
            <button
              onClick={onReset}
              className="h-7 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[12px] cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 transition-all inline-flex items-center gap-1"
              style={{ fontWeight: 600 }}
            >
              <RotateCcw className="w-3 h-3" />
              Сбросить
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <StatChip label="Показано" value={`${abFormatInt(shownTests)} / ${abFormatInt(visibleTests)}`} />
            <StatChip label="Всего тестов" value={abFormatInt(totalTests)} />
            <StatChip label="Хорошо" value={abFormatInt(filteredGood)} color="emerald" />
            <StatChip label="Плохо" value={abFormatInt(filteredBad)} color="red" />
            {activeStageLabel && <StatChip label="Этап" value={activeStageLabel} color="sky" />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Custom Select dropdown ──
function CustomSelect({ value, onChange, options, minWidth }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  minWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selectedLabel = options.find(o => o.value === value)?.label || value;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[13px] px-2.5 pr-7 cursor-pointer hover:border-slate-300 transition-colors text-left flex items-center whitespace-nowrap"
        style={{ fontWeight: 600, minWidth: minWidth || 100 }}
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDown className={`absolute right-2 w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-full w-max max-h-[240px] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl z-[100] py-1">
          {options.map(opt => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-[13px] cursor-pointer transition-colors ${
                opt.value === value
                  ? "bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300"
                  : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
              }`}
              style={{ fontWeight: opt.value === value ? 700 : 500 }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Months multi-select dropdown ──
function MonthsDropdown({ availableMonthKeys, selectedMonthKeys, selectedMonthsLabel, onToggle }: {
  availableMonthKeys: string[];
  selectedMonthKeys: string[];
  selectedMonthsLabel: string;
  onToggle: (mk: string, checked: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[13px] px-2.5 pr-7 cursor-pointer hover:border-slate-300 transition-colors text-left flex items-center min-w-[140px]"
        style={{ fontWeight: 600 }}
      >
        <span className="truncate">{selectedMonthsLabel}</span>
        <ChevronDown className={`absolute right-2 w-3.5 h-3.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 min-w-full w-max max-h-[280px] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl z-[100] py-1">
          {availableMonthKeys.map(mk => {
            const checked = selectedMonthKeys.includes(mk);
            return (
              <label
                key={mk}
                className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer text-[13px] text-slate-700 dark:text-slate-200"
                style={{ fontWeight: 500 }}
              >
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  checked ? "bg-teal-600 border-teal-600" : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                }`}>
                  {checked && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={e => onToggle(mk, e.target.checked)}
                  className="hidden"
                />
                {abFormatMonthLabel(mk)}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color?: string }) {
  const colorMap: Record<string, string> = {
    emerald: "text-emerald-700 dark:text-emerald-400",
    red: "text-red-700 dark:text-red-400",
    sky: "text-sky-700 dark:text-sky-400",
  };
  return (
    <span className="inline-flex items-center gap-1 h-6 rounded-full border border-slate-200/80 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 px-2.5 text-[11px] text-slate-500 dark:text-slate-400" style={{ fontWeight: 600 }}>
      {label}: <strong className={`${colorMap[color || ""] || "text-slate-800 dark:text-slate-200"}`}>{value}</strong>
    </span>
  );
}
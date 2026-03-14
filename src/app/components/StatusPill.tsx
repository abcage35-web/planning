import { abNormalizeStatus, abStatusLabel } from "./ab-service";

interface StatusPillProps {
  rawValue: string;
  compact?: boolean;
  labelOverride?: string;
}

const kindStyles: Record<string, string> = {
  good: "border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-900/40 dark:text-emerald-400",
  bad: "border-red-300/60 bg-red-50 text-red-800 dark:border-red-700/60 dark:bg-red-900/40 dark:text-red-400",
  neutral: "border-amber-300/50 bg-amber-50 text-amber-800 dark:border-amber-700/50 dark:bg-amber-900/40 dark:text-amber-400",
  unknown: "border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
};

export function StatusPill({ rawValue, compact, labelOverride }: StatusPillProps) {
  const kind = abNormalizeStatus(rawValue);
  const label = (labelOverride || "").trim() || abStatusLabel(kind);
  const style = kindStyles[kind] || kindStyles.unknown;

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border px-2 whitespace-nowrap ${
        compact ? "h-[20px] min-w-[48px] text-[10px]" : "h-[24px] min-w-[64px] text-[11px]"
      } ${style}`}
      style={{ fontWeight: 700, fontFamily: "Inter, sans-serif" }}
      title={rawValue || label}
    >
      {label}
    </span>
  );
}
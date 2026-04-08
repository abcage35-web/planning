import type {
  TaskFormValues,
  TaskProgressStatus,
  TaskRecurrence,
  TaskRecurrenceFrequency,
} from "./types";

export const PARTICIPANTS = [
  {
    id: "sasha-nekrasov",
    name: "Саша Некрасов",
    shortName: "Саша Н.",
    accentClass: "from-sky-500 via-cyan-500 to-teal-500",
    glowClass: "shadow-[0_20px_60px_-35px_rgba(14,165,233,0.6)]",
  },
  {
    id: "sasha-manokhin",
    name: "Саша Манохин",
    shortName: "Саша М.",
    accentClass: "from-fuchsia-500 via-rose-500 to-orange-400",
    glowClass: "shadow-[0_20px_60px_-35px_rgba(244,114,182,0.65)]",
  },
  {
    id: "anton-bober",
    name: "Антон Бобер",
    shortName: "Антон Б.",
    accentClass: "from-emerald-500 via-lime-500 to-amber-400",
    glowClass: "shadow-[0_20px_60px_-35px_rgba(34,197,94,0.55)]",
  },
] as const;

export const TASK_GROUPS = [
  {
    id: "planned",
    label: "Плановые задачи",
    shortLabel: "План",
    badgeClass: "border-amber-200 bg-amber-100/90 text-amber-900",
    surfaceClass: "from-amber-50 to-yellow-100/80",
    borderClass: "border-amber-200/80",
  },
  {
    id: "new",
    label: "Новые задачи",
    shortLabel: "Новые",
    badgeClass: "border-sky-200 bg-sky-100/90 text-sky-900",
    surfaceClass: "from-sky-50 to-cyan-100/80",
    borderClass: "border-sky-200/80",
  },
  {
    id: "project",
    label: "Проектные задачи",
    shortLabel: "Проект",
    badgeClass: "border-violet-200 bg-violet-100/90 text-violet-900",
    surfaceClass: "from-violet-50 to-fuchsia-100/80",
    borderClass: "border-violet-200/80",
  },
  {
    id: "meeting",
    label: "Созвоны",
    shortLabel: "Созвоны",
    badgeClass: "border-emerald-200 bg-emerald-100/90 text-emerald-900",
    surfaceClass: "from-emerald-50 to-teal-100/80",
    borderClass: "border-emerald-200/80",
  },
  {
    id: "undefined",
    label: "Не определено",
    shortLabel: "Неопред.",
    badgeClass: "border-slate-200 bg-slate-100/90 text-slate-800",
    surfaceClass: "from-slate-50 to-slate-100/90",
    borderClass: "border-slate-200/80",
  },
] as const;

export const WEEKDAY_LABELS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
export const DEFAULT_WORK_HOURS_PER_DAY = 8;

export const TASK_PROGRESS_STATUSES: {
  id: TaskProgressStatus;
  label: string;
  shortLabel: string;
  chipClass: string;
}[] = [
  {
    id: "in-progress",
    label: "В работе",
    shortLabel: "В работе",
    chipClass: "border-sky-200 bg-sky-100/90 text-sky-800 hover:bg-sky-200/80",
  },
  {
    id: "done",
    label: "Готова",
    shortLabel: "Готова",
    chipClass: "border-emerald-200 bg-emerald-100/90 text-emerald-800 hover:bg-emerald-200/80",
  },
  {
    id: "cancelled",
    label: "Отменена",
    shortLabel: "Отмена",
    chipClass: "border-rose-200 bg-rose-100/90 text-rose-800 hover:bg-rose-200/80",
  },
];

export const RECURRENCE_FREQUENCIES: {
  id: TaskRecurrenceFrequency;
  label: string;
}[] = [
  { id: "none", label: "Не повторять" },
  { id: "daily", label: "Повторять по дням" },
  { id: "weekly", label: "Повторять по неделям" },
  { id: "monthly", label: "Повторять по месяцам" },
];

export const DEFAULT_TASK_RECURRENCE: TaskRecurrence = {
  frequency: "none",
  interval: 1,
  weekdays: [],
  untilMode: "forever",
  untilDate: "",
};

export const DEFAULT_TASK_FORM_VALUES: TaskFormValues = {
  title: "",
  description: "",
  link: "",
  hours: "1",
  group: "undefined",
  assignees: [],
  date: "",
  status: "bank",
  recurrence: DEFAULT_TASK_RECURRENCE,
};

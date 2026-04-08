import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { format, parseISO } from "date-fns";
import { CalendarRange, Clock3, Copy, Plus, Save, Trash2 } from "lucide-react";

import { Badge } from "@/app/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/app/components/ui/alert-dialog";
import { Button } from "@/app/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/app/components/ui/dialog";
import { Input } from "@/app/components/ui/input";
import { Label } from "@/app/components/ui/label";
import { Textarea } from "@/app/components/ui/textarea";
import { cn } from "@/app/components/ui/utils";
import { CalendarDayCell } from "@/app/planner/CalendarDayCell";
import {
  DEFAULT_WORK_HOURS_PER_DAY,
  DEFAULT_TASK_FORM_VALUES,
  PARTICIPANTS,
  RECURRENCE_FREQUENCIES,
  TASK_GROUPS,
  WEEKDAY_LABELS,
} from "@/app/planner/constants";
import { fetchPlannerState, persistPlannerState } from "@/app/planner/planner-service";
import { TaskGroupSection } from "@/app/planner/TaskGroupSection";
import {
  buildMonthGrid,
  buildTaskInput,
  clonePlannerTask,
  createEmptyPlannerState,
  createTaskFormValues,
  deletePlannerTask,
  getBankTaskCount,
  getCurrentMonthLabel,
  getDisplayDay,
  getMonthInputRange,
  getParticipantName,
  getParticipantNames,
  getPlannerSettings,
  getRecurrenceSummary,
  getScheduledTaskCount,
  getTaskLinkedTasks,
  getTaskPrimaryTask,
  getTaskSeriesAssignees,
  getTaskHoursForParticipant,
  getTasksForContainer,
  isDateWithinCurrentMonth,
  moveTaskToContainer,
  normalizeWorkHoursPerDay,
  sortPlannerTasks,
  updateTaskSeriesProgressStatus,
  upsertPlannerTask,
} from "@/app/planner/planner-utils";
import type {
  ContainerSpec,
  ParticipantId,
  PlannerSaveSummary,
  PlannerState,
  PlannerStorageInfo,
  PlannerTask,
  TaskProgressStatus,
  TaskGroupId,
  TaskFormValues,
} from "@/app/planner/types";

type SaveStatus = "loading" | "dirty" | "saving" | "saved" | "error";

interface TaskDialogState {
  open: boolean;
  mode: "create" | "edit";
  taskId?: string;
}

interface PlannerPageProps {
  standalone?: boolean;
}

const COLLAPSED_BANK_GROUPS_STORAGE_KEY = "planner:collapsed-bank-groups";

export function PlannerPage({ standalone = false }: PlannerPageProps) {
  const currentMonth = useMemo(() => new Date(), []);
  const monthLabel = useMemo(() => getCurrentMonthLabel(currentMonth), [currentMonth]);
  const monthDays = useMemo(() => buildMonthGrid(currentMonth), [currentMonth]);
  const monthRange = useMemo(() => getMonthInputRange(currentMonth), [currentMonth]);

  const [plannerState, setPlannerState] = useState<PlannerState | null>(null);
  const [storageInfo, setStorageInfo] = useState<PlannerStorageInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("loading");
  const [saveLabel, setSaveLabel] = useState("Загружаем состояние...");
  const [dialogState, setDialogState] = useState<TaskDialogState>({ open: false, mode: "create" });
  const [formValues, setFormValues] = useState<TaskFormValues>(DEFAULT_TASK_FORM_VALUES);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [visibleParticipantIds, setVisibleParticipantIds] = useState<ParticipantId[]>(
    PARTICIPANTS.map((participant) => participant.id),
  );
  const [collapsedBankGroupIds, setCollapsedBankGroupIds] = useState<TaskGroupId[]>([]);
  const [workHoursDraft, setWorkHoursDraft] = useState(String(DEFAULT_WORK_HOURS_PER_DAY));

  const plannerStateRef = useRef<PlannerState | null>(null);
  const saveTimeoutRef = useRef<number | null>(null);
  const saveVersionRef = useRef(0);
  const pendingSummaryRef = useRef<PlannerSaveSummary>({
    action: "init",
    message: "Planner state initialized",
  });

  const sortedTasks = useMemo(
    () => sortPlannerTasks(plannerState?.tasks ?? []),
    [plannerState?.tasks],
  );
  const bankTaskCount = useMemo(() => getBankTaskCount(sortedTasks), [sortedTasks]);
  const scheduledTaskCount = useMemo(() => getScheduledTaskCount(sortedTasks), [sortedTasks]);
  const selectedTask = useMemo(
    () => (dialogState.taskId ? getTaskPrimaryTask(sortedTasks, dialogState.taskId) : null),
    [dialogState.taskId, sortedTasks],
  );
  const selectedTaskSeries = useMemo(
    () => (dialogState.taskId ? getTaskLinkedTasks(sortedTasks, dialogState.taskId) : []),
    [dialogState.taskId, sortedTasks],
  );
  const selectedTaskSeriesAssigneeNames = useMemo(
    () => (selectedTask ? getParticipantNames(getTaskSeriesAssignees(selectedTask)) : []),
    [selectedTask],
  );
  const plannerSettings = useMemo(() => getPlannerSettings(plannerState), [plannerState]);
  const workHoursPerDay = plannerSettings.workHoursPerDay;
  const visibleParticipants = useMemo(
    () =>
      PARTICIPANTS.filter((participant) => visibleParticipantIds.includes(participant.id)),
    [visibleParticipantIds],
  );
  const automaticCalendarPlacement =
    formValues.status === "calendar" &&
    formValues.assignees.length > 0 &&
    Boolean(formValues.date);
  const selectedAssigneeNames = useMemo(
    () => getParticipantNames(formValues.assignees),
    [formValues.assignees],
  );
  const recurrenceSummary = useMemo(
    () => getRecurrenceSummary(formValues.recurrence, formValues.date),
    [formValues.date, formValues.recurrence],
  );

  const queueSave = useCallback((nextState: PlannerState, summary: PlannerSaveSummary) => {
    pendingSummaryRef.current = summary;
    setSaveStatus("dirty");
    setSaveLabel("Есть несохраненные изменения");
    saveVersionRef.current += 1;
    const currentVersion = saveVersionRef.current;

    if (saveTimeoutRef.current) {
      window.clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = window.setTimeout(async () => {
      setSaveStatus("saving");
      setSaveLabel("Сохраняем изменения в файл...");

      try {
        const response = await persistPlannerState(nextState, summary);
        setStorageInfo(response.storage);

        if (currentVersion === saveVersionRef.current) {
          setSaveStatus("saved");
          setSaveLabel(`Сохранено ${format(parseISO(response.payload.updatedAt), "HH:mm:ss")}`);
        }
      } catch (error) {
        setSaveStatus("error");
        setSaveLabel(error instanceof Error ? error.message : "Ошибка сохранения");
      }
    }, 450);
  }, []);

  const applyPlannerMutation = useCallback(
    (updater: (state: PlannerState) => PlannerState, summary: PlannerSaveSummary) => {
      const currentState = plannerStateRef.current;
      if (!currentState) {
        return;
      }

      const nextDraft = updater(currentState);
      const nextState: PlannerState = {
        ...nextDraft,
        updatedAt: new Date().toISOString(),
        settings: getPlannerSettings(nextDraft),
      };

      plannerStateRef.current = nextState;
      startTransition(() => {
        setPlannerState(nextState);
      });
      queueSave(nextState, summary);
    },
    [queueSave],
  );

  const applyTaskMutation = useCallback(
    (updater: (tasks: PlannerTask[]) => PlannerTask[], summary: PlannerSaveSummary) => {
      applyPlannerMutation(
        (state) => ({
          ...state,
          tasks: updater(state.tasks),
        }),
        summary,
      );
    },
    [applyPlannerMutation],
  );

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      setSaveStatus("loading");
      setSaveLabel("Загружаем состояние...");

      try {
        const response = await fetchPlannerState();
        if (ignore) {
          return;
        }

        plannerStateRef.current = response.payload;
        setPlannerState(response.payload);
        setStorageInfo(response.storage);
        setLoadError(null);
        setSaveStatus("saved");
        setSaveLabel(`Состояние загружено ${format(parseISO(response.payload.updatedAt), "HH:mm:ss")}`);
      } catch (error) {
        if (ignore) {
          return;
        }

        const fallbackState = createEmptyPlannerState();
        plannerStateRef.current = fallbackState;
        setPlannerState(fallbackState);
        setLoadError(error instanceof Error ? error.message : "Не удалось загрузить состояние");
        setSaveStatus("error");
        setSaveLabel("API сохранения пока недоступен");
      }
    };

    void load();

    return () => {
      ignore = true;
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    try {
      const rawValue = window.localStorage.getItem(COLLAPSED_BANK_GROUPS_STORAGE_KEY);
      if (!rawValue) {
        return;
      }

      const parsedValue = JSON.parse(rawValue);
      if (!Array.isArray(parsedValue)) {
        return;
      }

      const nextCollapsedGroupIds = parsedValue.filter((groupId): groupId is TaskGroupId =>
        TASK_GROUPS.some((group) => group.id === groupId),
      );

      setCollapsedBankGroupIds(nextCollapsedGroupIds);
    } catch {
      window.localStorage.removeItem(COLLAPSED_BANK_GROUPS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      COLLAPSED_BANK_GROUPS_STORAGE_KEY,
      JSON.stringify(collapsedBankGroupIds),
    );
  }, [collapsedBankGroupIds]);

  useEffect(() => {
    setWorkHoursDraft(String(workHoursPerDay));
  }, [workHoursPerDay]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (!plannerStateRef.current || saveStatus !== "dirty") {
        return;
      }

      void persistPlannerState(plannerStateRef.current, pendingSummaryRef.current, {
        keepalive: true,
      });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [saveStatus]);

  const openCreateDialog = useCallback(() => {
    setFormValues(DEFAULT_TASK_FORM_VALUES);
    setFormError(null);
    setDeleteConfirmOpen(false);
    setDialogState({ open: true, mode: "create" });
  }, []);

  const openEditDialog = useCallback((task: PlannerTask) => {
    const primaryTask = getTaskPrimaryTask(sortedTasks, task.id) || task;
    setFormValues(createTaskFormValues(primaryTask));
    setFormError(null);
    setDeleteConfirmOpen(false);
    setDialogState({ open: true, mode: "edit", taskId: task.id });
  }, [sortedTasks]);

  const handleDialogOpenChange = useCallback((open: boolean) => {
    setDialogState((current) => ({ ...current, open }));
    if (!open) {
      setFormError(null);
      setDeleteConfirmOpen(false);
    }
  }, []);

  const toggleVisibleParticipant = useCallback((participantId: ParticipantId) => {
    setVisibleParticipantIds((current) => {
      if (current.includes(participantId)) {
        return current.filter((id) => id !== participantId);
      }

      return PARTICIPANTS.filter((participant) =>
        [...current, participantId].includes(participant.id),
      ).map((participant) => participant.id);
    });
  }, []);

  const toggleAssignee = useCallback((participantId: ParticipantId) => {
    setFormValues((current) => ({
      ...current,
      assignees: current.assignees.includes(participantId)
        ? current.assignees.filter((id) => id !== participantId)
        : [...current.assignees, participantId],
    }));
  }, []);

  const toggleCollapsedBankGroup = useCallback((groupId: TaskGroupId) => {
    setCollapsedBankGroupIds((current) =>
      current.includes(groupId)
        ? current.filter((id) => id !== groupId)
        : [...current, groupId],
    );
  }, []);

  const handleTaskMove = useCallback(
    (taskId: string, containerSpec: ContainerSpec, targetIndex: number) => {
      applyTaskMutation(
        (tasks) => moveTaskToContainer(tasks, taskId, containerSpec, targetIndex, currentMonth),
        {
          action: "move",
          message: "Обновлено положение задачи",
          taskId,
        },
      );
    },
    [applyTaskMutation, currentMonth],
  );

  const handleTaskProgressStatusToggle = useCallback(
    (taskId: string, nextProgressStatus: TaskProgressStatus) => {
      applyTaskMutation(
        (tasks) => updateTaskSeriesProgressStatus(tasks, taskId, nextProgressStatus),
        {
          action: "progress",
          message: "Обновлен статус задачи",
          taskId,
        },
      );
    },
    [applyTaskMutation],
  );

  const commitWorkHoursPerDay = useCallback(
    (rawValue: string) => {
      const normalized = normalizeWorkHoursPerDay(Number(rawValue));
      setWorkHoursDraft(String(normalized));

      if (normalized === workHoursPerDay) {
        return;
      }

      applyPlannerMutation(
        (state) => ({
          ...state,
          settings: {
            ...getPlannerSettings(state),
            workHoursPerDay: normalized,
          },
        }),
        {
          action: "settings",
          message: "Обновлена настройка рабочего времени в день",
        },
      );
    },
    [applyPlannerMutation, workHoursPerDay],
  );

  const handleDeleteTask = useCallback(() => {
    if (!dialogState.taskId) {
      return;
    }

    setDeleteConfirmOpen(true);
  }, [dialogState.taskId]);

  const confirmDeleteTask = useCallback(() => {
    if (!dialogState.taskId) {
      return;
    }

    const deletingTaskId = dialogState.taskId;

    applyTaskMutation(
      (tasks) => deletePlannerTask(tasks, deletingTaskId),
      {
        action: "delete",
        message:
          selectedTaskSeries.length > 1
            ? "Удалена связанная серия задачи у всех исполнителей"
            : "Задача удалена",
        taskId: deletingTaskId,
      },
    );
    setDeleteConfirmOpen(false);
    setDialogState({ open: false, mode: "create" });
  }, [applyTaskMutation, dialogState.taskId, selectedTaskSeries.length]);

  const handleCloneTask = useCallback(() => {
    if (!selectedTask) {
      return;
    }

    const input = buildTaskInput(formValues);

    if (!input.title) {
      setFormError("Укажите название задачи.");
      return;
    }

    if (formValues.status === "calendar" && input.assignees.length === 0) {
      setFormError("Выберите хотя бы одного исполнителя.");
      return;
    }

    if (formValues.status === "calendar" && !input.date) {
      setFormError("Выберите дату для задачи в календаре.");
      return;
    }

    if (input.date && !isDateWithinCurrentMonth(input.date, currentMonth)) {
      setFormError("Дата задачи должна попадать в текущий месяц календаря.");
      return;
    }

    if (
      input.recurrence.frequency !== "none" &&
      input.recurrence.untilMode === "until" &&
      !input.recurrence.untilDate
    ) {
      setFormError("Укажите дату окончания повторения.");
      return;
    }

    if (
      input.recurrence.frequency !== "none" &&
      input.date &&
      input.recurrence.untilMode === "until" &&
      input.recurrence.untilDate &&
      input.recurrence.untilDate < input.date
    ) {
      setFormError("Дата окончания повторения не может быть раньше даты задачи.");
      return;
    }

    setFormError(null);

    applyTaskMutation(
      (tasks) => clonePlannerTask(tasks, selectedTask.id, input, currentMonth),
      {
        action: "clone",
        message:
          input.status === "calendar" && input.assignees.length > 1 && input.date
            ? `Клон задачи создан на ${input.assignees.length} календарях.`
            : "Задача клонирована",
        taskId: selectedTask.id,
      },
    );
    setDialogState({ open: false, mode: "create" });
  }, [applyTaskMutation, currentMonth, formValues, selectedTask]);

  const handleTaskSave = useCallback(() => {
    const input = buildTaskInput(formValues);

    if (!input.title) {
      setFormError("Укажите название задачи.");
      return;
    }

    if (formValues.status === "calendar" && input.assignees.length === 0) {
      setFormError("Выберите хотя бы одного исполнителя.");
      return;
    }

    if (formValues.status === "calendar" && !input.date) {
      setFormError("Выберите дату для задачи в календаре.");
      return;
    }

    if (input.date && !isDateWithinCurrentMonth(input.date, currentMonth)) {
      setFormError("Дата задачи должна попадать в текущий месяц календаря.");
      return;
    }

    if (
      input.recurrence.frequency !== "none" &&
      input.recurrence.untilMode === "until" &&
      !input.recurrence.untilDate
    ) {
      setFormError("Укажите дату окончания повторения.");
      return;
    }

    if (
      input.recurrence.frequency !== "none" &&
      input.date &&
      input.recurrence.untilMode === "until" &&
      input.recurrence.untilDate &&
      input.recurrence.untilDate < input.date
    ) {
      setFormError("Дата окончания повторения не может быть раньше даты задачи.");
      return;
    }

    setFormError(null);

    const editingTaskId = dialogState.taskId;
    const saveMessage =
      input.status === "calendar" && input.assignees.length > 1 && input.date
        ? `Задача размещена на ${input.assignees.length} календарях.`
        : dialogState.mode === "create"
          ? "Новая задача создана"
          : "Задача обновлена";
    applyTaskMutation(
      (tasks) => upsertPlannerTask(tasks, input, currentMonth, editingTaskId),
      {
        action: dialogState.mode === "create" ? "create" : "update",
        message: saveMessage,
        taskId: editingTaskId,
      },
    );
    setDialogState({ open: false, mode: "create" });
  }, [applyTaskMutation, currentMonth, dialogState.mode, dialogState.taskId, formValues]);

  return (
    <DndProvider backend={HTML5Backend}>
      <section className={cn("space-y-6", standalone && "w-full")}>
        <div className="relative overflow-hidden rounded-[32px] border border-white/70 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.94),_rgba(236,253,245,0.85)_35%,_rgba(239,246,255,0.88)_70%,_rgba(248,250,252,0.94)_100%)] p-6 shadow-[0_30px_70px_-40px_rgba(15,23,42,0.45)]">
          <div className="absolute -left-16 top-0 h-56 w-56 rounded-full bg-sky-300/20 blur-3xl" />
          <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-emerald-300/20 blur-3xl" />
          <div className="relative flex flex-col gap-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
            <div className="max-w-4xl space-y-4">
              <Badge
                variant="outline"
                className="border-white/80 bg-white/80 px-3 py-1 text-xs uppercase tracking-[0.3em] text-slate-600"
              >
                Standalone Planner
              </Badge>
              <div className="space-y-2">
                <h1 className="text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                  Планировщик задач на текущий месяц
                </h1>
                <p className="max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                  Отдельная самостоятельная страница с банком задач, тремя календарями и
                  сохранением в локальные файлы JSON и NDJSON.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="border-white/80 bg-white/70 shadow-none">
                <CardContent className="px-5 py-4">
                  <div className="flex items-center gap-2 text-slate-500">
                    <CalendarRange className="size-4" />
                    <span className="text-xs uppercase tracking-[0.16em]">Месяц</span>
                  </div>
                  <div className="mt-2 text-xl font-semibold capitalize text-slate-900">
                    {monthLabel}
                  </div>
                </CardContent>
              </Card>
              <Card className="border-white/80 bg-white/70 shadow-none">
                <CardContent className="px-5 py-4">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Clock3 className="size-4" />
                    <span className="text-xs uppercase tracking-[0.16em]">В банке</span>
                  </div>
                  <div className="mt-2 text-xl font-semibold text-slate-900">{bankTaskCount}</div>
                </CardContent>
              </Card>
              <Card className="border-white/80 bg-white/70 shadow-none">
                <CardContent className="px-5 py-4">
                  <div className="flex items-center gap-2 text-slate-500">
                    <Save className="size-4" />
                    <span className="text-xs uppercase tracking-[0.16em]">Запланировано</span>
                  </div>
                  <div className="mt-2 text-xl font-semibold text-slate-900">
                    {scheduledTaskCount}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {loadError ? (
          <Card className="border-amber-200 bg-amber-50/90">
            <CardContent className="px-5 py-4 text-sm text-amber-900">
              Хранилище пока не ответило: {loadError}. Для постоянного сохранения планировщик
              нужно запускать через `vite`, чтобы локальный API был доступен.
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="xl:sticky xl:top-6 xl:self-start">
            <Card className="overflow-hidden border-white/80 bg-white/82 shadow-[0_22px_60px_-45px_rgba(15,23,42,0.6)] backdrop-blur-xl">
              <CardHeader className="border-b border-white/70 pb-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-2xl font-semibold text-slate-950">
                      Банк задач
                    </CardTitle>
                    <CardDescription className="mt-2 text-sm leading-6 text-slate-600">
                      Панель закреплена слева. Отсюда задачи можно перетаскивать в календарь и
                      возвращать обратно.
                    </CardDescription>
                  </div>
                  <Button className="rounded-2xl" onClick={openCreateDialog}>
                    <Plus className="size-4" />
                    Новая
                  </Button>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="border-slate-200 bg-white/85 text-slate-700">
                    {saveLabel}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "border-transparent",
                      saveStatus === "saved" && "bg-emerald-100 text-emerald-800",
                      saveStatus === "saving" && "bg-sky-100 text-sky-800",
                      saveStatus === "dirty" && "bg-amber-100 text-amber-800",
                      saveStatus === "error" && "bg-rose-100 text-rose-800",
                      saveStatus === "loading" && "bg-slate-100 text-slate-700",
                    )}
                  >
                    {saveStatus}
                  </Badge>
                </div>

                {storageInfo ? (
                  <div className="mt-4 space-y-1 text-xs text-slate-500">
                    <div>Состояние: {storageInfo.stateFile}</div>
                    <div>Лог изменений: {storageInfo.logFile}</div>
                  </div>
                ) : null}
              </CardHeader>
              <CardContent className="px-4 py-4">
                <div className="space-y-3">
                  {TASK_GROUPS.map((group) => (
                    <TaskGroupSection
                      key={group.id}
                      title={group.label}
                      groupId={group.id}
                      tasks={getTasksForContainer(sortedTasks, {
                        kind: "bank",
                        group: group.id,
                      })}
                      containerSpec={{
                        kind: "bank",
                        group: group.id,
                      }}
                      collapsible
                      collapsed={collapsedBankGroupIds.includes(group.id)}
                      onToggleCollapsed={toggleCollapsedBankGroup}
                      onMoveTask={handleTaskMove}
                      onToggleTaskProgressStatus={handleTaskProgressStatusToggle}
                      onOpenTask={openEditDialog}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          </aside>

          <div className="space-y-6">
            <Card className="border-white/80 bg-white/82 shadow-[0_20px_60px_-42px_rgba(15,23,42,0.55)]">
              <CardContent className="flex flex-col gap-4 px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-900">Фильтр календарей</p>
                  <p className="text-sm text-slate-500">
                    По умолчанию включены все. Нажмите на имя, чтобы скрыть или вернуть календарь.
                  </p>
                </div>
                <div className="flex flex-col gap-3 xl:items-end">
                  <div className="flex flex-wrap gap-2">
                    {PARTICIPANTS.map((participant) => {
                      const isVisible = visibleParticipantIds.includes(participant.id);

                      return (
                        <button
                          key={`filter-${participant.id}`}
                          type="button"
                          onClick={() => toggleVisibleParticipant(participant.id)}
                          className={cn(
                            "rounded-full border px-4 py-2 text-sm font-medium transition-all",
                            isVisible
                              ? "border-slate-900 bg-slate-900 text-white shadow-[0_10px_30px_-18px_rgba(15,23,42,0.8)]"
                              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900",
                          )}
                        >
                          {participant.name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 px-3 py-2">
                    <Label
                      htmlFor="work-hours-per-day"
                      className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500"
                    >
                      Рабочее время в день
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="work-hours-per-day"
                        type="number"
                        min="1"
                        max="24"
                        step="0.5"
                        value={workHoursDraft}
                        onChange={(event) => setWorkHoursDraft(event.target.value)}
                        onBlur={(event) => commitWorkHoursPerDay(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            commitWorkHoursPerDay(workHoursDraft);
                          }
                        }}
                        className="h-9 w-24 rounded-xl border-slate-200 bg-white text-sm shadow-none"
                      />
                      <span className="text-sm text-slate-500">ч</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {visibleParticipants.length === 0 ? (
              <Card className="border-dashed border-slate-300 bg-white/75">
                <CardContent className="px-6 py-8 text-center text-sm text-slate-500">
                  Выберите хотя бы один календарь в фильтре выше.
                </CardContent>
              </Card>
            ) : null}

            {visibleParticipants.map((participant) => (
              <Card
                key={participant.id}
                className={cn(
                  "overflow-hidden border-white/80 bg-white/82 shadow-[0_30px_70px_-45px_rgba(15,23,42,0.6)]",
                  participant.glowClass,
                )}
              >
                <CardHeader className="border-b border-white/70 pb-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start gap-4">
                      <div
                        className={cn(
                          "h-14 w-1.5 rounded-full bg-gradient-to-b",
                          participant.accentClass,
                        )}
                      />
                      <div>
                        <CardTitle className="text-3xl font-semibold uppercase tracking-[0.04em] text-slate-950">
                          {participant.name}
                        </CardTitle>
                        <CardDescription className="mt-2 max-w-2xl text-sm text-slate-600">
                          {monthLabel}. Отображается только текущий месяц. Задачи можно
                          перетаскивать по дням, между группами и обратно в банк задач.
                        </CardDescription>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Badge variant="outline" className="border-white/80 bg-white/85 text-slate-700">
                        {sortedTasks.filter(
                          (task) =>
                            task.status === "calendar" && task.assignee === participant.id,
                        ).length}{" "}
                        задач
                      </Badge>
                      <Badge variant="outline" className="border-white/80 bg-white/85 text-slate-700">
                        {getTaskHoursForParticipant(sortedTasks, participant.id).toFixed(1)} ч
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="px-4 py-4">
                  <div className="overflow-x-auto">
                    <div className="min-w-[1120px] space-y-3">
                      <div className="grid grid-cols-7 gap-3">
                        {WEEKDAY_LABELS.map((weekday) => (
                          <div
                            key={`${participant.id}-${weekday}`}
                            className="rounded-xl bg-slate-100/80 px-3 py-2 text-center text-[11px] font-semibold tracking-[0.14em] text-slate-500"
                          >
                            {weekday}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-3">
                        {monthDays.map((day) => (
                          <CalendarDayCell
                            key={`${participant.id}-${day.toISOString()}`}
                            date={day}
                            currentMonth={currentMonth}
                            tasks={sortedTasks}
                            participantId={participant.id}
                            workHoursPerDay={workHoursPerDay}
                            onMoveTask={handleTaskMove}
                            onToggleTaskProgressStatus={handleTaskProgressStatusToggle}
                            onOpenTask={openEditDialog}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Dialog open={dialogState.open} onOpenChange={handleDialogOpenChange}>
          <DialogContent className="max-h-[calc(100vh-1.25rem)] gap-0 overflow-hidden border-white/80 bg-white/95 p-0 shadow-[0_40px_100px_-45px_rgba(15,23,42,0.65)] sm:max-w-6xl sm:grid-rows-[auto_minmax(0,1fr)_auto]">
            <DialogHeader className="border-b border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(240,253,250,0.96),_rgba(239,246,255,0.96)_42%,_rgba(255,255,255,0.98)_100%)] px-6 py-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-2">
                  <DialogTitle className="text-[1.85rem] font-semibold leading-none text-slate-950">
                    {dialogState.mode === "create" ? "Новая задача" : "Настройки задачи"}
                  </DialogTitle>
                  <DialogDescription className="max-w-2xl text-sm leading-6 text-slate-600">
                    Настройте карточку и быстро проверьте итог справа. Если выбрать
                    исполнителей и дату, задача сразу разместится на всех выбранных
                    календарях.
                  </DialogDescription>
                </div>

                <div className="flex flex-wrap gap-2 lg:max-w-[360px] lg:justify-end">
                  <Badge variant="outline" className="border-white bg-white/90 text-slate-700">
                    Текущий месяц: {monthLabel}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "border-white bg-white/90 text-slate-700",
                      automaticCalendarPlacement &&
                        "border-emerald-200 bg-emerald-50 text-emerald-700",
                    )}
                  >
                    {automaticCalendarPlacement
                      ? "Готово к размещению в календаре"
                      : "Сохранение в банк"}
                  </Badge>
                  {selectedTaskSeries.length > 1 ? (
                    <Badge
                      variant="outline"
                      className="border-sky-200 bg-sky-50 text-sky-700"
                    >
                      Связано: {selectedTaskSeries.length} копии
                    </Badge>
                  ) : null}
                </div>
              </div>
            </DialogHeader>

            <div className="min-h-0 overflow-y-auto overscroll-contain">
              <div className="grid gap-5 px-6 py-5 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="space-y-5">
                  {formError ? (
                    <div className="rounded-[22px] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      {formError}
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label
                      htmlFor="task-title"
                      className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
                    >
                      Название задачи
                    </Label>
                    <Input
                      id="task-title"
                      className="h-11 rounded-2xl border-slate-200 bg-white text-sm shadow-sm"
                      value={formValues.title}
                      onChange={(event) =>
                        setFormValues((current) => ({ ...current, title: event.target.value }))
                      }
                      placeholder="Например, Подготовить отчет по проекту"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[148px_180px_minmax(0,1fr)]">
                    <div className="space-y-2">
                      <Label
                        htmlFor="task-hours"
                        className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
                      >
                        Время, часы
                      </Label>
                      <Input
                        id="task-hours"
                        type="number"
                        min="0"
                        step="0.5"
                        className="h-11 rounded-2xl border-slate-200 bg-white text-sm shadow-sm"
                        value={formValues.hours}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            hours: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="task-date"
                        className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
                      >
                        Дата
                      </Label>
                      <Input
                        id="task-date"
                        type="date"
                        min={monthRange.min}
                        max={monthRange.max}
                        className="h-11 rounded-2xl border-slate-200 bg-white text-sm shadow-sm"
                        value={formValues.date}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            date: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="task-link"
                        className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
                      >
                        Ссылка
                      </Label>
                      <Input
                        id="task-link"
                        type="url"
                        className="h-11 rounded-2xl border-slate-200 bg-white text-sm shadow-sm"
                        value={formValues.link}
                        onChange={(event) =>
                          setFormValues((current) => ({
                            ...current,
                            link: event.target.value,
                          }))
                        }
                        placeholder="https://..."
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Группа
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {TASK_GROUPS.map((group) => (
                        <button
                          key={group.id}
                          type="button"
                          onClick={() =>
                            setFormValues((current) => ({
                              ...current,
                              group: group.id,
                            }))
                          }
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                            formValues.group === group.id
                              ? `${group.badgeClass} shadow-[0_10px_22px_-18px_rgba(15,23,42,0.45)]`
                              : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900",
                          )}
                        >
                          {group.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Исполнители
                      </Label>
                      <span className="text-xs text-slate-400">
                        {formValues.assignees.length > 0
                          ? `${formValues.assignees.length} выбрано`
                          : "Не выбраны"}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {PARTICIPANTS.map((participant) => {
                        const selected = formValues.assignees.includes(participant.id);

                        return (
                          <button
                            key={participant.id}
                            type="button"
                            onClick={() => toggleAssignee(participant.id)}
                            className={cn(
                              "rounded-full border px-4 py-2 text-sm font-medium transition-all",
                              selected
                                ? "border-slate-900 bg-slate-900 text-white shadow-[0_12px_28px_-18px_rgba(15,23,42,0.85)]"
                                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900",
                            )}
                          >
                            {participant.name}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs leading-5 text-slate-500">
                      Можно выбрать сразу несколько человек. Если указана дата, задача
                      создастся на календаре каждого выбранного исполнителя.
                    </p>
                  </div>

                  <div className="space-y-3 rounded-[24px] border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        Повторение
                      </Label>
                      <span className="text-xs text-slate-400">{recurrenceSummary}</span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_112px]">
                      <div className="space-y-2">
                        <Label
                          htmlFor="task-recurrence-frequency"
                          className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
                        >
                          Тип повторения
                        </Label>
                        <select
                          id="task-recurrence-frequency"
                          value={formValues.recurrence.frequency}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              recurrence: {
                                ...current.recurrence,
                                frequency: event.target.value as typeof current.recurrence.frequency,
                              },
                            }))
                          }
                          className="flex h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
                        >
                          {RECURRENCE_FREQUENCIES.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label
                          htmlFor="task-recurrence-interval"
                          className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
                        >
                          Каждый
                        </Label>
                        <Input
                          id="task-recurrence-interval"
                          type="number"
                          min="1"
                          max="52"
                          step="1"
                          className="h-11 rounded-2xl border-slate-200 bg-white text-sm shadow-none"
                          value={String(formValues.recurrence.interval)}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              recurrence: {
                                ...current.recurrence,
                                interval: Math.max(1, Number(event.target.value) || 1),
                              },
                            }))
                          }
                          disabled={formValues.recurrence.frequency === "none"}
                        />
                      </div>
                    </div>

                    {formValues.recurrence.frequency === "weekly" ? (
                      <div className="space-y-2">
                        <Label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          Дни недели
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {WEEKDAY_LABELS.map((weekday, weekdayIndex) => {
                            const selected = formValues.recurrence.weekdays.includes(weekdayIndex);

                            return (
                              <button
                                key={`repeat-weekday-${weekday}`}
                                type="button"
                                onClick={() =>
                                  setFormValues((current) => ({
                                    ...current,
                                    recurrence: {
                                      ...current.recurrence,
                                      weekdays: selected
                                        ? current.recurrence.weekdays.filter((day) => day !== weekdayIndex)
                                        : [...current.recurrence.weekdays, weekdayIndex].sort((left, right) => left - right),
                                    },
                                  }))
                                }
                                className={cn(
                                  "rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                                  selected
                                    ? "border-amber-300 bg-amber-100 text-amber-900 shadow-[0_10px_18px_-16px_rgba(217,119,6,0.7)]"
                                    : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900",
                                )}
                              >
                                {weekday}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() =>
                          setFormValues((current) => ({
                            ...current,
                            recurrence: {
                              ...current.recurrence,
                              untilMode: "forever",
                            },
                          }))
                        }
                        className={cn(
                          "rounded-[20px] border px-4 py-3 text-left transition-all",
                          formValues.recurrence.untilMode === "forever"
                            ? "border-slate-900 bg-slate-900 text-white shadow-[0_12px_24px_-18px_rgba(15,23,42,0.8)]"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                        )}
                        disabled={formValues.recurrence.frequency === "none"}
                      >
                        <div className="text-sm font-semibold">Всегда</div>
                        <div className="mt-1 text-xs opacity-80">Без даты окончания</div>
                      </button>

                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() =>
                            setFormValues((current) => ({
                              ...current,
                              recurrence: {
                                ...current.recurrence,
                                untilMode: "until",
                              },
                            }))
                          }
                          className={cn(
                            "w-full rounded-[20px] border px-4 py-3 text-left transition-all",
                            formValues.recurrence.untilMode === "until"
                              ? "border-primary bg-primary/10 text-slate-900 shadow-[0_12px_24px_-18px_rgba(13,148,136,0.5)]"
                              : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                          )}
                          disabled={formValues.recurrence.frequency === "none"}
                        >
                          <div className="text-sm font-semibold">До даты</div>
                          <div className="mt-1 text-xs opacity-80">Ограничить повторение</div>
                        </button>
                        <Input
                          type="date"
                          min={formValues.date || monthRange.min}
                          value={formValues.recurrence.untilDate}
                          onChange={(event) =>
                            setFormValues((current) => ({
                              ...current,
                              recurrence: {
                                ...current.recurrence,
                                untilDate: event.target.value,
                              },
                            }))
                          }
                          disabled={
                            formValues.recurrence.frequency === "none" ||
                            formValues.recurrence.untilMode !== "until"
                          }
                          className="h-11 rounded-2xl border-slate-200 bg-white text-sm shadow-none"
                        />
                      </div>
                    </div>

                    <p className="text-xs leading-5 text-slate-500">
                      Повторение работает для задач с датой в календаре. Время суток не
                      учитывается, повторяются только даты.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label
                      htmlFor="task-description"
                      className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
                    >
                      Описание
                    </Label>
                    <Textarea
                      id="task-description"
                      className="min-h-[132px] rounded-[22px] border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
                      value={formValues.description}
                      onChange={(event) =>
                        setFormValues((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                      placeholder="Детали задачи, ссылки на материалы, ожидания по результату."
                    />
                  </div>
                </div>

                <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start">
                  <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Размещение
                    </p>
                    <div className="mt-3 grid gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setFormValues((current) => ({
                            ...current,
                            status: "bank",
                          }))
                        }
                        className={cn(
                          "rounded-[20px] border px-4 py-3 text-left transition-all",
                          formValues.status === "bank"
                            ? "border-slate-900 bg-slate-900 text-white shadow-[0_14px_32px_-20px_rgba(15,23,42,0.9)]"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                        )}
                      >
                        <div className="text-sm font-semibold">Банк задач</div>
                        <div className="mt-1 text-xs opacity-80">
                          Карточка остается слева до планирования.
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFormValues((current) => ({
                            ...current,
                            status: "calendar",
                          }))
                        }
                        className={cn(
                          "rounded-[20px] border px-4 py-3 text-left transition-all",
                          formValues.status === "calendar"
                            ? "border-emerald-500 bg-emerald-500 text-white shadow-[0_14px_32px_-20px_rgba(16,185,129,0.9)]"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
                        )}
                      >
                        <div className="text-sm font-semibold">В календари</div>
                        <div className="mt-1 text-xs opacity-80">
                          Требуются исполнители и дата внутри текущего месяца.
                        </div>
                      </button>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      В банке можно заранее заполнить дату, повторение и исполнителей.
                      Перенос в календари происходит только когда вы явно выбираете
                      размещение или перетаскиваете задачу в нужный день.
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-slate-50/90 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Что произойдет
                    </p>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                      <p>
                        {automaticCalendarPlacement
                          ? `После сохранения задача появится в ${formValues.assignees.length} календарях на дату ${getDisplayDay(formValues.date)}.`
                          : formValues.date
                            ? `После сохранения задача останется в банке с датой ${getDisplayDay(formValues.date)} и будет готова к переносу.`
                            : "После сохранения задача останется в банке задач и будет готова к переносу."}
                      </p>
                      <p>
                        {selectedAssigneeNames.length > 0
                          ? `Исполнители: ${selectedAssigneeNames.join(", ")}`
                          : "Исполнители пока не выбраны."}
                      </p>
                      <p>Повторение: {recurrenceSummary}</p>
                      {selectedTask ? (
                        <p>
                          Сейчас:{" "}
                          {selectedTask.status === "calendar"
                            ? `${getParticipantName(selectedTask.assignee)} • ${
                                selectedTask.date
                                  ? getDisplayDay(selectedTask.date)
                                  : "без даты"
                              }`
                            : "банк задач"}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Контроль заполнения
                    </p>
                    <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                      <p>Название обязательно всегда. Остальные поля можно заполнить позже.</p>
                      <p>Для размещения в календарях нужны исполнители и дата текущего месяца. В банке дату можно хранить как преднастройку.</p>
                      <p>Связанные задачи синхронизируются между всеми выбранными исполнителями.</p>
                    </div>
                  </div>
                </aside>
              </div>
            </div>

            <DialogFooter className="border-t border-slate-200/80 px-6 py-4 sm:justify-between">
              <div className="flex items-center gap-2">
                {dialogState.mode === "edit" ? (
                  <>
                    <Button variant="outline" className="rounded-2xl" onClick={handleCloneTask}>
                      <Copy className="size-4" />
                      Клонировать
                    </Button>
                    <Button variant="destructive" className="rounded-2xl" onClick={handleDeleteTask}>
                      <Trash2 className="size-4" />
                      Удалить
                    </Button>
                  </>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="rounded-2xl"
                  onClick={() => handleDialogOpenChange(false)}
                >
                  Отмена
                </Button>
                <Button className="rounded-2xl" onClick={handleTaskSave}>
                  <Save className="size-4" />
                  Сохранить
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
          <AlertDialogContent className="border-white/80 bg-white/95 shadow-[0_40px_100px_-45px_rgba(15,23,42,0.65)]">
            <AlertDialogHeader>
              <AlertDialogTitle>
                {selectedTaskSeries.length > 1 ? "Удалить связанную серию задач?" : "Удалить задачу?"}
              </AlertDialogTitle>
              <AlertDialogDescription className="leading-6 text-slate-600">
                {selectedTaskSeries.length > 1
                  ? `Будут удалены все связанные копии задачи у исполнителей: ${selectedTaskSeriesAssigneeNames.join(", ")}. Это действие нельзя отменить.`
                  : "Задача будет удалена без возможности восстановления."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="rounded-2xl">Отмена</AlertDialogCancel>
              <AlertDialogAction
                className="rounded-2xl bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500"
                onClick={confirmDeleteTask}
              >
                Удалить
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    </DndProvider>
  );
}

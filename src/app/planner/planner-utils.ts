import {
  addDays,
  differenceInCalendarDays,
  differenceInCalendarMonths,
  differenceInCalendarWeeks,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ru } from "date-fns/locale";

import {
  DEFAULT_TASK_RECURRENCE,
  DEFAULT_WORK_HOURS_PER_DAY,
  PARTICIPANTS,
  WEEKDAY_LABELS,
} from "./constants";
import type {
  ContainerSpec,
  ParticipantId,
  PlannerState,
  PlannerSettings,
  PlannerTask,
  PlannerTaskInput,
  TaskProgressStatus,
  TaskRecurrence,
  TaskFormValues,
} from "./types";

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function uniqueParticipantIds(ids?: ParticipantId[] | null) {
  const values = Array.isArray(ids) ? ids : [];
  return values.filter(
    (id, index) =>
      PARTICIPANTS.some((participant) => participant.id === id) &&
      values.indexOf(id) === index,
  );
}

function makeTaskId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeSeriesId() {
  return `series-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeRecurrenceGroupId() {
  return `repeat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getTaskSeriesId(task: Pick<PlannerTask, "id"> & Partial<Pick<PlannerTask, "seriesId">>) {
  return task.seriesId || task.id;
}

function getTaskFallbackAssignees(task: Pick<PlannerTask, "assignee"> & Partial<Pick<PlannerTask, "seriesAssignees">>) {
  const seriesAssignees = uniqueParticipantIds(task.seriesAssignees);
  if (seriesAssignees.length > 0) {
    return seriesAssignees;
  }

  return task.assignee ? [task.assignee] : [];
}

function shouldScheduleTask(input: PlannerTaskInput) {
  return input.assignees.length > 0 && Boolean(input.date);
}

function uniqueWeekdays(weekdays?: number[] | null) {
  const values = Array.isArray(weekdays) ? weekdays : [];
  return values.filter(
    (day, index) => Number.isInteger(day) && day >= 0 && day <= 6 && values.indexOf(day) === index,
  );
}

function getWeekdayIndexFromDate(dateKey?: string | null) {
  if (!dateKey) {
    return null;
  }

  const date = parseISO(dateKey);
  return Number.isNaN(date.getTime()) ? null : (date.getDay() + 6) % 7;
}

export function normalizeTaskRecurrence(
  recurrence?: Partial<TaskRecurrence> | null,
  anchorDate?: string | null,
): TaskRecurrence {
  const frequency = recurrence?.frequency || DEFAULT_TASK_RECURRENCE.frequency;
  const interval = Math.max(1, Math.min(52, Math.round(Number(recurrence?.interval) || 1)));
  const anchorWeekday = getWeekdayIndexFromDate(anchorDate);
  const weekdays = uniqueWeekdays(recurrence?.weekdays);

  return {
    frequency,
    interval,
    weekdays:
      frequency === "weekly"
        ? weekdays.length > 0
          ? weekdays
          : anchorWeekday !== null
            ? [anchorWeekday]
            : []
        : weekdays,
    untilMode: recurrence?.untilMode === "until" ? "until" : "forever",
    untilDate: recurrence?.untilDate || "",
  };
}

export function getTaskRecurrence(
  task: Partial<Pick<PlannerTask, "recurrence" | "date">>,
) {
  return normalizeTaskRecurrence(task.recurrence, task.date || null);
}

function isRecurringTask(recurrence: TaskRecurrence) {
  return recurrence.frequency !== "none";
}

function getTaskRecurrenceGroupId(task: Partial<Pick<PlannerTask, "recurrenceGroupId">>) {
  return task.recurrenceGroupId || null;
}

function describeWeeklyRecurrence(weekdays: number[]) {
  return uniqueWeekdays(weekdays)
    .sort((left, right) => left - right)
    .map((weekday) => WEEKDAY_LABELS[weekday])
    .join(", ");
}

export function getRecurrenceSummary(
  recurrence: TaskRecurrence,
  dateKey?: string | null,
) {
  if (!dateKey || recurrence.frequency === "none") {
    return "Без повторения";
  }

  if (recurrence.frequency === "daily") {
    return recurrence.interval === 1
      ? "Каждый день"
      : `Каждые ${recurrence.interval} дня`;
  }

  if (recurrence.frequency === "weekly") {
    const weekdays = describeWeeklyRecurrence(recurrence.weekdays);
    const weekLabel = recurrence.interval === 1 ? "неделю" : `${recurrence.interval}-ю неделю`;
    return weekdays
      ? `Повторять в ${weekdays} каждую ${weekLabel}`
      : `Повторять по неделям`;
  }

  return recurrence.interval === 1
    ? "Каждый месяц"
    : `Каждые ${recurrence.interval} месяца`;
}

export function normalizeWorkHoursPerDay(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_WORK_HOURS_PER_DAY;
  }

  return Math.max(1, Math.min(24, Math.round(value * 10) / 10));
}

export function getTaskProgressStatus(
  task: Pick<PlannerTask, "progressStatus"> & Partial<Pick<PlannerTask, "id">>,
) {
  return task.progressStatus || ("in-progress" satisfies TaskProgressStatus);
}

function getRecurringDates(
  anchorDateKey: string,
  recurrence: TaskRecurrence,
  currentMonth: Date,
) {
  if (!anchorDateKey) {
    return [];
  }

  const anchorDate = parseISO(anchorDateKey);
  if (Number.isNaN(anchorDate.getTime())) {
    return [];
  }

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const untilDate =
    recurrence.untilMode === "until" && recurrence.untilDate
      ? parseISO(recurrence.untilDate)
      : null;

  const dates: string[] = [];
  let cursor = monthStart;

  while (cursor <= monthEnd) {
    if (cursor >= anchorDate && (!untilDate || cursor <= untilDate)) {
      const weekdayIndex = (cursor.getDay() + 6) % 7;
      const dailyDiff = differenceInCalendarDays(cursor, anchorDate);
      const weeklyDiff = differenceInCalendarWeeks(cursor, anchorDate, {
        weekStartsOn: 1,
      });
      const monthlyDiff = differenceInCalendarMonths(cursor, anchorDate);

      const shouldInclude =
        recurrence.frequency === "daily"
          ? dailyDiff % recurrence.interval === 0
          : recurrence.frequency === "weekly"
            ? recurrence.weekdays.includes(weekdayIndex) &&
              weeklyDiff >= 0 &&
              weeklyDiff % recurrence.interval === 0
            : recurrence.frequency === "monthly"
              ? cursor.getDate() === anchorDate.getDate() &&
                monthlyDiff >= 0 &&
                monthlyDiff % recurrence.interval === 0
              : isSameDay(cursor, anchorDate);

      if (shouldInclude) {
        dates.push(format(cursor, "yyyy-MM-dd"));
      }
    }

    cursor = addDays(cursor, 1);
  }

  return dates;
}

export function createEmptyPlannerState(): PlannerState {
  const nowIso = new Date().toISOString();

  return {
    version: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    settings: {
      workHoursPerDay: DEFAULT_WORK_HOURS_PER_DAY,
    },
    tasks: [],
  };
}

export function getPlannerSettings(state: PlannerState | null): PlannerSettings {
  return {
    workHoursPerDay: normalizeWorkHoursPerDay(state?.settings?.workHoursPerDay ?? DEFAULT_WORK_HOURS_PER_DAY),
  };
}

export function getCurrentMonthLabel(currentMonth: Date) {
  return format(currentMonth, "LLLL yyyy", { locale: ru });
}

export function buildMonthGrid(currentMonth: Date) {
  const firstDay = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
  const lastDay = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
  const days: Date[] = [];

  let cursor = firstDay;
  while (cursor <= lastDay) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return days;
}

export function getDateKey(date: Date) {
  return format(date, "yyyy-MM-dd");
}

export function getDisplayDay(dateKey: string | null) {
  if (!dateKey) {
    return "";
  }

  return format(parseISO(dateKey), "dd.MM");
}

export function getContainerId(spec: ContainerSpec) {
  if (spec.kind === "calendar" && spec.assignee && spec.date) {
    return `calendar:${spec.assignee}:${spec.date}:${spec.group}`;
  }

  return `bank:${spec.group}`;
}

export function getTaskContainerSpec(task: PlannerTask): ContainerSpec {
  if (task.status === "calendar" && task.assignee && task.date) {
    return {
      kind: "calendar",
      assignee: task.assignee,
      date: task.date,
      group: task.group,
    };
  }

  return {
    kind: "bank",
    group: task.group,
  };
}

export function getTaskContainerId(task: PlannerTask) {
  return getContainerId(getTaskContainerSpec(task));
}

export function getTaskSeriesTasks(tasks: PlannerTask[], taskId: string) {
  const sourceTask = tasks.find((task) => task.id === taskId);
  if (!sourceTask) {
    return [];
  }

  const seriesId = getTaskSeriesId(sourceTask);
  return sortPlannerTasks(tasks).filter((task) => getTaskSeriesId(task) === seriesId);
}

function getTaskRecurrenceTasks(
  tasks: PlannerTask[],
  taskId: string,
) {
  const sourceTask = tasks.find((task) => task.id === taskId);
  if (!sourceTask) {
    return [];
  }

  const recurrenceGroupId = getTaskRecurrenceGroupId(sourceTask);
  if (!recurrenceGroupId) {
    return getTaskSeriesTasks(tasks, taskId);
  }

  return sortPlannerTasks(tasks).filter(
    (task) => getTaskRecurrenceGroupId(task) === recurrenceGroupId,
  );
}

export function getTaskSeriesAssignees(task: PlannerTask) {
  return getTaskFallbackAssignees(task);
}

export function sortPlannerTasks(tasks: PlannerTask[]) {
  return [...tasks].sort((left, right) => {
    const orderDiff = left.order - right.order;
    if (orderDiff !== 0) {
      return orderDiff;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

export function normalizeTaskOrders(tasks: PlannerTask[]) {
  const grouped = new Map<string, PlannerTask[]>();

  for (const task of sortPlannerTasks(tasks)) {
    const containerId = getTaskContainerId(task);
    const list = grouped.get(containerId) || [];
    list.push(task);
    grouped.set(containerId, list);
  }

  const normalized: PlannerTask[] = [];
  for (const list of grouped.values()) {
    list.forEach((task, index) => {
      normalized.push({
        ...task,
        order: index,
      });
    });
  }

  return normalized;
}

export function getTasksForContainer(tasks: PlannerTask[], spec: ContainerSpec) {
  const containerId = getContainerId(spec);
  return sortPlannerTasks(tasks).filter((task) => getTaskContainerId(task) === containerId);
}

export function getParticipantName(participantId: ParticipantId | null) {
  return PARTICIPANTS.find((participant) => participant.id === participantId)?.name || "Не назначен";
}

export function getShortParticipantName(participantId: ParticipantId | null) {
  return PARTICIPANTS.find((participant) => participant.id === participantId)?.shortName || "Без исполнителя";
}

export function getParticipantNames(participantIds: ParticipantId[]) {
  return uniqueParticipantIds(participantIds).map((participantId) => getParticipantName(participantId));
}

export function getShortParticipantNames(participantIds: ParticipantId[]) {
  return uniqueParticipantIds(participantIds).map((participantId) =>
    getShortParticipantName(participantId),
  );
}

function getSeriesParticipantIds(tasks: PlannerTask[]) {
  return uniqueParticipantIds(tasks.flatMap((task) => getTaskFallbackAssignees(task)));
}

function buildCollapsedBankSeriesTask(
  seriesTasks: PlannerTask[],
  sourceTask: PlannerTask,
  targetGroup: PlannerTask["group"],
  updatedAt: string,
) {
  const assignees = getSeriesParticipantIds(seriesTasks);
  const representativeTask =
    seriesTasks.find((task) => task.id === sourceTask.id) || sortPlannerTasks(seriesTasks)[0];

  return {
    ...representativeTask,
    seriesId: getTaskSeriesId(representativeTask),
    seriesAssignees: assignees,
    progressStatus: getTaskProgressStatus(representativeTask),
    assignee: assignees.length === 1 ? assignees[0] : null,
    date: null,
    status: "bank" as const,
    group: targetGroup,
    updatedAt,
  };
}

function patchTaskWithContainer(task: PlannerTask, spec: ContainerSpec) {
  if (spec.kind === "calendar") {
    return {
      ...task,
      status: "calendar" as const,
      group: spec.group,
      assignee: spec.assignee || task.assignee,
      date: spec.date || task.date,
    };
  }

  return {
    ...task,
    status: "bank" as const,
    group: spec.group,
    date: null,
  };
}

function buildContainerMap(tasks: PlannerTask[]) {
  const grouped = new Map<string, PlannerTask[]>();

  for (const task of sortPlannerTasks(tasks)) {
    const containerId = getTaskContainerId(task);
    const list = grouped.get(containerId) || [];
    list.push(task);
    grouped.set(containerId, list);
  }

  return grouped;
}

export function moveTaskToContainer(
  tasks: PlannerTask[],
  taskId: string,
  targetSpec: ContainerSpec,
  targetIndex: number,
  currentMonth: Date,
) {
  const sourceTask = tasks.find((task) => task.id === taskId);
  if (!sourceTask) {
    return tasks;
  }

  const nowIso = new Date().toISOString();
  const seriesTasks = getTaskSeriesTasks(tasks, taskId);
  const movedSeriesId = getTaskSeriesId(sourceTask);
  const tasksToMove = seriesTasks.length > 0 ? seriesTasks : [sourceTask];
  const remainingTasks = tasks
    .filter((task) => getTaskSeriesId(task) !== movedSeriesId)
    .map((task) => ({ ...task }));
  const containerMap = buildContainerMap(remainingTasks);
  const movedTasksByContainer = new Map<string, PlannerTask[]>();
  const seriesAssignees = getSeriesParticipantIds(tasksToMove);
  const recurrence = getTaskRecurrence(sourceTask);

  if (targetSpec.kind === "bank") {
    const movedTask = buildCollapsedBankSeriesTask(
      tasksToMove,
      sourceTask,
      targetSpec.group,
      nowIso,
    );
    const containerId = getTaskContainerId(movedTask);
    movedTasksByContainer.set(containerId, [movedTask]);
  } else {
    const calendarAssignees =
      seriesAssignees.length > 0
        ? seriesAssignees
        : targetSpec.assignee
          ? [targetSpec.assignee]
          : [];
    const occurrenceDates =
      sourceTask.status === "bank" &&
      isRecurringTask(recurrence) &&
      targetSpec.date
        ? getRecurringDates(targetSpec.date, recurrence, currentMonth)
        : targetSpec.date
          ? [targetSpec.date]
          : [];
    const recurrenceGroupId =
      occurrenceDates.length > 1
        ? getTaskRecurrenceGroupId(sourceTask) || makeRecurrenceGroupId()
        : getTaskRecurrenceGroupId(sourceTask);

    occurrenceDates.forEach((occurrenceDate, occurrenceIndex) => {
      const occurrenceSeriesId =
        occurrenceIndex === 0 ? movedSeriesId : makeSeriesId();

      calendarAssignees.forEach((assignee, index) => {
        const previousSibling =
          occurrenceIndex === 0
            ? tasksToMove.find((task) => task.assignee === assignee) ||
              (index === 0 ? sourceTask : null)
            : null;
        const baseTask = previousSibling || sourceTask;
        const movedTask = patchTaskWithContainer(
          {
            ...baseTask,
            id: previousSibling?.id || (occurrenceIndex === 0 && index === 0 ? sourceTask.id : makeTaskId()),
            updatedAt: nowIso,
            seriesId: occurrenceSeriesId,
            seriesAssignees:
              calendarAssignees.length > 0
                ? calendarAssignees
                : getTaskFallbackAssignees(baseTask),
            recurrenceGroupId,
            recurrence,
            progressStatus: getTaskProgressStatus(baseTask),
          },
          {
            kind: "calendar",
            group: targetSpec.group,
            assignee,
            date: occurrenceDate,
          },
        );
        const containerId = getTaskContainerId(movedTask);
        const list = movedTasksByContainer.get(containerId) || [];
        list.push(movedTask);
        movedTasksByContainer.set(containerId, list);
      });
    });
  }

  for (const [containerId, movedTasks] of movedTasksByContainer.entries()) {
    const currentList = [...(containerMap.get(containerId) || [])];
    const insertIndex = clamp(targetIndex, 0, currentList.length);
    currentList.splice(insertIndex, 0, ...sortPlannerTasks(movedTasks));
    containerMap.set(containerId, currentList);
  }

  return normalizeTaskOrders(Array.from(containerMap.values()).flat());
}

export function deletePlannerTask(tasks: PlannerTask[], taskId: string) {
  const sourceTask = tasks.find((task) => task.id === taskId);
  if (!sourceTask) {
    return tasks;
  }

  const deletingRecurrenceGroupId = getTaskRecurrenceGroupId(sourceTask);
  const tasksToDelete = getTaskRecurrenceTasks(tasks, taskId);
  const deletingTaskIds = new Set(tasksToDelete.map((task) => task.id));

  return normalizeTaskOrders(
    tasks.filter((task) =>
      deletingRecurrenceGroupId
        ? getTaskRecurrenceGroupId(task) !== deletingRecurrenceGroupId
        : !deletingTaskIds.has(task.id),
    ),
  );
}

export function updateTaskSeriesProgressStatus(
  tasks: PlannerTask[],
  taskId: string,
  progressStatus: TaskProgressStatus,
) {
  const sourceTask = tasks.find((task) => task.id === taskId);
  if (!sourceTask) {
    return tasks;
  }

  const nowIso = new Date().toISOString();
  const updatingSeriesId = getTaskSeriesId(sourceTask);

  return tasks.map((task) =>
    getTaskSeriesId(task) === updatingSeriesId
      ? {
          ...task,
          seriesId: getTaskSeriesId(task),
          seriesAssignees: getTaskFallbackAssignees(task),
          recurrence: getTaskRecurrence(task),
          progressStatus,
          updatedAt: nowIso,
        }
      : task,
  );
}

export function cycleTaskProgressStatus(status: TaskProgressStatus) {
  if (status === "in-progress") {
    return "done" satisfies TaskProgressStatus;
  }

  if (status === "done") {
    return "cancelled" satisfies TaskProgressStatus;
  }

  return "in-progress" satisfies TaskProgressStatus;
}

export function clonePlannerTask(
  tasks: PlannerTask[],
  taskId: string,
  input: PlannerTaskInput,
  currentMonth: Date,
) {
  const sourceTask = tasks.find((task) => task.id === taskId);
  if (!sourceTask) {
    return tasks;
  }

  const nextTasks = upsertPlannerTask(tasks, input, currentMonth);
  const previousTaskIds = new Set(tasks.map((task) => task.id));
  const createdTasks = nextTasks.filter((task) => !previousTaskIds.has(task.id));

  if (createdTasks.length === 0) {
    return nextTasks;
  }

  const nowIso = new Date().toISOString();
  const createdRecurrenceGroupId = getTaskRecurrenceGroupId(createdTasks[0]);
  const createdSeriesId = getTaskSeriesId(createdTasks[0]);
  const sourceProgressStatus = getTaskProgressStatus(sourceTask);

  return nextTasks.map((task) => {
    const matchesCloneGroup = createdRecurrenceGroupId
      ? getTaskRecurrenceGroupId(task) === createdRecurrenceGroupId
      : getTaskSeriesId(task) === createdSeriesId;

    return matchesCloneGroup
      ? {
          ...task,
          progressStatus: sourceProgressStatus,
          updatedAt: nowIso,
        }
      : task;
  });
}

export function buildTaskInput(values: TaskFormValues): PlannerTaskInput {
  const hoursValue = Number(values.hours);
  const assignees = uniqueParticipantIds(values.assignees);
  const date = values.date || null;
  const status = assignees.length > 0 && date ? "calendar" : values.status;

  return {
    title: values.title.trim(),
    description: values.description.trim(),
    link: values.link.trim(),
    hours: Number.isFinite(hoursValue) ? Math.max(0, Math.round(hoursValue * 10) / 10) : 0,
    group: values.group,
    assignees,
    date,
    status,
    recurrence: normalizeTaskRecurrence(values.recurrence, date),
  };
}

export function upsertPlannerTask(
  tasks: PlannerTask[],
  input: PlannerTaskInput,
  currentMonth: Date,
  editingTaskId?: string,
) {
  const nowIso = new Date().toISOString();
  const previousTask = editingTaskId ? tasks.find((task) => task.id === editingTaskId) : null;
  if (editingTaskId && !previousTask) {
    return tasks;
  }

  const recurrence = normalizeTaskRecurrence(input.recurrence, input.date);
  const previousSeriesId = previousTask ? getTaskSeriesId(previousTask) : makeSeriesId();
  const previousRecurrenceGroupId = previousTask ? getTaskRecurrenceGroupId(previousTask) : null;
  const previousSeriesTasks = previousTask ? getTaskRecurrenceTasks(tasks, previousTask.id) : [];
  const withoutPreviousSeries = previousTask
    ? tasks
        .filter((task) =>
          previousRecurrenceGroupId
            ? getTaskRecurrenceGroupId(task) !== previousRecurrenceGroupId
            : getTaskSeriesId(task) !== previousSeriesId,
        )
        .map((task) => ({ ...task }))
    : tasks.map((task) => ({ ...task }));

  const scheduleToCalendars = shouldScheduleTask(input);
  const seriesAssignees = uniqueParticipantIds(input.assignees);
  const assignees = scheduleToCalendars
    ? seriesAssignees
    : [seriesAssignees.length === 1 ? seriesAssignees[0] : null];
  const recurrenceGroupId =
    scheduleToCalendars && isRecurringTask(recurrence)
      ? previousRecurrenceGroupId || makeRecurrenceGroupId()
      : null;
  const occurrenceDates =
    scheduleToCalendars && input.date
      ? isRecurringTask(recurrence)
        ? getRecurringDates(input.date, recurrence, currentMonth)
        : [input.date]
      : [null];
  const previousSeriesIdByDate = new Map<string, string>();

  previousSeriesTasks.forEach((task) => {
    if (!task.date || previousSeriesIdByDate.has(task.date)) {
      return;
    }
    previousSeriesIdByDate.set(task.date, getTaskSeriesId(task));
  });

  const createdTasks = occurrenceDates.flatMap((occurrenceDate) => {
    const occurrenceSeriesId =
      occurrenceDate && previousSeriesIdByDate.get(occurrenceDate)
        ? previousSeriesIdByDate.get(occurrenceDate)!
        : occurrenceDate
          ? makeSeriesId()
          : previousSeriesId;

    return assignees.map((assignee, index) => {
      const previousSibling =
        previousSeriesTasks.find(
          (task) => task.assignee === assignee && (task.date || null) === occurrenceDate,
        ) || (!occurrenceDate && index === 0 ? previousTask : null);
      const createdAt = previousSibling?.createdAt || nowIso;
      const nextTask: PlannerTask = {
        id: previousSibling?.id || makeTaskId(),
        seriesId: occurrenceSeriesId,
        seriesAssignees,
        recurrenceGroupId,
        recurrence,
        progressStatus: previousSibling?.progressStatus || "in-progress",
        title: input.title,
        description: input.description,
        link: input.link,
        hours: input.hours,
        group: input.group,
        assignee,
        date: occurrenceDate,
        status: scheduleToCalendars && assignee && occurrenceDate ? "calendar" : "bank",
        order: 0,
        createdAt,
        updatedAt: nowIso,
      };

      const targetTasks = getTasksForContainer(
        withoutPreviousSeries,
        getTaskContainerSpec(nextTask),
      );
      const sameContainer =
        previousSibling &&
        getTaskContainerId(previousSibling) === getTaskContainerId(nextTask);

      return {
        ...nextTask,
        assignee:
          nextTask.status === "bank" && seriesAssignees.length > 1 ? null : nextTask.assignee,
        order:
          sameContainer && previousSibling ? previousSibling.order : targetTasks.length + index,
      };
    });
  });

  return normalizeTaskOrders([...withoutPreviousSeries, ...createdTasks]);
}

export function isDateToday(date: Date) {
  return isSameDay(date, new Date());
}

export function getMonthInputRange(currentMonth: Date) {
  return {
    min: format(startOfMonth(currentMonth), "yyyy-MM-dd"),
    max: format(endOfMonth(currentMonth), "yyyy-MM-dd"),
  };
}

export function formatHours(hours: number) {
  const normalized = Math.round(hours * 10) / 10;
  return `${normalized}ч`;
}

export function isDateWithinCurrentMonth(dateValue: string, currentMonth: Date) {
  if (!dateValue) {
    return false;
  }

  const date = parseISO(dateValue);
  return format(date, "yyyy-MM") === format(currentMonth, "yyyy-MM");
}

export function createTaskFormValues(task?: PlannerTask): TaskFormValues {
  if (!task) {
    return {
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
  }

  return {
    title: task.title,
    description: task.description,
    link: task.link,
    hours: String(task.hours || 0),
    group: task.group,
    assignees: getTaskSeriesAssignees(task),
    date: task.date || "",
    status: task.status,
    recurrence: getTaskRecurrence(task),
  };
}

export function getTaskHoursForParticipant(tasks: PlannerTask[], participantId: ParticipantId) {
  return tasks
    .filter((task) => task.status === "calendar" && task.assignee === participantId)
    .reduce((total, task) => total + task.hours, 0);
}

export function getBankTaskCount(tasks: PlannerTask[]) {
  return tasks.filter((task) => task.status === "bank").length;
}

export function getScheduledTaskCount(tasks: PlannerTask[]) {
  return tasks.filter((task) => task.status === "calendar").length;
}

export function getDailyHours(tasks: PlannerTask[], participantId: ParticipantId, dateKey: string) {
  return tasks
    .filter(
      (task) =>
        task.status === "calendar" &&
        task.assignee === participantId &&
        task.date === dateKey,
    )
    .reduce((total, task) => total + task.hours, 0);
}

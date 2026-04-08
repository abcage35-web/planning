import {
  addDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ru } from "date-fns/locale";

import { DEFAULT_WORK_HOURS_PER_DAY, PARTICIPANTS } from "./constants";
import type {
  ContainerSpec,
  ParticipantId,
  PlannerState,
  PlannerSettings,
  PlannerTask,
  PlannerTaskInput,
  TaskProgressStatus,
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

    calendarAssignees.forEach((assignee, index) => {
      const previousSibling =
        tasksToMove.find((task) => task.assignee === assignee) ||
        (index === 0 ? sourceTask : null);
      const baseTask = previousSibling || sourceTask;
      const movedTask = patchTaskWithContainer(
        {
          ...baseTask,
          id: previousSibling?.id || (index === 0 ? sourceTask.id : makeTaskId()),
          updatedAt: nowIso,
          seriesId: movedSeriesId,
          seriesAssignees:
            calendarAssignees.length > 0
              ? calendarAssignees
              : getTaskFallbackAssignees(baseTask),
          progressStatus: getTaskProgressStatus(baseTask),
        },
        {
          kind: "calendar",
          group: targetSpec.group,
          assignee,
          date: targetSpec.date,
        },
      );
      const containerId = getTaskContainerId(movedTask);
      const list = movedTasksByContainer.get(containerId) || [];
      list.push(movedTask);
      movedTasksByContainer.set(containerId, list);
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

  const deletingSeriesId = getTaskSeriesId(sourceTask);
  return normalizeTaskOrders(tasks.filter((task) => getTaskSeriesId(task) !== deletingSeriesId));
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
) {
  const sourceTask = tasks.find((task) => task.id === taskId);
  if (!sourceTask) {
    return tasks;
  }

  const nextTasks = upsertPlannerTask(tasks, input);
  const previousTaskIds = new Set(tasks.map((task) => task.id));
  const createdTask = nextTasks.find((task) => !previousTaskIds.has(task.id));

  if (!createdTask) {
    return nextTasks;
  }

  return updateTaskSeriesProgressStatus(
    nextTasks,
    createdTask.id,
    getTaskProgressStatus(sourceTask),
  );
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
  };
}

export function upsertPlannerTask(
  tasks: PlannerTask[],
  input: PlannerTaskInput,
  editingTaskId?: string,
) {
  const nowIso = new Date().toISOString();
  const previousTask = editingTaskId ? tasks.find((task) => task.id === editingTaskId) : null;
  if (editingTaskId && !previousTask) {
    return tasks;
  }

  const previousSeriesId = previousTask ? getTaskSeriesId(previousTask) : makeSeriesId();
  const previousSeriesTasks = previousTask ? getTaskSeriesTasks(tasks, previousTask.id) : [];
  const withoutPreviousSeries = previousTask
    ? tasks.filter((task) => getTaskSeriesId(task) !== previousSeriesId).map((task) => ({ ...task }))
    : tasks.map((task) => ({ ...task }));

  const scheduleToCalendars = shouldScheduleTask(input);
  const seriesAssignees = uniqueParticipantIds(input.assignees);
  const assignees = scheduleToCalendars
    ? seriesAssignees
    : [seriesAssignees.length === 1 ? seriesAssignees[0] : null];

  const createdTasks = assignees.map((assignee, index) => {
    const previousSibling =
      previousSeriesTasks.find((task) => task.assignee === assignee) ||
      (index === 0 ? previousTask : null);
    const createdAt = previousSibling?.createdAt || nowIso;
    const nextTask: PlannerTask = {
      id: previousSibling?.id || makeTaskId(),
      seriesId: previousSeriesId,
      seriesAssignees,
      progressStatus: previousSibling?.progressStatus || "in-progress",
      title: input.title,
      description: input.description,
      link: input.link,
      hours: input.hours,
      group: input.group,
      assignee,
      date: input.date,
      status: scheduleToCalendars && assignee && input.date ? "calendar" : "bank",
      order: 0,
      createdAt,
      updatedAt: nowIso,
    };

    const targetTasks = getTasksForContainer(withoutPreviousSeries, getTaskContainerSpec(nextTask));
    const sameContainer =
      previousSibling &&
      getTaskContainerId(previousSibling) === getTaskContainerId(nextTask);

    return {
      ...nextTask,
      order: sameContainer && previousSibling ? previousSibling.order : targetTasks.length + index,
    };
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

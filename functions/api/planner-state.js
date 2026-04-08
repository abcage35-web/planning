import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const STORAGE_DIR = resolve(process.cwd(), "storage");
const STATE_FILE = resolve(STORAGE_DIR, "planner-state.json");
const TEMP_STATE_FILE = resolve(STORAGE_DIR, "planner-state.json.tmp");
const LOG_FILE = resolve(STORAGE_DIR, "planner-state-log.ndjson");

const TASK_GROUPS = new Set(["planned", "new", "project", "meeting", "undefined"]);
const PARTICIPANTS = new Set(["sasha-nekrasov", "sasha-manokhin", "anton-bober"]);
const TASK_PROGRESS_STATUSES = new Set(["cancelled", "in-progress", "done"]);
const TASK_RECURRENCE_FREQUENCIES = new Set(["none", "daily", "weekly", "monthly"]);
const DEFAULT_WORK_HOURS_PER_DAY = 8;

const DEFAULT_TASKS = [
  {
    id: "seed-analytics-report",
    title: "Подготовить отчет",
    description: "Собрать метрики за текущий месяц и подготовить короткое резюме.",
    link: "",
    hours: 2,
    group: "planned",
    progressStatus: "in-progress",
    assignee: null,
    date: null,
    status: "bank",
    order: 0,
    createdAt: "2026-04-01T08:00:00.000Z",
    updatedAt: "2026-04-01T08:00:00.000Z",
  },
  {
    id: "seed-new-brief",
    title: "Новый бриф",
    description: "Уточнить вводные по новой задаче и проверить материалы от клиента.",
    link: "",
    hours: 1.5,
    group: "new",
    progressStatus: "in-progress",
    assignee: null,
    date: null,
    status: "bank",
    order: 0,
    createdAt: "2026-04-01T08:05:00.000Z",
    updatedAt: "2026-04-01T08:05:00.000Z",
  },
  {
    id: "seed-project-sync",
    title: "Проектный созвон",
    description: "Сверить статусы по проекту и зафиксировать следующие шаги.",
    link: "",
    hours: 1,
    group: "meeting",
    progressStatus: "in-progress",
    assignee: "sasha-nekrasov",
    date: null,
    status: "bank",
    order: 0,
    createdAt: "2026-04-01T08:10:00.000Z",
    updatedAt: "2026-04-01T08:10:00.000Z",
  },
];

function json(data, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");

  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  });
}

function toSafeString(valueRaw, maxLength = 2000) {
  return String(valueRaw ?? "").trim().slice(0, maxLength);
}

function toIsoOrNow(valueRaw, fallbackIso = new Date().toISOString()) {
  const value = toSafeString(valueRaw, 100);
  if (!value) {
    return fallbackIso;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallbackIso;
  }

  return parsed.toISOString();
}

function toHours(valueRaw) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(24, Math.round(value * 10) / 10));
}

function toGroup(valueRaw) {
  const value = toSafeString(valueRaw, 40).toLowerCase();
  return TASK_GROUPS.has(value) ? value : "undefined";
}

function toParticipant(valueRaw) {
  const value = toSafeString(valueRaw, 80).toLowerCase();
  return PARTICIPANTS.has(value) ? value : null;
}

function toParticipantList(valueRaw) {
  if (!Array.isArray(valueRaw)) {
    return [];
  }

  return valueRaw
    .map((value) => toParticipant(value))
    .filter((value, index, values) => value && values.indexOf(value) === index);
}

function toDate(valueRaw) {
  const value = toSafeString(valueRaw, 20);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function toStatus(valueRaw) {
  return toSafeString(valueRaw, 20).toLowerCase() === "calendar" ? "calendar" : "bank";
}

function toProgressStatus(valueRaw) {
  const value = toSafeString(valueRaw, 40).toLowerCase();
  return TASK_PROGRESS_STATUSES.has(value) ? value : "in-progress";
}

function toWorkHours(valueRaw) {
  const value = Number(valueRaw);
  if (!Number.isFinite(value)) {
    return DEFAULT_WORK_HOURS_PER_DAY;
  }

  return Math.max(1, Math.min(24, Math.round(value * 10) / 10));
}

function toRecurrenceFrequency(valueRaw) {
  const value = toSafeString(valueRaw, 40).toLowerCase();
  return TASK_RECURRENCE_FREQUENCIES.has(value) ? value : "none";
}

function toWeekdays(valueRaw) {
  if (!Array.isArray(valueRaw)) {
    return [];
  }

  return valueRaw
    .map((value) => Number(value))
    .filter((value, index, values) => Number.isInteger(value) && value >= 0 && value <= 6 && values.indexOf(value) === index);
}

function sanitizeRecurrence(recurrenceRaw, dateValue) {
  const raw = recurrenceRaw && typeof recurrenceRaw === "object" ? recurrenceRaw : {};
  const frequency = toRecurrenceFrequency(raw.frequency);
  const interval = Math.max(1, Math.min(52, Math.round(Number(raw.interval) || 1)));
  const weekdays = toWeekdays(raw.weekdays);
  const weekdayFromDate = dateValue ? (new Date(dateValue).getDay() + 6) % 7 : null;

  return {
    frequency,
    interval,
    weekdays:
      frequency === "weekly"
        ? weekdays.length > 0
          ? weekdays
          : weekdayFromDate !== null
            ? [weekdayFromDate]
            : []
        : weekdays,
    untilMode: toSafeString(raw.untilMode, 20).toLowerCase() === "until" ? "until" : "forever",
    untilDate: toDate(raw.untilDate) || "",
  };
}

function sanitizeTask(taskRaw, index) {
  const raw = taskRaw && typeof taskRaw === "object" ? taskRaw : {};
  const createdAt = toIsoOrNow(raw.createdAt);
  const status = toStatus(raw.status);
  const assignee = toParticipant(raw.assignee);
  const date = toDate(raw.date);
  const seriesId = toSafeString(raw.seriesId, 120) || toSafeString(raw.id, 120) || `series-${Date.now()}-${index}`;
  const seriesAssignees = toParticipantList(raw.seriesAssignees);
  const recurrence = sanitizeRecurrence(raw.recurrence, date);

  return {
    id: toSafeString(raw.id, 120) || `task-${Date.now()}-${index}`,
    seriesId,
    seriesAssignees: seriesAssignees.length > 0 ? seriesAssignees : assignee ? [assignee] : [],
    recurrenceGroupId: toSafeString(raw.recurrenceGroupId, 120) || null,
    recurrence,
    title: toSafeString(raw.title, 180),
    description: toSafeString(raw.description, 4000),
    link: toSafeString(raw.link, 1000),
    hours: toHours(raw.hours),
    group: toGroup(raw.group),
    progressStatus: toProgressStatus(raw.progressStatus),
    assignee,
    date,
    status: status === "calendar" && assignee && date ? "calendar" : "bank",
    order: Number.isFinite(Number(raw.order)) ? Math.max(0, Math.round(Number(raw.order))) : index,
    createdAt,
    updatedAt: toIsoOrNow(raw.updatedAt, createdAt),
  };
}

function sortTasks(tasksRaw) {
  const tasks = Array.isArray(tasksRaw) ? tasksRaw.slice() : [];
  return tasks.sort((left, right) => {
    const orderDiff = (left.order || 0) - (right.order || 0);
    if (orderDiff !== 0) {
      return orderDiff;
    }

    return String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
  });
}

function getSeriesId(task) {
  return toSafeString(task?.seriesId, 120) || toSafeString(task?.id, 120);
}

function getSeriesAssignees(task) {
  const seriesAssignees = toParticipantList(task?.seriesAssignees);
  if (seriesAssignees.length > 0) {
    return seriesAssignees;
  }

  return task?.assignee ? [task.assignee] : [];
}

function collapseBankSeriesTasks(tasksRaw) {
  const tasks = Array.isArray(tasksRaw) ? tasksRaw : [];
  const calendarTasks = [];
  const bankSeriesMap = new Map();

  for (const task of tasks) {
    if (task?.status === "bank") {
      const familyId = toSafeString(task?.recurrenceGroupId, 120) || getSeriesId(task);
      const list = bankSeriesMap.get(familyId) || [];
      list.push(task);
      bankSeriesMap.set(familyId, list);
      continue;
    }

    calendarTasks.push(task);
  }

  const collapsedBankTasks = [];

  for (const seriesTasks of bankSeriesMap.values()) {
    const orderedSeriesTasks = sortTasks(seriesTasks);
    const representativeTask = orderedSeriesTasks[0];
    const assignees = orderedSeriesTasks.flatMap((task) => getSeriesAssignees(task));
    const uniqueAssignees = assignees.filter(
      (value, index, values) => value && values.indexOf(value) === index,
    );

    collapsedBankTasks.push({
      ...representativeTask,
      seriesId: getSeriesId(representativeTask),
      seriesAssignees: uniqueAssignees,
      assignee: uniqueAssignees.length === 1 ? uniqueAssignees[0] : null,
      date: representativeTask.date || null,
      status: "bank",
    });
  }

  return [...calendarTasks, ...collapsedBankTasks];
}

function containerKey(task) {
  if (task.status === "calendar" && task.assignee && task.date) {
    return `calendar:${task.assignee}:${task.date}:${task.group}`;
  }

  return `bank:${task.group}`;
}

function normalizeOrders(tasksRaw) {
  const tasks = sortTasks(tasksRaw);
  const grouped = new Map();

  for (const task of tasks) {
    const key = containerKey(task);
    const list = grouped.get(key) || [];
    list.push(task);
    grouped.set(key, list);
  }

  const normalized = [];
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

function sanitizeState(payloadRaw) {
  const payload = payloadRaw && typeof payloadRaw === "object" ? payloadRaw : {};
  const tasksSource = Array.isArray(payload.tasks) ? payload.tasks : [];
  const sanitizedTasks = tasksSource.map((task, index) => sanitizeTask(task, index));
  const tasks = normalizeOrders(collapseBankSeriesTasks(sanitizedTasks));
  const updatedAt = toIsoOrNow(payload.updatedAt);
  const createdAt = toIsoOrNow(payload.createdAt, updatedAt);

  return {
    version: 1,
    createdAt,
    updatedAt,
    settings: {
      workHoursPerDay: toWorkHours(payload.settings?.workHoursPerDay),
    },
    tasks,
  };
}

function buildDefaultState() {
  return sanitizeState({
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    tasks: DEFAULT_TASKS,
  });
}

async function ensureStorageDir() {
  await mkdir(STORAGE_DIR, { recursive: true });
}

async function writeStateFile(payload) {
  await ensureStorageDir();
  await writeFile(TEMP_STATE_FILE, JSON.stringify(payload, null, 2), "utf8");
  await rename(TEMP_STATE_FILE, STATE_FILE);
}

async function appendLogEntry(entryRaw) {
  await ensureStorageDir();
  const entry = entryRaw && typeof entryRaw === "object" ? entryRaw : {};
  await appendFile(LOG_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}

function summarizeState(payload) {
  const tasks = Array.isArray(payload.tasks) ? payload.tasks : [];
  const scheduled = tasks.filter((task) => task.status === "calendar").length;

  return {
    tasksTotal: tasks.length,
    scheduledTotal: scheduled,
    bankTotal: Math.max(0, tasks.length - scheduled),
  };
}

async function loadStateFromDisk() {
  if (!existsSync(STATE_FILE)) {
    const defaultState = buildDefaultState();
    await writeStateFile(defaultState);
    await appendLogEntry({
      at: defaultState.updatedAt,
      action: "init",
      summary: "Initial planner state created",
      ...summarizeState(defaultState),
    });
    return defaultState;
  }

  const raw = await readFile(STATE_FILE, "utf8");
  return sanitizeState(JSON.parse(raw));
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}

export async function onRequestGet() {
  try {
    const payload = await loadStateFromDisk();

    return json({
      ok: true,
      payload,
      storage: {
        stateFile: "storage/planner-state.json",
        logFile: "storage/planner-state-log.ndjson",
      },
      stats: summarizeState(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load planner state";
    return json({ ok: false, error: message }, { status: 500 });
  }
}

export async function onRequestPut(context) {
  let body;
  try {
    body = await context.request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const payload = sanitizeState(body?.payload);
  const summary = toSafeString(body?.summary?.message, 240) || "Planner state saved";
  const action = toSafeString(body?.summary?.action, 80) || "save";
  const changedTaskId = toSafeString(body?.summary?.taskId, 120) || null;
  const nowIso = new Date().toISOString();

  payload.updatedAt = nowIso;

  try {
    await writeStateFile(payload);
    await appendLogEntry({
      at: nowIso,
      action,
      taskId: changedTaskId,
      summary,
      ...summarizeState(payload),
    });

    return json({
      ok: true,
      payload,
      storage: {
        stateFile: "storage/planner-state.json",
        logFile: "storage/planner-state-log.ndjson",
      },
      stats: summarizeState(payload),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save planner state";
    return json({ ok: false, error: message }, { status: 500 });
  }
}

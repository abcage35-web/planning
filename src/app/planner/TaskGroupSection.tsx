import { useRef } from "react";
import { useDragLayer, useDrop } from "react-dnd";
import { ChevronDown, Plus } from "lucide-react";

import { Badge } from "@/app/components/ui/badge";
import { cn } from "@/app/components/ui/utils";
import { TASK_GROUPS } from "@/app/planner/constants";
import { TASK_ITEM_TYPE, type DragTaskItem } from "@/app/planner/dnd";
import { getContainerId } from "@/app/planner/planner-utils";
import { TaskCard } from "@/app/planner/TaskCard";
import type { ContainerSpec, PlannerTask, TaskProgressStatus } from "@/app/planner/types";

interface TaskGroupSectionProps {
  title: string;
  groupId: PlannerTask["group"];
  tasks: PlannerTask[];
  containerSpec: ContainerSpec;
  compact?: boolean;
  variant?: "bank" | "calendar";
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: (groupId: PlannerTask["group"]) => void;
  onCreateTask?: (groupId: PlannerTask["group"]) => void;
  onMoveTask: (taskId: string, containerSpec: ContainerSpec, targetIndex: number) => void;
  onToggleTaskProgressStatus: (taskId: string, nextProgressStatus: TaskProgressStatus) => void;
  onOpenTask: (task: PlannerTask) => void;
}

function getGroupMeta(groupId: PlannerTask["group"]) {
  return TASK_GROUPS.find((group) => group.id === groupId) || TASK_GROUPS[TASK_GROUPS.length - 1];
}

export function TaskGroupSection({
  title,
  groupId,
  tasks,
  containerSpec,
  compact = false,
  variant = "bank",
  collapsible = false,
  collapsed = false,
  onToggleCollapsed,
  onCreateTask,
  onMoveTask,
  onToggleTaskProgressStatus,
  onOpenTask,
}: TaskGroupSectionProps) {
  const groupMeta = getGroupMeta(groupId);
  const containerId = getContainerId(containerSpec);
  const ref = useRef<HTMLDivElement | null>(null);
  const isAnyDragging = useDragLayer((monitor) => monitor.isDragging());

  const [{ isOver, canDrop }, drop] = useDrop<DragTaskItem, { handled: true } | undefined, { isOver: boolean; canDrop: boolean }>(
    () => ({
      accept: TASK_ITEM_TYPE,
      drop: (item, monitor) => {
        if (monitor.didDrop()) {
          return undefined;
        }

        onMoveTask(item.taskId, containerSpec, tasks.length);
        item.containerId = containerId;
        item.index = tasks.length;
        return { handled: true };
      },
      collect: (monitor) => ({
        isOver: monitor.isOver({ shallow: true }),
        canDrop: monitor.canDrop(),
      }),
    }),
    [containerId, containerSpec, onMoveTask, tasks.length],
  );

  drop(ref);

  if (variant === "calendar" && tasks.length === 0) {
    return null;
  }

  const showContent = !collapsed;
  const showCollapsedDropzone = collapsed && isAnyDragging && variant === "bank";

  return (
    <div
      ref={ref}
      className={cn(
        "border bg-white/80 transition-all",
        groupMeta.borderClass,
        compact ? "p-1.5" : "p-3",
        variant === "calendar" ? "rounded-xl bg-white/70" : "rounded-2xl",
        isOver && canDrop && "border-primary bg-primary/8 shadow-[0_0_0_1px_rgba(13,148,136,0.3)]",
      )}
    >
      <div className={cn("flex items-center justify-between gap-2", showContent || showCollapsedDropzone ? "mb-2" : "mb-0")}>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "font-medium",
              groupMeta.badgeClass,
              compact ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]",
            )}
          >
            {title}
          </Badge>
          {variant === "bank" ? (
            <button
              type="button"
              onClick={() => onCreateTask?.(groupId)}
              className="inline-flex size-6 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
              aria-label={`Создать задачу в группе ${title}`}
              title={`Создать задачу в группе ${title}`}
            >
              <Plus className="size-3.5" />
            </button>
          ) : null}
          {collapsible ? (
            <button
              type="button"
              onClick={() => onToggleCollapsed?.(groupId)}
              className="inline-flex size-6 items-center justify-center rounded-full border border-slate-200 bg-white/80 text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
              aria-label={collapsed ? `Развернуть группу ${title}` : `Свернуть группу ${title}`}
              aria-expanded={!collapsed}
            >
              <ChevronDown className={cn("size-3.5 transition-transform", collapsed && "-rotate-90")} />
            </button>
          ) : null}
        </div>
        <span className="text-[10px] text-slate-500">{tasks.length}</span>
      </div>
      {showContent ? (
      <div className={cn("pr-0.5", variant === "calendar" ? "space-y-1" : "space-y-2")}>
        {tasks.length === 0 ? (
          <div
            className={cn(
              "rounded-xl border border-dashed border-slate-200/90 bg-slate-50/85 text-slate-400",
              variant === "calendar"
                ? "flex h-10 items-center justify-center px-3 text-[10px] font-medium"
                : compact
                  ? "px-2 py-1 text-[9px]"
                  : "px-3 py-2 text-xs",
            )}
          >
            {variant === "calendar" ? "Перетащить сюда" : "Перетащите задачу сюда"}
          </div>
        ) : (
          tasks.map((task, index) => (
            <TaskCard
              key={task.id}
              task={task}
              index={index}
              containerSpec={containerSpec}
              compact={compact}
              variant={variant}
              onMoveTask={onMoveTask}
              onToggleTaskProgressStatus={onToggleTaskProgressStatus}
              onOpenTask={onOpenTask}
            />
          ))
        )}
      </div>
      ) : null}
      {showCollapsedDropzone ? (
        <div className="rounded-xl border border-dashed border-slate-200/90 bg-slate-50/85 px-3 py-2 text-xs text-slate-400">
          Перетащите задачу сюда
        </div>
      ) : null}
    </div>
  );
}

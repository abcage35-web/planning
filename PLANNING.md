# Planning Overview

## Product

`Planning` is a standalone monthly planner for distributing task cards between a task bank and personal calendars.

The interface is focused on quick scheduling:

- create a task once
- assign one or several executors
- place the task into the bank or directly into calendars
- move tasks between dates and groups with drag-and-drop

## Main Screens

- task bank on the left
- personal calendars stacked vertically
- task settings dialog for create and edit

## Persistence Strategy

The planner stores the latest state and an append-only operation log:

- `storage/planner-state.json`
- `storage/planner-state-log.ndjson`

This keeps the latest planner state available after refresh, browser restart, or local server restart.

## Key Rules

- a task can be saved with only a title
- default placement is the task bank
- if assignees and date are set, the task is placed on all selected calendars
- empty group targets inside calendar days appear as an overlay during drag

## Main Source Files

- `src/app/pages/PlannerPage.tsx`
- `src/app/planner/CalendarDayCell.tsx`
- `src/app/planner/TaskGroupSection.tsx`
- `src/app/planner/TaskCard.tsx`
- `functions/api/planner-state.js`

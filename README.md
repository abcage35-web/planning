# Planning

`Planning` is a standalone task planner with a task bank, three personal calendars for the current month, and drag-and-drop scheduling.

The repository is no longer described as `mp_cards` or `Media Plan`. The current product is the planner available at `/planner/`.

## What The App Does

- shows three monthly calendars for `Саша Некрасов`, `Саша Манохин`, and `Антон Бобер`
- keeps a task bank with grouped task cards
- supports drag-and-drop between the bank and calendars
- allows task ordering inside groups
- supports multi-assignee placement for the same task
- persists state to local files so data survives reloads and local server restarts

## Task Model

Each task can contain:

- title
- hours
- description
- link
- group
- one or more assignees
- date

Available groups:

- Плановые задачи
- Новые задачи
- Проектные задачи
- Созвоны
- Не определено

## Stack

- React 18
- TypeScript
- Vite 6
- Tailwind CSS v4
- `react-dnd` for drag-and-drop
- local file persistence through `functions/api/planner-state.js`

## Local Run

```bash
npm install
npm run dev
```

Open:

- `http://127.0.0.1:5173/planner/`

## Persistence

Planner data is stored in:

- `storage/planner-state.json`
- `storage/planner-state-log.ndjson`

These files are created and updated automatically while the local dev server is running.

## Important Paths

- `planner/index.html` — standalone planner entry
- `src/planner-main.tsx` — standalone planner bootstrap
- `src/app/pages/PlannerPage.tsx` — main planner page
- `src/app/planner/*` — planner UI and drag-and-drop logic
- `functions/api/planner-state.js` — file persistence API

## Publish To GitHub

This repo includes helper scripts for publishing to `abcage35-web/planning`:

- `npm run publish:planning`
- `npm run autopublish:planning:start`
- `npm run autopublish:planning:stop`

## Note About GitHub Description

The text shown in the GitHub `About` block is separate from `README.md`. If that description still says `mp_cards`, it must be changed in the repository settings on GitHub.

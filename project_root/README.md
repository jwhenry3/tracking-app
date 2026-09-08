# Synchrosity

**Align Your Home, Align Your Life**

Shared workspace app for families and groups to track finances, calendar events, todos, notes, and daily planning together.

## Stack

| Layer | Tech |
| --- | --- |
| Backend | Go, Gin, JWT, Gorilla WebSocket, MySQL |
| Frontend | React, Vite, TypeScript, Zustand, shadcn/ui, Tailwind CSS |

## Features

- **Workspaces** — shared spaces for a family, group, or household
- **Calendar** — month view with shared events
- **Planner** — daily, weekly, and monthly planning views
- **Finances** — income, bills, and expense tracking with summary totals
- **Todos & notes** — daily todo lists, general lists, and linked notes
- **Realtime sync** — WebSocket updates per workspace

## Layout

The UI follows a Slack/Discord-style shell:

1. **Far left rail** — switch between workspaces
2. **Navigation sidebar** — calendar, planner, finances, todos
3. **Main content** — calendar grid, planner cards, finance dashboards, todo boards

## Quick start

```bash
npm run install:all
npm run dev
```

Backend uses Air for live reload. Frontend runs on `http://localhost:5173`.

## Database

Set `DB_NAME=tracking_app` in `backend/.env`. Tables are created automatically on startup.

To create the database manually:

```bash
mysql -u root -p < backend/schema.sql
```

### Seed demo data

```bash
npm run seed:db
```

This is idempotent — it skips if the `demo` user already exists.

| Account | Password | Role |
| --- | --- | --- |
| `demo` | `password123` | Workspace owner |
| `partner` | `password123` | Workspace member |

Seeded workspace: **Demo Family** with sample events, income, bills, expenses, todos, and notes.

## API overview

| Area | Endpoints |
| --- | --- |
| Auth | `POST /api/register`, `POST /api/login`, `GET /api/me` |
| Workspaces | `GET/POST /api/workspaces`, `GET /api/workspaces/:id`, `POST /api/workspaces/:id/members` |
| Events | `GET/POST /api/workspaces/:id/events` |
| Finances | `/finance/income`, `/finance/bills`, `/finance/expenses`, `/finance/summary` |
| Todos | `/todo-lists`, `/todos`, `/notes` |
| Realtime | `GET /ws?token=...&workspace_id=...` |

## Sharing a workspace

Use **Add workspace** to create another space, or invite someone by username via:

`POST /api/workspaces/:workspaceId/members`

```json
{ "username": "partner" }
```

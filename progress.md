# Progress

## Phase 0 — Scaffolding (done)

**Backend** (`backend/`):
- FastAPI app skeleton (`app/main.py`, `app/config.py`), sync SQLAlchemy 2.0 session
  (`app/db/session.py`), matching the `chineseappdemo` house convention.
- Alembic wired up (`alembic/`, `alembic.ini`) — `target_metadata` pulls from both
  `app.restaurant.models` and `app.agents.models`. Initial migration
  (`alembic/versions/efd4e0aab222_initial_schema.py`) creates all 10 tables; `main.py`
  no longer calls `create_all` — schema is Alembic's job now (`alembic upgrade head`).
- `/health` endpoint verified.

**Frontend** (`frontend/`):
- Vite + React 19 + TypeScript skeleton, mirroring `chineseappdemo/frontend`'s tooling
  (no framework beyond React, plain CSS, `VITE_API_BASE` env var).
- `src/api/client.ts` — typed fetch wrapper; `App.tsx` does a live health check + fetches
  the agent roster from the backend as a connectivity smoke test.
- Verified: `npx tsc -b` type-checks clean, `npm run dev` serves on :5173, backend CORS
  confirmed to allow it.

## Phase 1 — Agent control plane MVP (built ahead of Phase 0, since done)

Built before Phase 0 was fully wired up (Alembic/frontend came after, retroactively):
- Restaurant domain models + CRUD REST API (menu, orders, inventory, suppliers, staff, shifts).
- Agent platform models: `AgentDefinition`, `AgentRun` (with `parent_run_id` for the run
  tree), `AgentEvent`, `AgentAction` (approval queue).
- Real Boss + 5 subagent orchestration via the Anthropic `tool_runner`/`@beta_tool` API
  (`app/agents/runner.py`, `orchestrator.py`, `registry.py`, `tools/*.py`). Boss delegates
  via `delegate_to_*` tools that recursively run a subagent to completion and return its
  summary.
- Seed script (`scripts/seed_data.py`) with sample data + all 6 agent definitions.
- Verified end-to-end including the failure path (no `ANTHROPIC_API_KEY` in this sandbox
  correctly produces a `failed` run with a persisted error, not a crash).

**Known simplifications vs. the full plan** (`PLAN.txt`): no WebSocket live streaming yet
(poll `GET /agents/runs/{id}`), no APScheduler cron wiring, and a pending `AgentAction`
doesn't literally pause its run — the run finishes normally and the proposal just sits in
the approvals queue. Frontend has no agent-specific pages yet (Agents list, run detail,
approvals inbox) beyond the Phase 0 connectivity check.

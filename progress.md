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

## Phase 2 — Change tracking (done)

Approving an `AgentAction` used to flip a status column and stop: the reorder never
restocked anything, the shift never reached the schedule. Three pieces, in dependency
order, since an audit trail over changes that never happen is worth nothing.

**1. Appliers** (`app/agents/appliers.py`): `action_type` -> handler, covering all four
proposal types (`inventory_reorder`, `purchase_order`, `shift_change`, `menu_change`).
Appliers never commit; `POST /agents/actions/{id}/approve` owns one transaction covering
the domain mutation, the status flip and the audit rows, so a failure can't leave an
action marked approved whose effect never landed. A proposal that can't be carried out
returns 422 and stays pending rather than silently no-op'ing.

**2. `change_log` table** (`app/audit/models.py`, migration `a649971e1021`): one row per
mutation — entity, operation, before/after, changed fields, actor, and the agent run and
action it traces back to. No foreign keys: an audit row has to outlive what it describes.
`agent_actions` also gained `applied_result`, recording what an approval actually did.

**3. Automatic capture** (`app/audit/listener.py`): a session-level listener, not
hand-placed log calls, so a change is recorded whichever path made it. Updates and deletes
are captured on `before_flush` (the only point where the prior value is still knowable)
and inserts on `after_flush` (the only point where a new row knows its primary key).
Attribution rides in a ContextVar set by `AuditActorMiddleware` for HTTP callers and by
`runner.py` for agent runs — so an operator approving a proposal records as a human actor
against the agent run that proposed it.

29 tests in `backend/tests/` (`pytest`), covering capture, attribution, appliers,
transaction rollback, and the migration up and down.

**Known gaps**: `X-Actor-Id` is a stand-in until real auth exists — anyone can claim any
identity. Approving a reorder books the goods as received immediately, since there is no
purchase-order lifecycle in the schema. `promotion` menu changes can't be applied at all
(no promotion model). Read endpoints for the history, and revert, are not built yet.

## Phase 3 — History API and revert (done)

**Read API** (`app/audit/routes.py`, `crud.py`, `schemas.py`):
- `GET /api/v1/changes` — newest first, paginated (`limit`/`offset`, `total` is unpaginated).
  Filters: `entity_type`, `entity_id`, `operation`, `actor_type`, `actor_id`, `agent_run_id`,
  `agent_action_id`, `since`, `until`. Filtering by `agent_run_id` answers "what did this
  agent run actually change", across every table it touched.
- `GET /api/v1/changes/entity/{entity_type}/{entity_id}` — one record's timeline, oldest first.
- `GET /api/v1/changes/{id}` — a single change.

**Revert** (`app/audit/revert.py`): `POST /api/v1/changes/{id}/revert` applies the inverse —
insert becomes a delete, update restores the `before` values, delete re-creates the row with
its original key. Three things worth knowing:

- A revert is *appended*, never a rewrite. It replays as an ordinary mutation, so the
  listener records it as its own change and the timeline shows both the original and the undo.
  `change_log.note` (previously always null) now carries "Revert of change N" or a caller's
  own reason, via a `note_context` alongside the actor context.
- It refuses (409) when the entity has changed since the recorded change, rather than
  silently discarding newer edits. `force: true` overrides. This also makes a double revert
  fail rather than thrash.
- Values are coerced back on the way out: the log stores dates and times as ISO strings, so
  restoring a `Shift` writes real `date`/`time` objects, not their string forms.

**Also fixed**: SQLite ignores foreign keys unless asked per connection, and this app never
asked — deleting a menu item silently orphaned the order lines recording its sales. Reverting
an insert deletes rows, so `app/db/session.py` now sets `PRAGMA foreign_keys=ON` and a revert
that would break a reference returns 409 instead of quietly corrupting history. This is an
app-wide behaviour change: writes that previously succeeded against a dangling foreign key
now fail loudly.

51 tests (`cd backend && pytest`).

**Still open**: no auth, so `X-Actor-Id` remains self-asserted. Revert lineage is recorded in
the free-text note rather than a `reverted_by_change_id` column, so "has this been reverted"
is not directly queryable. No UI for any of it — the frontend's ActionCenter still only
approves and rejects.

## Phase 4 — Pluggable model backend (Ollama) (done)

Agents can now run on a local Ollama model instead of the Anthropic API, switched by one
env var. `LLM_PROVIDER=ollama` repoints the whole platform.

**No tool changes were needed.** `@beta_tool` objects already expose `name`, `description`,
a real JSON Schema in `input_schema`, and `call(dict)` — exactly what any tool-calling API
wants — so the five tool modules and `orchestrator.py` are untouched. Only the loop that
drives them moved.

- `app/agents/providers/base.py` — `LLMProvider` interface, `ProviderResult`,
  and `to_function_schema()` which renders a `@beta_tool` as an OpenAI-style declaration.
- `anthropic_provider.py` — the original `tool_runner` path, unchanged in behaviour.
- `ollama_provider.py` — Ollama has no agentic helper, so the loop lives here: call
  `/api/chat`, execute the tools it asks for, feed results back as `role: tool` messages,
  repeat until it answers without calling one. Handles arguments arriving as either an
  object (Ollama) or a JSON string (OpenAI-compatible paths), truncates tool output so a
  big result can't blow a small model's context, and caps rounds so a model that loops on
  one call fails loudly rather than forever.
- `runner.py` now asks `get_provider()` for a backend and emits a `log` event naming the
  provider and model actually used.

`AgentRun.tokens_used` was another declared-but-never-written column; providers now report
usage and it is populated.

**Verified against a live local model** (`qwen2.5:7b`): a subagent run listed low stock and
queued a real reorder proposal (2119 tokens), and a Boss run delegated to the inventory
subagent and relayed its summary, queuing 3 proposals. Delegation works unchanged because
the delegate tools are `@beta_tool`s like any other.

73 tests (`cd backend && pytest`), including the Ollama loop exercised over real HTTP
against a stub server, and the Anthropic adapter against a stubbed SDK client.

**Known gaps**: the model must support tool calling (`ollama show <model>` must list
"tools") — one that doesn't will silently just talk instead of acting. `OLLAMA_MODEL`
applies to every agent, ignoring each `AgentDefinition.model`, since those are seeded with
Claude ids. Small models are noticeably worse at multi-step delegation than Opus.

## Phase 5 — Employee management page (done)

**Backend.** "Manage" needs more than the create-only API had: staff and shifts could be
added but never corrected or removed. Added `PATCH`/`DELETE` for both
(`app/restaurant/routes.py`), with `StaffUpdate`/`ShiftUpdate` partial-update schemas so a
caller sends only what changed. Deleting someone who still has shifts returns 409 naming the
count, rather than letting the enforced foreign key raise something opaque. Every edit and
removal flows through the change log like anything else, so a deleted shift is revertible.

**Frontend.** New `EmployeesPage.tsx` reachable at `#employees` (sidebar → Restaurant → Team):
- Roster with inline editing, add, and remove. Shows each person's shift count, flagging
  anyone with none in coral — the coverage gap the agent watches for.
- Schedule grouped by day, with add and remove.
- A banner when the Employee Management agent has scheduling proposals pending, linking to
  the action center.

Routing is a 20-line `useHashRoute` hook rather than a router dependency — the sidebar
already navigated by `#anchor`, and the app's house style is "no framework beyond React".
Unknown hashes fall through to the dashboard, so the existing `#tasks`/`#agents` anchors
still scroll as before. Sidebar highlighting now follows the route.

84 backend tests; frontend builds clean (31 modules).

**Known gaps**: no auth still, so anyone can edit the roster. Shift editing is remove-and-re-add
in the UI (the `PATCH /shifts/{id}` endpoint exists and is tested, but nothing calls it yet).
No week/calendar view — shifts are a flat list grouped by date.

## Phase 6 — Marketing / Product page (done)

The marketing agent "analyzes top/slow sellers and proposes promotions or menu changes", but
the frontend had no way to see sales per dish and no way to edit the menu — the API was
create-only and exposed no per-item sales figures at all.

**Backend.**
- `GET /api/v1/restaurant/menu-performance` — per dish: units sold, revenue, unit margin,
  margin %, and gross profit contributed. Aggregated in SQL (`crud.menu_performance`) rather
  than by walking every order line in Python the way `top_selling_items` does. Counts
  completed orders only.
- `PATCH /menu-items/{id}` — price, cost, description, category, availability, with
  non-negative validation.
- `DELETE /menu-items/{id}` — allowed only for a dish that has never sold. Once it appears on
  an order its row is part of the sales history the profit and marketing agents read, so the
  endpoint returns 409 naming the order-line count and points at `is_available` instead.

**Frontend.** `MarketingPage.tsx` at `#marketing` (sidebar → Restaurant → Menu):
- Menu table sortable by units, profit, or margin, with a margin bar per dish and a hairline
  under each row showing its share of the best seller's volume.
- Inline price/description editing, an availability toggle, add-a-dish, and delete offered
  only where it is legal (never-sold items).
- "Promotion candidates" callout listing dishes selling at or below a quarter of the best
  seller — the slow movers the agent proposes promotions for.
- Banner when the agent has `menu_change` proposals pending.

95 backend tests; frontend builds clean (32 modules).

**Known gaps**: margins still use the hand-entered `cost` field, so they are only as good as
that number — the recipe/BOM gap means nothing ties a dish to the ingredients it consumes.
No revenue-over-time view; figures are lifetime totals. Category is editable on create but
not in the inline editor.

## Phase 7 — Profit monitor page (done)

**Backend.** `GET /api/v1/restaurant/profit-summary?days=N` (1–365, default 30) — revenue,
cost of goods, gross profit and margin over a trailing window, plus average order value,
capital tied up in stock, a continuous daily series, and breakdowns by menu category and
order channel. COGS comes from each line's menu-item cost.

Found and fixed a real bug while building it: the daily series bucketed by `date.today()`
(local) while `created_at` is stored in UTC, so the current day's orders counted in the
headline total but had no slot in the series — $360 revenue against a chart summing $288.
Now UTC throughout, with a test asserting the daily rows reconcile to the headline.

**Frontend.** `ProfitPage.tsx` at `#profit` (sidebar → Restaurant → Profit):
- Five stat tiles, gross profit as the hero.
- Daily revenue vs gross profit as a two-series line chart on one axis (both are dollars —
  never a second y-scale), with a hover crosshair and tooltip, endpoint-only direct labels,
  and a Chart/Table toggle so the numbers are reachable without reading the plot.
- Category contribution as horizontal bars, one hue (bar length already encodes magnitude;
  a value-ramp would double-encode it).
- 7/30/90-day window selector.

Chart colors are **not** the app's `--green`/`--coral`: that pair collapses under protanopia
(adjacent CVD ΔE 5.6) and `--green` is below the chroma floor, so it reads gray as a thin
mark. `#1f6f9e`/`#d2652b` validates clean — protan ΔE 18.2, normal 28.0, both ≥3:1 on white.

The channel panel renders a sentence rather than a chart while only one channel exists; a
one-bar bar chart is not a chart.

105 backend tests; frontend builds clean (33 modules).

**Known gaps**: gross profit is only as good as the hand-entered `cost` per dish — the
recipe/BOM gap again, now stated on the page itself. No labour costs, so this is gross not
net. The dashboard's "Tonight's forecast" panel is still hardcoded demo numbers (it is
labelled "Illustrative") and is not wired to this data.

## Phase 8 — Supply chain page (done)

**Backend.**
- `GET /api/v1/restaurant/supply-chain` — stock value grouped by supplier with each one's
  share (concentration risk), item and low-stock counts, lead times, plus a shortfall list
  ordered worst-lead-time-first. "Restock cost" prices each shortfall's `reorder_qty` at unit
  cost — what placing the order costs, not what is already on the shelf.
- `PATCH`/`DELETE /suppliers/{id}` — edit name, contact and lead time; delete refused (409)
  while items still reference the supplier.
- `PATCH /inventory-items/{id}` — reassign supplier, correct thresholds, adjust stock. All
  negative values rejected, all changes audited.

Items with no supplier are reported separately rather than folded into a total, and their
lead time is `null`, not `0` — there is no schedule to plan against, and a zero would read
as "arrives today".

**Frontend.** `SupplyChainPage.tsx` at `#supply` (sidebar → Restaurant → Suppliers):
- Four stat tiles: stock value, items needing reorder, cost to clear every shortfall,
  longest lead time on what is short.
- Supplier table with share-of-value bars, lead times, inline editing, and add/remove.
- "Needs reordering" list with supplier and lead time per item, and an inline supplier
  picker for anything unsourced.
- Callouts for concentration risk (one supplier above 60% of stock value) and unsourced
  items. Banner for pending `purchase_order` proposals.

The seeded data makes the concentration callout real: Sysco Foods holds 91.1% of stock value.

119 backend tests; frontend builds clean (34 modules).

**Known gaps**: no purchase-order lifecycle, so lead times are reference information rather
than a delivery schedule — approving a reorder still books goods as received immediately.
No consumption rate either (the recipe/BOM gap), so "days of cover" cannot be computed and
is deliberately not shown.

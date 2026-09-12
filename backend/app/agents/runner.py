from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.agents import crud as agent_crud
from app.agents.providers import get_provider
from app.agents.registry import resolve_tools
from app.audit.context import AGENT, Actor, actor_context
from app.db.session import SessionLocal


def _now() -> datetime:
    return datetime.now(timezone.utc)


def execute_run(run_id: str, db: Session | None = None) -> str:
    """Drive one agent run to completion via the configured LLM provider.

    Pass `db` when calling from within another run's own tool execution
    (delegation) so parent and child share one session/transaction; leave
    it unset for a top-level run triggered from the API, which opens and
    owns its own session."""
    owns_session = db is None
    if db is None:
        db = SessionLocal()
    run = None
    run_actor = None
    try:
        run = agent_crud.get_run(db, run_id)
        if run is None:
            raise ValueError(f"No agent run with id {run_id}")
        defn = agent_crud.get_definition(db, run.agent_definition_id)
        if defn is None:
            raise ValueError(f"No agent definition with id {run.agent_definition_id}")

        # Everything this run touches is attributed to the agent. Nesting is
        # correct for delegation: a subagent's context unwinds back to the
        # Boss's when its run returns.
        run_actor = Actor(type=AGENT, id=defn.key, agent_run_id=run.id)
        with actor_context(run_actor):
            agent_crud.set_run_status(db, run, "running", started_at=_now())
            agent_crud.add_event(db, run.id, "status_change", {"status": "running"})

            tools = resolve_tools(db, run, defn)
            provider = get_provider()
            model = provider.resolve_model(defn.model)
            agent_crud.add_event(
                db, run.id, "log", {"text": f"Running on {provider.key} model {model}"}
            )

            result = provider.run_agent_loop(
                model=model,
                system=defn.system_prompt,
                tools=tools,
                user_message=run.input or "Run now.",
                emit=lambda event_type, payload: agent_crud.add_event(db, run.id, event_type, payload),
            )

            output_summary = result.text
            agent_crud.set_run_status(
                db,
                run,
                "succeeded",
                output_summary=output_summary,
                tokens_used=result.tokens_used,
                finished_at=_now(),
            )
            agent_crud.add_event(db, run.id, "status_change", {"status": "succeeded"})
            return output_summary
    except Exception as exc:
        if run is not None:
            with actor_context(run_actor or Actor(type=AGENT, agent_run_id=run.id)):
                agent_crud.set_run_status(db, run, "failed", error=str(exc), finished_at=_now())
                agent_crud.add_event(db, run.id, "status_change", {"status": "failed", "error": str(exc)})
        raise
    finally:
        if owns_session:
            db.close()

from datetime import datetime, timezone

import anthropic
from sqlalchemy.orm import Session

from app.agents import crud as agent_crud
from app.agents.registry import resolve_tools
from app.config import settings
from app.db.session import SessionLocal


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _extract_text(message) -> str:
    if message is None:
        return ""
    return "\n".join(block.text for block in message.content if block.type == "text" and block.text)


def execute_run(run_id: str, db: Session | None = None) -> str:
    """Drive one agent run to completion via the Anthropic tool runner.

    Pass `db` when calling from within another run's own tool execution
    (delegation) so parent and child share one session/transaction; leave
    it unset for a top-level run triggered from the API, which opens and
    owns its own session."""
    owns_session = db is None
    if db is None:
        db = SessionLocal()
    run = None
    try:
        run = agent_crud.get_run(db, run_id)
        if run is None:
            raise ValueError(f"No agent run with id {run_id}")
        defn = agent_crud.get_definition(db, run.agent_definition_id)
        if defn is None:
            raise ValueError(f"No agent definition with id {run.agent_definition_id}")

        agent_crud.set_run_status(db, run, "running", started_at=_now())
        agent_crud.add_event(db, run.id, "status_change", {"status": "running"})

        tools = resolve_tools(db, run, defn)
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        tool_runner = client.beta.messages.tool_runner(
            model=defn.model,
            max_tokens=16000,
            system=defn.system_prompt,
            tools=tools,
            messages=[{"role": "user", "content": run.input or "Run now."}],
        )

        last_message = None
        for message in tool_runner:
            last_message = message
            for block in message.content:
                if block.type == "text" and block.text:
                    agent_crud.add_event(db, run.id, "log", {"text": block.text})
                elif block.type == "tool_use":
                    agent_crud.add_event(db, run.id, "tool_call", {"tool": block.name, "input": block.input})

        output_summary = _extract_text(last_message)
        agent_crud.set_run_status(db, run, "succeeded", output_summary=output_summary, finished_at=_now())
        agent_crud.add_event(db, run.id, "status_change", {"status": "succeeded"})
        return output_summary
    except Exception as exc:
        if run is not None:
            agent_crud.set_run_status(db, run, "failed", error=str(exc), finished_at=_now())
            agent_crud.add_event(db, run.id, "status_change", {"status": "failed", "error": str(exc)})
        raise
    finally:
        if owns_session:
            db.close()

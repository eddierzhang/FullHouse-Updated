from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.agents import crud, schemas
from app.agents.appliers import ApplyError, apply_action, is_appliable, missing_inputs
from app.agents.runner import execute_run
from app.audit.context import Actor, actor_context, get_actor
from app.db.session import get_db

router = APIRouter(prefix="/api/v1/agents", tags=["agents"])


@router.get("/definitions", response_model=list[schemas.AgentDefinitionOut])
def list_definitions(db: Session = Depends(get_db)):
    return crud.list_definitions(db)


@router.post("/runs", response_model=schemas.AgentRunOut)
def trigger_run(payload: schemas.TriggerRunRequest, db: Session = Depends(get_db)):
    """Trigger an agent run and execute it to completion before responding.
    This blocks for the duration of the run (including any delegated
    subagent runs) - acceptable for a basic/demo backend; a later phase can
    move this to a background task with the run polled or streamed."""
    defn = crud.get_definition_by_key(db, payload.agent_key)
    if defn is None:
        raise HTTPException(404, f"No agent with key '{payload.agent_key}'")
    if not defn.enabled:
        raise HTTPException(400, f"Agent '{defn.key}' is disabled")

    run = crud.create_run(db, defn.id, trigger_type="manual", input=payload.input)
    try:
        execute_run(run.id, db=db)
    except Exception as exc:
        raise HTTPException(500, f"Agent run failed: {exc}") from exc
    db.refresh(run)
    return run


@router.get("/runs", response_model=list[schemas.AgentRunOut])
def list_runs(agent_key: str | None = None, db: Session = Depends(get_db)):
    agent_definition_id = None
    if agent_key:
        defn = crud.get_definition_by_key(db, agent_key)
        if defn is None:
            raise HTTPException(404, f"No agent with key '{agent_key}'")
        agent_definition_id = defn.id
    return crud.list_runs(db, agent_definition_id=agent_definition_id)


@router.get("/runs/{run_id}", response_model=schemas.AgentRunDetailOut)
def get_run(run_id: str, db: Session = Depends(get_db)):
    run = crud.get_run(db, run_id)
    if run is None:
        raise HTTPException(404, "Run not found")
    events = crud.list_events(db, run_id)
    child_run_ids = [r.id for r in run.child_runs]
    return schemas.AgentRunDetailOut(
        **schemas.AgentRunOut.model_validate(run).model_dump(),
        events=[schemas.AgentEventOut.model_validate(e) for e in events],
        child_run_ids=child_run_ids,
    )


def _as_out(action) -> schemas.AgentActionOut:
    out = schemas.AgentActionOut.model_validate(action)
    out.appliable = is_appliable(action)
    out.needs_input = missing_inputs(action)
    return out


@router.get("/actions", response_model=list[schemas.AgentActionOut])
def list_actions(status: str | None = None, db: Session = Depends(get_db)):
    return [_as_out(a) for a in crud.list_actions(db, status=status)]


@router.post("/actions/{action_id}/approve", response_model=schemas.AgentActionOut)
def approve_action(
    action_id: str,
    payload: schemas.ApproveRequest | None = None,
    db: Session = Depends(get_db),
):
    """Approve a proposal and carry out its effect.

    The applier, the status change and the audit rows commit together.
    If the effect cannot be applied the whole thing rolls back and the
    action stays pending, so it can be re-approved once the underlying
    problem is fixed.
    """
    action = crud.get_action(db, action_id)
    if action is None:
        raise HTTPException(404, "Action not found")
    if action.status != "pending":
        raise HTTPException(400, f"Action already {action.status}")

    # Merge and persist the operator's values, so the record shows what was
    # actually approved rather than the incomplete proposal.
    overrides = (payload.overrides if payload else None) or {}
    if overrides:
        action.payload = {**(action.payload or {}), **overrides}

    # The operator is the actor, but the change still traces back to the
    # agent run that proposed it -- the change log records both.
    approver = get_actor()
    attribution = Actor(
        type=approver.type,
        id=approver.id,
        agent_run_id=action.run_id,
        agent_action_id=action.id,
    )

    try:
        with actor_context(attribution):
            result = apply_action(db, action)
            crud.mark_action_decided(db, action, "approved", applied_result=result)
            db.commit()
    except ApplyError as exc:
        db.rollback()
        raise HTTPException(422, f"Cannot apply this action: {exc}") from exc
    except Exception:
        db.rollback()
        raise

    db.refresh(action)
    return _as_out(action)


@router.post("/actions/{action_id}/reject", response_model=schemas.AgentActionOut)
def reject_action(action_id: str, db: Session = Depends(get_db)):
    action = crud.get_action(db, action_id)
    if action is None:
        raise HTTPException(404, "Action not found")
    if action.status != "pending":
        raise HTTPException(400, f"Action already {action.status}")
    crud.mark_action_decided(db, action, "rejected")
    db.commit()
    db.refresh(action)
    return _as_out(action)

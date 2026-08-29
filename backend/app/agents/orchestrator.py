from anthropic import beta_tool
from sqlalchemy.orm import Session

from app.agents import crud as agent_crud
from app.agents.models import AgentDefinition, AgentRun


def build_delegate_tools(db: Session, boss_run: AgentRun, boss_defn: AgentDefinition) -> list:
    """Build one delegate_to_<key> tool per subagent key in the Boss's
    tool_allowlist. Calling one creates a child AgentRun (linked via
    parent_run_id) and runs it to completion synchronously, returning its
    output_summary as the tool result."""
    from app.agents.runner import execute_run  # local import: runner imports registry, which imports this module

    tools = []
    for subagent_key in boss_defn.tool_allowlist:
        subagent_defn = agent_crud.get_definition_by_key(db, subagent_key)
        if subagent_defn is None:
            continue

        def make_tool(defn: AgentDefinition = subagent_defn):
            @beta_tool(
                name=f"delegate_to_{defn.key}",
                description=f"Delegate a task to the {defn.name} subagent ({defn.description}) and return its result.",
            )
            def delegate(task: str) -> str:
                """
                Args:
                    task: A clear description of what to ask this subagent to do or report on.
                """
                child_run = agent_crud.create_run(
                    db,
                    defn.id,
                    parent_run_id=boss_run.id,
                    depth=boss_run.depth + 1,
                    trigger_type="delegated",
                    input=task,
                )
                agent_crud.add_event(
                    db,
                    boss_run.id,
                    "delegation",
                    {"child_run_id": child_run.id, "agent_key": defn.key, "agent_name": defn.name, "task": task},
                )
                try:
                    return execute_run(child_run.id, db=db)
                except Exception as exc:  # noqa: BLE001 - report the failure back to the Boss's own loop
                    return f"Error: {defn.name} run failed: {exc}"

            return delegate

        tools.append(make_tool())
    return tools

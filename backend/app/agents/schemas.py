from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AgentDefinitionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    key: str
    name: str
    description: str
    role: str
    model: str
    tool_allowlist: list
    schedule_cron: str | None
    enabled: bool


class AgentEventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    run_id: str
    seq: int
    ts: datetime
    type: str
    payload: dict


class AgentRunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    agent_definition_id: str
    parent_run_id: str | None
    depth: int
    status: str
    trigger_type: str
    input: str | None
    output_summary: str | None
    error: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime


class AgentRunDetailOut(AgentRunOut):
    events: list[AgentEventOut]
    child_run_ids: list[str]


class TriggerRunRequest(BaseModel):
    agent_key: str
    input: str | None = None


class AgentActionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    run_id: str
    agent_definition_id: str
    action_type: str
    payload: dict
    status: str
    created_at: datetime
    decided_at: datetime | None

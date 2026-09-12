"""Provider-agnostic agent loop.

The platform's tools are declared with Anthropic's `@beta_tool`, which
is convenient but not Anthropic-specific in what it exposes: every tool
object carries a `name`, a `description`, a real JSON Schema in
`input_schema`, and a `call(dict)` entry point. That is exactly the
shape every tool-calling API wants, so the tool modules need no changes
to run against a different backend -- only the loop that drives them
does.
"""

from abc import ABC, abstractmethod
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from typing import Any

#: Records a run event: (event_type, payload). Types match AgentEvent.type --
#: "log", "tool_call", "tool_result".
EventEmitter = Callable[[str, dict], None]


class ProviderError(RuntimeError):
    """The model backend could not complete the run."""


@dataclass
class ProviderResult:
    text: str
    tokens_used: int | None = None


def to_function_schema(tool: Any) -> dict:
    """Render a `@beta_tool` as an OpenAI-style function declaration.

    Ollama, and everything else modelled on the OpenAI schema, expects
    `{"type": "function", "function": {name, description, parameters}}`
    where `parameters` is the JSON Schema for the arguments.
    """
    return {
        "type": "function",
        "function": {
            "name": tool.name,
            "description": tool.description or "",
            "parameters": tool.input_schema,
        },
    }


class LLMProvider(ABC):
    """Drives one agent run to completion against a model backend."""

    key: str

    @abstractmethod
    def resolve_model(self, configured_model: str) -> str:
        """The model to actually call.

        An `AgentDefinition` stores a model name chosen for one backend;
        pointed at another, that name is meaningless, so each provider
        decides what it can honour.
        """

    @abstractmethod
    def run_agent_loop(
        self,
        *,
        model: str,
        system: str,
        tools: Sequence[Any],
        user_message: str,
        emit: EventEmitter,
    ) -> ProviderResult:
        """Run the model, execute any tools it calls, and return its final text."""

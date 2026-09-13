"""A deterministic stand-in for a model, for browser tests, CI and demos.

End-to-end tests need an agent run to stream real events -- tool calls,
results, a summary -- but CI has no GPU, no Ollama, and should not spend
API credits. This provider exercises the whole pipeline (tools really run,
events really persist and stream) with a fixed, model-free script:

1. log what it is about to do;
2. call the agent's first tool that needs no arguments, if it has one;
3. finish with a summary that quotes the tool's result.

It makes no decisions, so it never proposes anything -- the approval flow
is tested with seeded proposals instead. Selected with LLM_PROVIDER=scripted.
"""

import inspect
from collections.abc import Sequence
from typing import Any

from app.agents.providers.base import (
    CancelCheck,
    EventEmitter,
    LLMProvider,
    ProviderResult,
    RunCancelledError,
)


def _needs_no_arguments(tool: Any) -> bool:
    return not (tool.input_schema or {}).get("required")


class ScriptedProvider(LLMProvider):
    key = "scripted"

    def resolve_model(self, configured_model: str) -> str:
        return "scripted"

    def run_agent_loop(
        self,
        *,
        model: str,
        system: str,
        tools: Sequence[Any],
        user_message: str,
        emit: EventEmitter,
        should_cancel: CancelCheck | None = None,
    ) -> ProviderResult:
        emit("log", {"text": f"Scripted run: {user_message}"})

        tool = next((t for t in tools if _needs_no_arguments(t)), None)
        if tool is None:
            return ProviderResult(text="Scripted run finished; this agent has no argument-free tool.")

        if should_cancel and should_cancel():
            raise RunCancelledError("Run cancelled before the scripted tool call")

        emit("tool_call", {"tool": tool.name, "input": {}})
        result = tool.call({})
        if inspect.isawaitable(result):  # defensive: all current tools are sync
            raise TypeError(f"{tool.name} returned an awaitable")
        result = str(result)
        emit("tool_result", {"tool": tool.name, "result": result[:2000]})

        preview = result if len(result) <= 160 else result[:157] + "..."
        return ProviderResult(text=f"Scripted run called {tool.name}. Result: {preview}", tokens_used=0)

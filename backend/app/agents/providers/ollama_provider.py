"""Run agents against a local Ollama model.

Ollama has no agentic helper equivalent to Anthropic's tool runner, so
the loop lives here: call the model, execute whatever tools it asked
for, feed the results back, repeat until it answers without calling a
tool.

The model must actually support tool calling -- `ollama show <model>`
lists "tools" under capabilities. A model without it silently ignores
the tools and just talks, which surfaces as a run that reports instead
of acting.
"""

import json
from collections.abc import Sequence
from typing import Any

import httpx

from app.agents.providers.base import (
    EventEmitter,
    LLMProvider,
    ProviderError,
    ProviderResult,
    to_function_schema,
)
from app.config import settings

#: Tool output is fed back into the prompt, so an unbounded result (a
#: whole inventory dump) can blow the context window on a small model.
MAX_TOOL_RESULT_CHARS = 8000


class OllamaProvider(LLMProvider):
    key = "ollama"

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
        max_rounds: int | None = None,
    ):
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.model = model or settings.ollama_model
        self.timeout = timeout if timeout is not None else settings.ollama_timeout_seconds
        self.max_rounds = max_rounds or settings.agent_max_tool_rounds

    def resolve_model(self, configured_model: str) -> str:
        """Always the configured Ollama model.

        `AgentDefinition.model` holds a Claude model id from seeding;
        sending that to Ollama would just 404. One env var repoints the
        whole platform rather than requiring every definition be edited.
        """
        return self.model

    def _chat(self, model: str, messages: list[dict], tools: list[dict]) -> dict:
        payload = {"model": model, "messages": messages, "tools": tools, "stream": False}
        try:
            response = httpx.post(
                f"{self.base_url}/api/chat", json=payload, timeout=self.timeout
            )
        except httpx.RequestError as exc:
            raise ProviderError(
                f"Cannot reach Ollama at {self.base_url} ({exc}). Is `ollama serve` running?"
            ) from exc

        if response.status_code == 404:
            raise ProviderError(
                f"Ollama has no model {model!r}. Pull it first: `ollama pull {model}`"
            )
        if response.status_code >= 400:
            raise ProviderError(f"Ollama returned {response.status_code}: {response.text[:500]}")

        try:
            return response.json()
        except ValueError as exc:
            raise ProviderError(f"Ollama returned a non-JSON response: {response.text[:200]}") from exc

    @staticmethod
    def _arguments(raw: Any) -> dict:
        """Ollama sends an object; OpenAI-compatible paths send a JSON string."""
        if isinstance(raw, str):
            try:
                return json.loads(raw or "{}")
            except json.JSONDecodeError:
                return {}
        return dict(raw or {})

    def run_agent_loop(
        self,
        *,
        model: str,
        system: str,
        tools: Sequence[Any],
        user_message: str,
        emit: EventEmitter,
    ) -> ProviderResult:
        tools_by_name = {tool.name: tool for tool in tools}
        declarations = [to_function_schema(tool) for tool in tools]
        messages: list[dict] = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_message},
        ]
        tokens = 0

        for _ in range(self.max_rounds):
            response = self._chat(model, messages, declarations)
            tokens += int(response.get("prompt_eval_count") or 0)
            tokens += int(response.get("eval_count") or 0)

            message = response.get("message") or {}
            text = (message.get("content") or "").strip()
            if text:
                emit("log", {"text": text})

            calls = message.get("tool_calls") or []
            if not calls:
                return ProviderResult(text=text, tokens_used=tokens or None)

            messages.append(message)
            for call in calls:
                function = call.get("function") or {}
                name = function.get("name") or ""
                arguments = self._arguments(function.get("arguments"))
                emit("tool_call", {"tool": name, "input": arguments})

                tool = tools_by_name.get(name)
                if tool is None:
                    result = f"Error: no tool named {name!r}. Available: {', '.join(sorted(tools_by_name))}"
                else:
                    try:
                        result = str(tool.call(arguments))
                    except Exception as exc:  # surfaced to the model, not raised
                        result = f"Error running {name}: {exc}"

                result = result[:MAX_TOOL_RESULT_CHARS]
                emit("tool_result", {"tool": name, "result": result})
                messages.append({"role": "tool", "tool_name": name, "content": result})

        raise ProviderError(
            f"Agent did not finish within {self.max_rounds} tool rounds. "
            f"Raise AGENT_MAX_TOOL_ROUNDS, or use a stronger model -- small models "
            f"often loop on the same call."
        )

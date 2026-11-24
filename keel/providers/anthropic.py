"""Claude adapter on the Messages API.

keel runs its own loop (it has to: every step is bracketed by events), so this
adapter makes one request per step and normalises the reply.

Notes:
- assistant turns are replayed with their original content blocks, thinking
  included, unchanged. Newer models check that history wasn't edited.
- all tool results for one step go back in a single user message.
- server side fallbacks are on: if the model declines, the API reruns the
  request on a fallback model in the same call.
- the SDK already retries 429, 5xx and connection errors with backoff.
"""

from __future__ import annotations

from typing import Any

from anthropic import AsyncAnthropic

from keel.providers.base import Completion, Message, ToolCall, ToolSpec, Usage

FALLBACK_BETA = "server-side-fallback-2026-07-01"

# $ per 1M tokens (input, output). Unknown models are recorded at $0 and flagged.
PRICES: dict[str, tuple[float, float]] = {
    "claude-fable-5-2": (8.0, 40.0),
    "claude-opus-5-5": (4.0, 20.0),
    "claude-opus-5": (5.0, 25.0),
    "claude-opus-4-8": (5.0, 25.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-sonnet-5": (2.0, 10.0),
    "claude-haiku-5-5": (0.10, 0.50),
}


def cost(model: str, usage: Usage) -> float:
    # bedrock ids carry an "anthropic." prefix; prices are listed by the first party id.
    # bedrock bills separately, so treat these as estimates there.
    i, o = PRICES.get(model.removeprefix("anthropic."), (0.0, 0.0))
    return (usage.input * i + usage.output * o) / 1_000_000


def to_api_messages(messages: list[Message]) -> list[dict[str, Any]]:
    # tool results are keyed by keel's call id; the model knows them by its own tool_use id
    provider_ids = {tc.id: tc.provider_id or tc.id for m in messages for tc in m.tool_calls}
    out: list[dict[str, Any]] = []
    for m in messages:
        if m.role == "user":
            out.append({"role": "user", "content": m.content})
        elif m.role == "assistant":
            if m.raw is not None:
                content = m.raw
            else:
                content = ([{"type": "text", "text": m.content}] if m.content else []) + [
                    {"type": "tool_use", "id": tc.provider_id or tc.id, "name": tc.name, "input": tc.input}
                    for tc in m.tool_calls
                ]
            out.append({"role": "assistant", "content": content})
        else:
            block = {
                "type": "tool_result",
                "tool_use_id": provider_ids.get(m.tool_call_id, m.tool_call_id),
                "content": m.content,
            }
            if m.is_error:
                block["is_error"] = True
            prev = out[-1] if out else None
            if prev and prev["role"] == "user" and isinstance(prev["content"], list):
                prev["content"].append(block)  # one user message per step's results
            else:
                out.append({"role": "user", "content": [block]})
    return out


class AnthropicProvider:
    def __init__(self, client: Any | None = None, *, fallbacks: bool = True, model_prefix: str = "") -> None:
        # credentials resolve from the environment (ANTHROPIC_API_KEY or an `ant auth login` profile)
        self.client = client or AsyncAnthropic()
        self.fallbacks = fallbacks
        self.model_prefix = model_prefix

    @classmethod
    def bedrock(cls, region: str | None = None) -> AnthropicProvider:
        """Claude on Amazon Bedrock through the Mantle (Messages API) endpoint.

        AWS credentials come from the usual chain. Server side fallbacks aren't
        offered there, so a declined request comes back as a refusal.
        """
        from anthropic import AsyncAnthropicBedrockMantle

        return cls(AsyncAnthropicBedrockMantle(aws_region=region), fallbacks=False, model_prefix="anthropic.")

    async def complete(
        self,
        messages: list[Message],
        tools: list[ToolSpec],
        model: str,
        max_tokens: int,
        system: str = "",
        effort: str | None = None,
    ) -> Completion:
        api_messages = to_api_messages(messages)
        kwargs: dict[str, Any] = {
            "model": model if model.startswith(self.model_prefix) else f"{self.model_prefix}{model}",
            "max_tokens": max_tokens,
            "messages": api_messages,
        }
        if system:
            kwargs["system"] = system
        if tools:
            kwargs["tools"] = [
                {"name": t.name, "description": t.description, "input_schema": t.input_schema} for t in tools
            ]
        if effort:
            kwargs["output_config"] = {"effort": effort}
        if self.fallbacks:
            kwargs["betas"] = [FALLBACK_BETA]
            kwargs["fallbacks"] = "default"
            resp = await self.client.beta.messages.create(**kwargs)
        else:
            resp = await self.client.messages.create(**kwargs)

        text_parts: list[str] = []
        calls: list[ToolCall] = []
        for block in resp.content:
            if block.type == "text":
                text_parts.append(block.text)
            elif block.type == "tool_use":
                calls.append(ToolCall(name=block.name, input=dict(block.input), provider_id=block.id))

        usage = Usage(input=resp.usage.input_tokens, output=resp.usage.output_tokens)
        if resp.stop_reason == "refusal" and not calls:
            # the whole fallback chain declined. surface it as the final answer.
            text_parts.append("[declined by the model]")
        return Completion(
            text="".join(text_parts),
            tool_calls=calls,
            usage=usage,
            cost_usd=cost(resp.model, usage),
            model=resp.model,
            stop_reason=resp.stop_reason,
            raw=[b.model_dump(mode="json", exclude_none=True, by_alias=True) for b in resp.content],
        )

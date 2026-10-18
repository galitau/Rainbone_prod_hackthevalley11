"""Per-request provider-reported generation usage; never an HTTP-attempt or billing ledger.

Call record once per returned generation, before code checking its content. A rejected selection still
consumed that generation; saved selections, code checks and cache reuse do not produce new records.
"""
from __future__ import annotations

from collections.abc import Mapping
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

Count = Annotated[int, Field(strict=True, ge=0)]
Stage = Literal["triage", "writer"]
Provider = Literal["gemini", "groq"]
Reuse = Literal["none", "cache", "in_flight"]
IncompleteReason = Literal["missing_usage", "failed_attempt", "request_timeout", "invalid_provider_output"]
_REASONS = frozenset({"missing_usage", "failed_attempt", "request_timeout", "invalid_provider_output"})
_COUNT_FIELDS = ("prompt_tokens", "output_tokens", "thinking_tokens", "total_tokens")


class TokenCounts(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    prompt_tokens: Optional[Count] = None
    output_tokens: Optional[Count] = None
    thinking_tokens: Optional[Count] = None
    total_tokens: Optional[Count] = None


class UsageCall(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    stage: Stage
    provider: Provider
    model: str
    usage: Optional[TokenCounts] = None


class WorkflowUsage(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    scope: Literal["current_request"] = "current_request"
    reuse: Reuse = "none"
    calls: list[UsageCall] = Field(default_factory=list)
    reported_totals: TokenCounts
    complete: bool
    incomplete_reasons: list[IncompleteReason] = Field(default_factory=list)


def empty_usage(reuse: Reuse = "none") -> WorkflowUsage:
    """No new work initiated by this request; an in-flight producer may still be doing work."""
    return WorkflowUsage(reuse=reuse, reported_totals=TokenCounts(**{key: 0 for key in _COUNT_FIELDS}),
                         complete=True)


class UsageCollector:
    """Owned by one producing request. Callers, not this collector, ensure one record per generation.

    Identical reports are not deduplicated: two separate generations can use the same token counts.
    Missing/malformed counts remain unknown; no token estimation or implied environmental measurement.
    """

    def __init__(self) -> None:
        self._calls: list[UsageCall] = []
        self._reasons: list[IncompleteReason] = []

    def mark_incomplete(self, category: IncompleteReason) -> None:
        # Check before storing anything: arbitrary error strings must never enter the public response.
        if category not in _REASONS:
            raise ValueError("Unknown usage completeness category")
        if category not in self._reasons:
            self._reasons.append(category)

    def record(self, stage: Stage, provider: Provider, model: str, usage: object) -> None:
        block = usage.model_dump() if isinstance(usage, TokenCounts) else usage
        counts = None
        if isinstance(block, Mapping):
            values = {key: value if type(value) is int and value >= 0 else None
                      for key in _COUNT_FIELDS for value in [block.get(key)]}
            if any(value is not None for value in values.values()):
                counts = TokenCounts(**values)
        call = UsageCall(stage=stage, provider=provider, model=model, usage=counts)
        self._calls.append(call)
        if counts is None or any(getattr(counts, key) is None
                                 for key in ("prompt_tokens", "output_tokens", "total_tokens")):
            self.mark_incomplete("missing_usage")

    def snapshot(self) -> WorkflowUsage:
        if not self._calls and not self._reasons:
            return empty_usage()
        totals = {}
        for key in _COUNT_FIELDS:
            known = [getattr(call.usage, key) for call in self._calls
                     if call.usage is not None and getattr(call.usage, key) is not None]
            totals[key] = sum(known) if known else None
        # Thinking is a breakdown already contained in output: components are summed independently.
        return WorkflowUsage(calls=list(self._calls), reported_totals=TokenCounts(**totals),
                             complete=not self._reasons, incomplete_reasons=list(self._reasons))

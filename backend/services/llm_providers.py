"""Language-model adapters for POST /api/explain: Gemini and Groq.

Each adapter posts one request with httpx and returns the model's text, or
raises ProviderError with a short reason. It never returns partial text.
Keys travel only in request headers; reasons and log lines never contain them.

- Gemini: POST {GEMINI_BASE_URL}/models/{model}:generateContent, key in the
  x-goog-api-key header, JSON output constrained by responseJsonSchema,
  thinkingConfig.thinkingLevel LOW.
- Groq: OpenAI-compatible POST {GROQ_BASE_URL}/chat/completions, bearer key,
  response_format json_schema with strict=true.

Both ask for the JSON object {"text": "..."}. httpx is imported when a request
is made, so the API still starts (and the template still answers) without it.

The chain state both AI routes share also lives here, since they call the same
models with the same keys and so spend one quota: attempt() makes one call and
starts a cooldown when it fails (300 s after HTTP 429, else 60 s), so later
requests from either route skip that model; AnswerCache keeps answers in memory.
"""
from __future__ import annotations

import asyncio
import json
import re
import time
from collections import OrderedDict
from typing import TYPE_CHECKING, Any, Awaitable, Callable, Hashable, Mapping, Optional

if TYPE_CHECKING:  # pragma: no cover
    import httpx

GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
GEMINI_DEFAULT_MODEL = "gemini-3.8-flash"
GEMINI_FALLBACK_MODEL = "gemini-3.5-flash-lite"  # tried when GEMINI_MODEL fails
GEMINI_TIMEOUT_S = 10.0
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_DEFAULT_MODEL = "openai/gpt-oss-120b"
GROQ_TIMEOUT_S = 8.0

OUTPUT_SCHEMA: dict = {
    "type": "object",
    "properties": {"text": {"type": "string"}},
    "required": ["text"],
    "additionalProperties": False,
}

_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.IGNORECASE | re.DOTALL)


class ProviderError(Exception):
    """The provider was called and gave no usable text (HTTP status, timeout, bad body).

    `status` is the HTTP status when the provider answered with an error status, else None.
    """

    def __init__(self, reason: str, status: Optional[int] = None):
        super().__init__(reason)
        self.reason = reason
        self.status = status


def env_value(env: Mapping[str, str], name: str) -> Optional[str]:
    """A stripped value, or None when unset or blank."""
    value = (env.get(name) or "").strip()
    return value or None


def _output_text(raw: Any) -> str:
    """The "text" field of the model's JSON answer."""
    if not isinstance(raw, str):
        raise ProviderError("invalid output: no text")
    fenced = _FENCE.match(raw)
    raw = (fenced.group(1) if fenced else raw).strip()
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        raise ProviderError("invalid output: not JSON") from None
    if not isinstance(data, dict) or not isinstance(data.get("text"), str):
        raise ProviderError("invalid output: no text field")
    text = " ".join(data["text"].split())
    if not text:
        raise ProviderError("invalid output: empty text")
    return text


async def _post_json(url: str, body: dict, headers: dict, timeout: float,
                     transport: Optional["httpx.AsyncBaseTransport"]) -> Any:
    try:
        import httpx
    except ImportError:
        raise ProviderError("httpx is not installed") from None
    limits = httpx.Timeout(timeout, connect=min(timeout, 3.0))
    try:
        async with httpx.AsyncClient(timeout=limits, transport=transport) as client:
            response = await client.post(url, json=body, headers=headers)
    except httpx.TimeoutException:
        raise ProviderError(f"timed out after {timeout:g} s") from None
    except httpx.HTTPError as exc:  # connection errors; the message is not forwarded
        raise ProviderError(type(exc).__name__) from None
    if response.status_code != 200:
        raise ProviderError(f"HTTP {response.status_code}", status=response.status_code)
    try:
        return response.json()
    except ValueError:
        raise ProviderError("response is not JSON") from None


class GeminiProvider:
    name = "gemini"
    key_name = "GEMINI_API_KEY"

    def __init__(self, env: Mapping[str, str], transport: Optional["httpx.AsyncBaseTransport"] = None,
                 timeout: float = GEMINI_TIMEOUT_S, model: Optional[str] = None):
        self._key = env_value(env, self.key_name)
        self.model = model or env_value(env, "GEMINI_MODEL") or GEMINI_DEFAULT_MODEL
        self.timeout = timeout
        self._transport = transport

    @property
    def configured(self) -> bool:
        return self._key is not None

    async def generate(self, system: str, user: str) -> str:
        body = {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseJsonSchema": OUTPUT_SCHEMA,
                "thinkingConfig": {"thinkingLevel": "LOW"},
            },
        }
        data = await _post_json(f"{GEMINI_BASE_URL}/models/{self.model}:generateContent", body,
                                {"x-goog-api-key": self._key or ""}, self.timeout, self._transport)
        try:
            candidate = data["candidates"][0]
        except (KeyError, IndexError, TypeError):
            raise ProviderError("no candidates in the response") from None
        finish = candidate.get("finishReason") if isinstance(candidate, dict) else None
        if finish == "MAX_TOKENS":
            raise ProviderError("cut off at the token limit")
        if finish not in (None, "STOP"):
            raise ProviderError(f"finished with {finish}")
        try:
            parts = candidate["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts if not p.get("thought"))
        except (KeyError, TypeError, AttributeError):
            raise ProviderError("unexpected response body") from None
        return _output_text(text)


class GroqProvider:
    name = "groq"
    key_name = "GROQ_API_KEY"

    def __init__(self, env: Mapping[str, str], transport: Optional["httpx.AsyncBaseTransport"] = None,
                 timeout: float = GROQ_TIMEOUT_S):
        self._key = env_value(env, self.key_name)
        self.model = env_value(env, "GROQ_MODEL") or GROQ_DEFAULT_MODEL
        self.timeout = timeout
        self._transport = transport

    @property
    def configured(self) -> bool:
        return self._key is not None

    async def generate(self, system: str, user: str) -> str:
        body = {
            "model": self.model,
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "explanation", "strict": True, "schema": OUTPUT_SCHEMA},
            },
        }
        data = await _post_json(f"{GROQ_BASE_URL}/chat/completions", body,
                                {"Authorization": f"Bearer {self._key or ''}"}, self.timeout, self._transport)
        try:
            choice = data["choices"][0]
            content = choice["message"]["content"]
        except (KeyError, IndexError, TypeError):
            raise ProviderError("unexpected response body") from None
        if choice.get("finish_reason") == "length":
            raise ProviderError("cut off at the token limit")
        return _output_text(content)


# ----------------------------------------------------------------------------- shared chain state
FAILURE_COOLDOWN_S = 60.0  # after a timeout, a connection error or an HTTP error
RATE_LIMIT_COOLDOWN_S = 300.0  # after HTTP 429: the model's quota is spent, so the next Gemini model answers meanwhile
GEMINI_ANSWER_TTL_S = 3600.0
OTHER_ANSWER_TTL_S = 60.0  # Groq and template answers, so Gemini is asked again a minute later
ANSWER_CACHE_MAX = 256


def _now() -> float:
    return time.monotonic()


# (provider name, model) -> (monotonic time the cooldown ends, the reason a skipped attempt reports)
_cooldowns: dict[tuple[str, str], tuple[float, str]] = {}


def reset_cooldowns() -> None:
    """Forget failed calls (tests, or after fixing a key)."""
    _cooldowns.clear()


def start_cooldown(provider, status: Optional[int]) -> None:
    """Skip `provider`'s model for a while: RATE_LIMIT_COOLDOWN_S after HTTP 429, else FAILURE_COOLDOWN_S."""
    if status == 429:
        seconds, reason = RATE_LIMIT_COOLDOWN_S, f"skipped: HTTP 429 less than {RATE_LIMIT_COOLDOWN_S:g} s ago"
    else:
        seconds, reason = FAILURE_COOLDOWN_S, f"skipped: failed less than {FAILURE_COOLDOWN_S:g} s ago"
    _cooldowns[(provider.name, provider.model)] = (_now() + seconds, reason)


def cooldown_reason(provider) -> Optional[str]:
    """Why `provider`'s model is skipped now, or None when it may be called."""
    until, reason = _cooldowns.get((provider.name, provider.model), (0.0, ""))
    return reason if _now() < until else None


async def attempt(provider, system: str, user: str,
                  check: Callable[[str], Optional[str]]) -> tuple[Optional[str], Optional[str], bool]:
    """(text, reason, try_next_model). text is set when the provider's text passes check().

    try_next_model is true after an HTTP error status or a cooldown skip: the provider's next model (Gemini's
    fallback) may still answer. A timeout, a connection error or a rejected text leaves the provider.
    A call that fails (not a rejected text) starts a cooldown for this provider and model, so later requests
    from either AI route skip it instead of waiting for the same error again.
    """
    skipped = cooldown_reason(provider)
    if skipped:
        return None, skipped, True
    try:
        text = await asyncio.wait_for(provider.generate(system, user), timeout=provider.timeout)
    except Exception as exc:  # also an adapter bug: it must not break the chain; messages are not forwarded
        try_next, status = False, None
        if isinstance(exc, ProviderError):
            reason, status = exc.reason, exc.status
            try_next = status is not None
        elif isinstance(exc, asyncio.TimeoutError):
            reason = f"timed out after {provider.timeout:g} s"
        else:
            reason = f"unexpected {type(exc).__name__}"
        start_cooldown(provider, status)
        return None, reason, try_next
    reason = check(text)
    return (None, f"rejected: {reason}", False) if reason else (text, None, False)


def chain_signature(order: tuple[str, ...], tiers: Mapping[str, list]) -> tuple:
    """The chain an answer comes from, for cache keys: each provider's models and whether its key is set
    (never the key itself)."""
    return tuple((name,) if name == "template" else
                 (name, tuple(p.model for p in tiers[name]), bool(tiers[name][0].configured)) for name in order)


def answer_ttl(provider: str) -> float:
    return GEMINI_ANSWER_TTL_S if provider == "gemini" else OTHER_ANSWER_TTL_S


class AnswerCache:
    """Answers kept in memory, each for its own lifetime; the least recently used goes first past max_entries.

    get_or_compute() also lets concurrent requests for one key share a single computation, so a burst of page
    loads makes one model call instead of one each.
    """

    def __init__(self, max_entries: int = ANSWER_CACHE_MAX):
        self.max_entries = max_entries
        self._entries: "OrderedDict[Hashable, tuple[float, Any]]" = OrderedDict()
        self._pending: dict[Hashable, "asyncio.Future"] = {}

    def __len__(self) -> int:
        return len(self._entries)

    def get(self, key: Hashable) -> Any:
        entry = self._entries.get(key)
        if entry is None:
            return None
        if _now() >= entry[0]:
            del self._entries[key]
            return None
        self._entries.move_to_end(key)
        return entry[1]

    def put(self, key: Hashable, value: Any, ttl_s: float) -> None:
        self._entries.pop(key, None)
        self._entries[key] = (_now() + ttl_s, value)
        while len(self._entries) > self.max_entries:
            self._entries.popitem(last=False)

    def clear(self) -> None:
        self._entries.clear()
        self._pending.clear()

    async def get_or_compute(self, key: Hashable, compute: Callable[[], Awaitable[Any]],
                             ttl_of: Callable[[Any], float]) -> Any:
        """The kept answer for `key`, else the result of compute() (shared by concurrent callers), kept for
        ttl_of(result) seconds. A failed or cancelled computation is not kept."""
        hit = self.get(key)
        if hit is not None:
            return hit
        loop = asyncio.get_running_loop()
        task = self._pending.get(key)
        if task is None or task.done() or task.get_loop() is not loop:
            task = loop.create_task(compute())
            self._pending[key] = task

            def finished(done: "asyncio.Task") -> None:
                if self._pending.get(key) is done:
                    del self._pending[key]
                if not done.cancelled() and done.exception() is None:
                    self.put(key, done.result(), ttl_of(done.result()))

            task.add_done_callback(finished)
        # A caller that is cancelled (a closed browser tab) leaves the computation running for the others.
        return await asyncio.shield(task)

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
"""
from __future__ import annotations

import json
import re
from typing import TYPE_CHECKING, Any, Mapping, Optional

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

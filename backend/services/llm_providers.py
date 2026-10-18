"""Language-model adapters for POST /api/explain: Gemini and Groq.

Each adapter posts one request with httpx and returns the model's text, or
raises ProviderError with a short reason. It never returns partial text.
Keys travel only in request headers; reasons and log lines never contain them.

- Gemini: POST {GEMINI_BASE_URL}/models/{model}:generateContent, key in the
  x-goog-api-key header, JSON output constrained by responseJsonSchema,
  thinkingConfig.thinkingLevel LOW. Keys come from GEMINI_API_KEY and
  GEMINI_API_KEYS (comma list), in that order, without repeats. When a key
  answers HTTP 400, 401 or 403 (an invalid or refused key) the same model is
  asked with the next key, and that key is skipped for that model for 60 s.
  A 429 (a spent quota) is never retried with another key, so a rate limit is
  not worked around: the model cools down for 300 s and the next model, the
  saved answer or Groq answers. Reasons name keys only as "key 1", "key 2".
- Groq: OpenAI-compatible POST {GROQ_BASE_URL}/chat/completions, bearer key,
  response_format json_schema with strict=true.

Both ask for the JSON object {"text": "..."}. httpx is imported when a request
is made, so the API still starts (and the template still answers) without it.

The chain state both AI routes share also lives here, since they call the same
models with the same keys and so spend one quota: attempt() makes one call and
starts a cooldown when it fails (300 s after HTTP 429, else 60 s), so later
requests from either route skip that model; AnswerCache keeps answers in memory.

ask_models() is one chain step: a provider's models in turn. Every Gemini answer
that passed the route's checker is also saved to a JSON file (AI_ANSWER_STORE,
default backend/.ai-answers.json) under its route, facts and prompts. When no
Gemini model answers now, the saved Gemini answer for exactly those facts and
prompts is served instead, marked served="saved" with its own model and
saved_at, before the chain moves on to Groq. Only answers Gemini returned with
its responseId and modelVersion are saved, and an entry without them, or not
marked provider "gemini", is never served. A missing, unreadable or unwritable
file never fails a request: the chain only goes without it. The file is read
and rewritten whole on each save, which assumes one server process: with
several workers two saves at once can lose one entry (never corrupt the file).
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import re
import tempfile
import time
from collections import OrderedDict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
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

# HTTP statuses that belong to one key rather than to the model: 400 is what Gemini answers for an invalid key
# (API_KEY_INVALID), 401 and 403 a refused one. The next key may still be answered. 429 is not one: another key
# must not be used to get around a rate limit, so a 429 leaves the model as on a single key.
KEY_STATUSES = frozenset({400, 401, 403})

log = logging.getLogger("rainbowbone.llm")

OUTPUT_SCHEMA: dict = {
    "type": "object",
    "properties": {"text": {"type": "string"}},
    "required": ["text"],
    "additionalProperties": False,
}

_FENCE = re.compile(r"^\s*```(?:json)?\s*(.*?)\s*```\s*$", re.IGNORECASE | re.DOTALL)


class ProviderError(Exception):
    """The provider was called and gave no usable text (HTTP status, timeout, bad body).

    `status` is the HTTP status when the provider answered with an error status, else None. `key_level` is true
    when every key failed with one of KEY_STATUSES: each key and model then already has its own cooldown.
    """

    def __init__(self, reason: str, status: Optional[int] = None, key_level: bool = False):
        super().__init__(reason)
        self.reason = reason
        self.status = status
        self.key_level = key_level


class GeminiText(str):
    """The text of one Gemini answer, carrying the response's own responseId and modelVersion (None when the
    response left them out), so a saved answer records which Gemini response it came from."""

    response_id: Optional[str]
    model_version: Optional[str]

    def __new__(cls, text: str, response_id: Optional[str] = None, model_version: Optional[str] = None):
        value = super().__new__(cls, text)
        value.response_id = response_id
        value.model_version = model_version
        return value


def env_value(env: Mapping[str, str], name: str) -> Optional[str]:
    """A stripped value, or None when unset or blank."""
    value = (env.get(name) or "").strip()
    return value or None


def gemini_keys(env: Mapping[str, str]) -> list[str]:
    """GEMINI_API_KEY, then each GEMINI_API_KEYS entry, stripped, blanks and repeats dropped."""
    keys: list[str] = []
    for value in [env_value(env, "GEMINI_API_KEY") or "", *(env_value(env, "GEMINI_API_KEYS") or "").split(",")]:
        key = value.strip()
        if key and key not in keys:
            keys.append(key)
    return keys


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
        # (label, key, id): the label is all a reason shows; the id (a hash) is all the cooldowns keep.
        self._keys = [(f"key {i}", key, hashlib.sha256(key.encode("utf-8")).hexdigest())
                      for i, key in enumerate(gemini_keys(env), start=1)]
        self.model = model or env_value(env, "GEMINI_MODEL") or GEMINI_DEFAULT_MODEL
        self.timeout = timeout
        self._transport = transport
        self.answer_store = answer_store_path(env)

    def __repr__(self) -> str:  # never the keys
        return f"GeminiProvider(model={self.model!r}, keys={len(self._keys)})"

    @property
    def configured(self) -> bool:
        return bool(self._keys)

    @property
    def attempt_timeout(self) -> float:
        """The hard limit on one generate(): each key may be asked once."""
        return self.timeout * max(1, len(self._keys))

    def _reason(self, failures: list[tuple[str, str]]) -> str:
        if len(self._keys) == 1:
            return failures[0][1]
        return "; ".join(f"{label}: {reason}" for label, reason in failures)

    def keys_cooldown_reason(self) -> Optional[str]:
        """Why this model is skipped now because every key is cooling down for it, or None."""
        failures = []
        for label, _, key_id in self._keys:
            reason = key_cooldown_reason(key_id, self.model)
            if reason is None:
                return None
            failures.append((label, reason))
        return self._reason(failures) if failures else None

    async def generate(self, system: str, user: str) -> GeminiText:
        """The model's text from the first key that answers. A KEY_STATUSES error moves to the next key and starts
        that key's cooldown for this model; any other failure, a 429 included, ends the call."""
        failures: list[tuple[str, str]] = []
        last_status: Optional[int] = None
        for label, key, key_id in self._keys:
            skipped = key_cooldown_reason(key_id, self.model)
            if skipped:
                failures.append((label, skipped))
                continue
            try:
                return await self._generate_with(key, system, user)
            except ProviderError as exc:
                failures.append((label, exc.reason))
                if exc.status not in KEY_STATUSES:
                    raise ProviderError(self._reason(failures), status=exc.status) from None
                start_key_cooldown(key_id, self.model, exc.status)
                last_status = exc.status
        if not failures:
            raise ProviderError("no key")
        raise ProviderError(self._reason(failures), status=last_status, key_level=True)

    async def _generate_with(self, key: str, system: str, user: str) -> GeminiText:
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
                                {"x-goog-api-key": key}, self.timeout, self._transport)
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

        def field(name: str) -> Optional[str]:
            value = data.get(name) if isinstance(data, dict) else None
            return value.strip() if isinstance(value, str) and value.strip() else None

        return GeminiText(_output_text(text), field("responseId"), field("modelVersion"))


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
# (sha256 of a Gemini key, model) -> the same: one key's own failures, which the next key does not share
_key_cooldowns: dict[tuple[str, str], tuple[float, str]] = {}


def reset_cooldowns() -> None:
    """Forget failed calls (tests, or after fixing a key)."""
    _cooldowns.clear()
    _key_cooldowns.clear()


def _cooldown(status: Optional[int]) -> tuple[float, str]:
    """(until, reason): RATE_LIMIT_COOLDOWN_S after HTTP 429, else FAILURE_COOLDOWN_S."""
    if status == 429:
        return _now() + RATE_LIMIT_COOLDOWN_S, f"skipped: HTTP 429 less than {RATE_LIMIT_COOLDOWN_S:g} s ago"
    return _now() + FAILURE_COOLDOWN_S, f"skipped: failed less than {FAILURE_COOLDOWN_S:g} s ago"


def start_cooldown(provider, status: Optional[int]) -> None:
    """Skip `provider`'s model for a while: RATE_LIMIT_COOLDOWN_S after HTTP 429, else FAILURE_COOLDOWN_S."""
    _cooldowns[(provider.name, provider.model)] = _cooldown(status)


def start_key_cooldown(key_id: str, model: str, status: Optional[int]) -> None:
    """Skip one Gemini key for `model` for a while, as start_cooldown() does for a whole model."""
    _key_cooldowns[(key_id, model)] = _cooldown(status)


def key_cooldown_reason(key_id: str, model: str) -> Optional[str]:
    until, reason = _key_cooldowns.get((key_id, model), (0.0, ""))
    return reason if _now() < until else None


def cooldown_reason(provider) -> Optional[str]:
    """Why `provider`'s model is skipped now, or None when it may be called."""
    until, reason = _cooldowns.get((provider.name, provider.model), (0.0, ""))
    if _now() < until:
        return reason
    every_key = getattr(provider, "keys_cooldown_reason", None)
    return every_key() if every_key is not None else None


async def attempt(provider, system: str, user: str,
                  check: Callable[[str], Optional[str]]) -> tuple[Optional[str], Optional[str], bool]:
    """(text, reason, try_next_model). text is set when the provider's text passes check().

    try_next_model is true after an HTTP error status or a cooldown skip: the provider's next model (Gemini's
    fallback) may still answer. A timeout, a connection error or a rejected text leaves the provider.
    A call that fails (not a rejected text) starts a cooldown for this provider and model, so later requests
    from either AI route skip it instead of waiting for the same error again. When every Gemini key failed on its
    own (ProviderError.key_level), each key already cools down for this model, and the model itself does not.
    """
    skipped = cooldown_reason(provider)
    if skipped:
        return None, skipped, True
    limit = getattr(provider, "attempt_timeout", provider.timeout)
    try:
        text = await asyncio.wait_for(provider.generate(system, user), timeout=limit)
    except Exception as exc:  # also an adapter bug: it must not break the chain; messages are not forwarded
        try_next, status = False, None
        if isinstance(exc, ProviderError):
            reason, status = exc.reason, exc.status
            try_next = status is not None
            if exc.key_level:
                return None, reason, True
        elif isinstance(exc, asyncio.TimeoutError):
            reason = f"timed out after {limit:g} s"
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


def _as_kept(value: Any) -> Any:
    """How a computed answer reads back from memory: one served "live" says "cached" instead."""
    if getattr(value, "served", None) == "live" and callable(getattr(value, "model_copy", None)):
        return value.model_copy(update={"served": "cached"})
    return value


class AnswerCache:
    """Answers kept in memory, each for its own lifetime; the least recently used goes first past max_entries.

    get_or_compute() also lets concurrent requests for one key share a single computation, so a burst of page
    loads makes one model call instead of one each. An answer with served="live" is kept as served="cached", and
    one with served="saved" (no Gemini model answered) for at most OTHER_ANSWER_TTL_S, so Gemini is asked again.
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
                    value = done.result()
                    ttl = ttl_of(value)
                    if getattr(value, "served", None) == "saved":
                        ttl = min(ttl, OTHER_ANSWER_TTL_S)
                    self.put(key, _as_kept(value), ttl)

            task.add_done_callback(finished)
        # A caller that is cancelled (a closed browser tab) leaves the computation running for the others.
        return await asyncio.shield(task)


# ----------------------------------------------------------------------------- saved Gemini answers
ANSWER_STORE_DEFAULT: Optional[Path] = Path(__file__).resolve().parents[1] / ".ai-answers.json"
ANSWER_STORE_MAX = 500  # entries; the oldest go first
_STORE_VERSION = 1


def answer_store_path(env: Mapping[str, str]) -> Optional[Path]:
    """AI_ANSWER_STORE (relative to backend/), else ANSWER_STORE_DEFAULT; None keeps no answers."""
    value = env_value(env, "AI_ANSWER_STORE")
    if value is None:
        return ANSWER_STORE_DEFAULT
    path = Path(value).expanduser()
    return path if path.is_absolute() else Path(__file__).resolve().parents[1] / path


def _wall_now() -> datetime:
    return datetime.now(timezone.utc)


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _entry_id(kind: str, facts: str, system: str, user: str) -> str:
    """The entry for one route, facts and prompt version (the system prompt and the model input as sent)."""
    return _sha256(json.dumps([_STORE_VERSION, kind, facts, _sha256(system), _sha256(user)]))


@dataclass(frozen=True)
class SavedAnswer:
    text: str
    model: str
    saved_at: str  # ISO 8601, UTC
    response_id: str  # Gemini's responseId and modelVersion for the response the text came from
    model_version: str


def _read_entries(path: Path) -> dict:
    """The file's entries; {} when it is missing or unreadable (logged, never raised)."""
    try:
        with path.open(encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError:
        return {}
    except (OSError, ValueError) as exc:
        log.warning("saved Gemini answers: %s is not readable (%s); going without it", path.name,
                    type(exc).__name__)
        return {}
    entries = data.get("answers") if isinstance(data, dict) else None
    if not isinstance(entries, dict):
        log.warning("saved Gemini answers: %s has no answers object; going without it", path.name)
        return {}
    return {k: v for k, v in entries.items() if isinstance(v, dict)}


def save_answer(path: Optional[Path], kind: str, facts: str, system: str, user: str, model: str, text: str) -> None:
    """Keep a checked Gemini answer for the same route, facts and prompts. Written to a temporary file in the same
    folder and renamed over the old one, so a reader sees the old or the new file, never half of one. `text` is the
    GeminiText generate() returned; without its responseId and modelVersion it is not kept."""
    if path is None:
        return
    response_id, model_version = getattr(text, "response_id", None), getattr(text, "model_version", None)
    if not (response_id and model_version):
        log.warning("saved Gemini answers: the response had no responseId or modelVersion; not saved")
        return
    tmp: Optional[str] = None
    try:
        entries = _read_entries(path)
        entries[_entry_id(kind, facts, system, user)] = {
            "provider": "gemini", "kind": kind, "facts": facts, "model": model, "text": str(text),
            "response_id": response_id, "model_version": model_version,
            "saved_at": _wall_now().isoformat(timespec="seconds"),
        }
        if len(entries) > ANSWER_STORE_MAX:
            def saved_at(item: tuple) -> str:
                value = item[1].get("saved_at") if isinstance(item[1], dict) else None
                return value if isinstance(value, str) else ""
            entries = dict(sorted(entries.items(), key=saved_at)[-ANSWER_STORE_MAX:])
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=f"{path.name}.", suffix=".tmp", dir=path.parent)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"version": _STORE_VERSION, "answers": entries}, handle, ensure_ascii=False)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
        tmp = None
    except Exception as exc:  # a full disk or a read-only folder must not fail the answer that was just made
        log.warning("saved Gemini answers: could not write %s (%s)", path.name, type(exc).__name__)
    finally:
        if tmp is not None:
            try:
                os.unlink(tmp)
            except OSError:
                pass


def load_answer(path: Optional[Path], kind: str, facts: str, system: str, user: str) -> Optional[SavedAnswer]:
    """The saved Gemini answer for exactly this route, facts and prompts, or None. An entry not marked provider
    "gemini", or without the responseId and modelVersion of the Gemini response it came from, is never served."""
    if path is None:
        return None
    try:
        entry = _read_entries(path).get(_entry_id(kind, facts, system, user))
        if (not isinstance(entry, dict) or entry.get("provider") != "gemini" or entry.get("kind") != kind
                or entry.get("facts") != facts):
            return None
        fields = [entry.get(name) for name in ("text", "model", "saved_at", "response_id", "model_version")]
        if not all(isinstance(v, str) and v.strip() for v in fields):
            return None
        text, model, saved_at, response_id, model_version = fields
        datetime.fromisoformat(saved_at)  # ValueError: not a time
        return SavedAnswer(text=text, model=model, saved_at=saved_at, response_id=response_id,
                           model_version=model_version)
    except Exception as exc:
        log.warning("saved Gemini answers: unusable entry in %s (%s)", path.name, type(exc).__name__)
        return None


# ----------------------------------------------------------------------------- one chain step
@dataclass(frozen=True)
class ModelAnswer:
    """Checked text from one provider. served is "live" (a model answered now) or "saved" (a Gemini answer saved
    earlier for the same facts and prompts, with the model that wrote it and when)."""
    text: str
    model: str
    served: str = "live"
    saved_at: Optional[str] = None


async def ask_models(models: list, system: str, user: str, check: Callable[[str], Optional[str]],
                     fell_through: Callable[[Optional[str], str], None], *, kind: str,
                     facts: str) -> Optional[ModelAnswer]:
    """One provider's step in a route's chain, or None to move on to the next provider.

    Its models are asked in turn with attempt(). Each failure is passed to fell_through(model, reason), with
    model None when the provider has no key. A Gemini answer is saved under (kind, facts, system, user); when no
    Gemini model answers, the saved answer for the same four is served if it still passes check(). Only the
    provider named "gemini" saves or serves saved answers.
    """
    store = getattr(models[0], "answer_store", None) if models[0].name == "gemini" else None
    if not models[0].configured:
        fell_through(None, f"{models[0].key_name} not set")
    else:
        for provider in models:
            text, reason, try_next = await attempt(provider, system, user, check)
            if text is not None:
                save_answer(store, kind, facts, system, user, provider.model, text)
                return ModelAnswer(text=str(text), model=provider.model)
            fell_through(provider.model, reason or "no text")
            if not try_next:
                break
    saved = load_answer(store, kind, facts, system, user)
    if saved is not None and check(saved.text) is None:
        return ModelAnswer(text=saved.text, model=saved.model, served="saved", saved_at=saved.saved_at)
    return None

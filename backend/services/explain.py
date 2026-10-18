"""Plain-language explanation of computed simulation results (POST /api/explain).

The request carries the numbers /api/simulate computed (the SimulationResponse
fields). No model computes a number: models only word the facts built here, and
check() rejects any text that uses a number which is not a fact (or a fact
rounded to 1 or 0 decimals), spells a quantity out, uses clinical or fracture
wording, or runs too long.

Providers are tried in order. AI_CHAIN sets it (comma list of gemini, groq,
template; default gemini,groq,template; template is appended when missing).
AI_OFFLINE=1 uses the template only. A provider that has no key, fails, times
out or is rejected falls through to the next, and the reason is reported in
`fallbacks`. When GEMINI_MODEL answers with an HTTP error (such as 429) or is
cooling down, gemini-3.5-flash-lite is tried before leaving Gemini. A model
whose call failed is skipped for 60 s. The template is deterministic, needs no
network and passes check() for every valid request.

Keys come from the process environment, or from backend/.env when present
(process environment wins). They are never logged or returned.
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
import time
from typing import TYPE_CHECKING, Literal, Mapping, Optional

from pydantic import BaseModel, ConfigDict, Field

from services.llm_providers import (GEMINI_FALLBACK_MODEL, GeminiProvider, GroqProvider, ProviderError,
                                    env_value)
from services.settings import runtime_env  # noqa: F401 - routes_explain depends on it from here

if TYPE_CHECKING:  # pragma: no cover
    import httpx

log = logging.getLogger("rainbowbone.explain")

PROVIDER_NAMES: tuple[str, ...] = ("gemini", "groq", "template")
DEFAULT_ORDER: tuple[str, ...] = PROVIDER_NAMES
DISPLAY_DECIMALS = 2
COOLDOWN_S = 60.0
MAX_CHARS = 700  # the prompt asks for 600; the template's longest text stays below this
NOTE = "Illustrative engineering simulation with assumed material properties, not a medical assessment."

# Wording lists from the team's AI contract (HackTheValley11 contracts/labels.json, "ai").
BLOCKED_OUTPUT_PATTERNS: tuple[str, ...] = (
    "diagnos", "predict", "recommend", "should", "surg", "treat", "therap", r"respon(se|ding|d)\b",
    "likely", "probab", "chance", r"\brisk", "cancer", "metasta", "prognos", "urgent", "fractur",
)
NUMBER_WORDS: tuple[str, ...] = (
    "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
    "twelve", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred",
    "thousand", "half", "halved", "third", "quarter", "double", "doubled", "twice", "triple", "tripled",
    "dozen",
)

# A number is a token that does not follow a letter, digit or point, so "cm3" is not a number
# while "15mm" is. Thousands separators ("10,000") are read as one number.
NUMBER_RE = re.compile(r"(?<![A-Za-z0-9.])[-−]?(?:\d{1,3}(?:,\d{3})+(?!\d)|\d+)(?:\.\d+)?")
_BLOCKED = tuple(re.compile(p, re.IGNORECASE) for p in BLOCKED_OUTPUT_PATTERNS)
_NUMBER_WORDS = re.compile(r"\b(?:" + "|".join(sorted(NUMBER_WORDS, key=len, reverse=True)) + r")\b",
                           re.IGNORECASE)

SYSTEM_PROMPT = (
    "You explain the result of one engineering computer simulation of a bone to a reader with no "
    "engineering or medical background, such as a banker or a hospital manager. The user message is JSON "
    "holding every number our software computed. load_newtons is the force applied to the bone, in "
    "newtons. max_von_mises_stress_mpa is the stress near the most heavily loaded spots, in megapascals "
    "(MPa): how hard the material inside is squeezed or pulled. average_youngs_modulus_gpa is the average "
    "stiffness given to the bone material, in gigapascals (GPa). bone_volume_cm3 is the volume of bone in "
    "the model, in cubic centimetres. illustrative_index_percent is an illustrative index from 0 to 100 "
    "that compares that stress with an assumed bone strength; it is not a medical measurement, and if you "
    "mention it, say that it is illustrative. "
    "Write 3 to 5 short sentences of plain English. Use the idea that a bone carries load the way a bridge "
    "does: a thinner or weaker bone carries the same load through less material, so that material is "
    "squeezed harder. "
    "Rules: use only numbers that appear in the JSON, written as digits, exactly as given or rounded to "
    "fewer decimals. Do not calculate any new number: no ratios, differences, percentages or unit "
    "conversions. Never write a number as a word, and do not use words for quantities or multiples (such "
    "as one, two, half, twice, double). "
    "Do not diagnose, predict, advise or recommend, and do not mention fracture, breaking, risk, chance, "
    "treatment, surgery, therapy or cancer. No markdown, lists or headings, at most 600 characters. "
    'Answer with JSON: {"text": "..."}.'
)


class ChainConfigError(ValueError):
    """AI_CHAIN or AI_OFFLINE names something the chain does not know."""


class ExplainRequest(BaseModel):
    """The SimulationResponse of one /api/simulate call. Numbers only reach a model: source_filename and
    the mesh counts are accepted so a response can be posted as it is, and are never sent."""

    model_config = ConfigDict(extra="ignore", strict=True, allow_inf_nan=False)

    max_von_mises_stress_mpa: float = Field(ge=0, le=1e6, description="Maximum Von Mises stress in MPa.")
    average_youngs_modulus_gpa: float = Field(ge=0, le=1e4, description="Mean Young's modulus in GPa.")
    bone_volume_cm3: float = Field(ge=0, le=1e5, description="Bone volume in cm³.")
    fracture_risk_index_percent: float = Field(
        ge=0, le=100, description="The simulation's illustrative index, 0 to 100 percent.")
    load_newtons: float = Field(default=800, ge=0, le=1e6, description="Applied compressive load.")
    mesh_vertices: Optional[int] = Field(default=None, ge=0, description="Not sent to any model.")
    mesh_faces: Optional[int] = Field(default=None, ge=0, description="Not sent to any model.")
    source_filename: Optional[str] = Field(default=None, max_length=512, description="Not sent to any model.")


class Fallback(BaseModel):
    provider: str
    reason: str


class ExplainResponse(BaseModel):
    text: str
    provider: Literal["gemini", "groq", "template"]
    model: Optional[str]
    fallbacks: list[Fallback]


# ----------------------------------------------------------------------------- environment and order
def chain_order(env: Mapping[str, str]) -> tuple[str, ...]:
    offline = env_value(env, "AI_OFFLINE")
    if offline not in (None, "0", "1"):
        raise ChainConfigError(f"AI_OFFLINE must be 0 or 1, got {offline!r}")
    raw = env_value(env, "AI_CHAIN")
    order: list[str] = []
    for part in (raw.split(",") if raw else DEFAULT_ORDER):
        name = part.strip().lower()
        if not name:
            continue
        if name not in PROVIDER_NAMES:
            raise ChainConfigError(f"AI_CHAIN: unknown provider {part.strip()!r}; known: "
                                   f"{', '.join(PROVIDER_NAMES)}")
        if name in order:
            raise ChainConfigError(f"AI_CHAIN: {name!r} is listed twice")
        if "template" in order:
            raise ChainConfigError(f"AI_CHAIN: {name!r} comes after 'template', which always answers")
        order.append(name)
    if "template" not in order:
        order.append("template")
    return ("template",) if offline == "1" else tuple(order)


# ----------------------------------------------------------------------------- facts
def _r(value: float) -> float:
    return round(float(value), DISPLAY_DECIMALS)


def build_facts(request: ExplainRequest) -> dict[str, float]:
    """The only model input: the request's numbers rounded to display precision.

    The index is passed under a neutral name so a model words it as illustrative, not as a fracture risk.
    """
    return {
        "load_newtons": _r(request.load_newtons),
        "max_von_mises_stress_mpa": _r(request.max_von_mises_stress_mpa),
        "average_youngs_modulus_gpa": _r(request.average_youngs_modulus_gpa),
        "bone_volume_cm3": _r(request.bone_volume_cm3),
        "illustrative_index_percent": _r(request.fracture_risk_index_percent),
    }


def facts_json(facts: Mapping[str, float]) -> str:
    return json.dumps(dict(facts), sort_keys=True, separators=(",", ":"))


# ----------------------------------------------------------------------------- checker
def _number_value(token: str) -> float:
    return abs(float(token.replace(",", "").replace("−", "-")))


def allowed_numbers(facts: Mapping[str, float]) -> set[float]:
    """Each fact's magnitude, and that magnitude rounded to 1 and 0 decimals."""
    out: set[float] = set()
    for value in facts.values():
        magnitude = abs(float(value))
        out.update(round(magnitude, d) for d in (0, 1, DISPLAY_DECIMALS))
    return out


def check(text: str, facts: Mapping[str, float]) -> Optional[str]:
    """None when `text` may be shown, else the reason it is rejected."""
    if not text.strip():
        return "empty text"
    if len(text) > MAX_CHARS:
        return f"over {MAX_CHARS} characters"
    allowed = allowed_numbers(facts)
    for match in NUMBER_RE.finditer(text):
        value = _number_value(match.group(0))
        if not any(math.isclose(value, a, rel_tol=1e-12, abs_tol=1e-9) for a in allowed):
            return f"number not in input: {match.group(0)}"
    word = _NUMBER_WORDS.search(text)
    if word:
        return f"spelled-out quantity: {word.group(0)!r}"
    for pattern in _BLOCKED:
        hit = pattern.search(text)
        if hit:
            return f"blocked wording: {hit.group(0)!r}"
    return None


# ----------------------------------------------------------------------------- template
def fmt(value: float) -> str:
    """Magnitude at reading precision: whole numbers (with thousands commas) from 100, 1 decimal from 10,
    else 2 decimals; trailing zeros dropped. Each is a fact rounded to 0, 1 or 2 decimals."""
    magnitude = abs(float(value))
    if magnitude >= 100 or magnitude.is_integer():
        return f"{magnitude:,.0f}"
    decimals = 1 if magnitude >= 10 else 2
    return f"{magnitude:.{decimals}f}".rstrip("0").rstrip(".")


def template_text(facts: Mapping[str, float]) -> str:
    """Deterministic wording of the facts. Every number it prints is a fact at template precision."""
    return " ".join([
        "A bone carries load the way a bridge does: the weight travels through its material, and a thinner "
        "or weaker bone carries the same weight through less material, so that material is squeezed harder.",
        f"In this computer model, {fmt(facts['bone_volume_cm3'])} cm³ of bone carried a load of "
        f"{fmt(facts['load_newtons'])} newtons.",
        f"Near its most heavily loaded spots, the stress inside it (how hard the material is squeezed or "
        f"pulled) reached {fmt(facts['max_von_mises_stress_mpa'])} MPa.",
        f"The bone material was given an average stiffness (Young's modulus) of "
        f"{fmt(facts['average_youngs_modulus_gpa'])} GPa.",
        f"The index of {fmt(facts['illustrative_index_percent'])}% is illustrative only: it compares that "
        f"stress with an assumed bone strength and is not a medical measurement.",
    ])


def _with_note(text: str) -> str:
    return f"{text}{'' if text.endswith(('.', '!', '?')) else '.'} {NOTE}"


# ----------------------------------------------------------------------------- chain
def build_providers(env: Mapping[str, str], transport: Optional["httpx.AsyncBaseTransport"] = None) -> dict:
    """Each chain name maps to the models it tries in turn: GEMINI_MODEL, then the fallback model."""
    gemini = [GeminiProvider(env, transport)]
    if gemini[0].model != GEMINI_FALLBACK_MODEL:
        gemini.append(GeminiProvider(env, transport, model=GEMINI_FALLBACK_MODEL))
    return {"gemini": gemini, "groq": [GroqProvider(env, transport)]}


_cooldown_until: dict[tuple[str, str], float] = {}


def reset_cooldowns() -> None:
    """Forget failures (tests, or after fixing a key)."""
    _cooldown_until.clear()


async def _attempt(provider, user: str, facts: Mapping[str, float]) -> tuple[Optional[str], Optional[str], bool]:
    """(text, reason, try_next_model). text is set when the provider's text passes check().

    try_next_model is true after an HTTP error status or a cooldown skip: the provider's next model (Gemini's
    fallback) may still answer. A timeout, a connection error or a rejected text leaves the provider.
    A call that fails (not a rejected text) puts this provider and model in a cooldown, so later
    requests skip it instead of waiting for the same timeout again.
    """
    key = (provider.name, provider.model)
    if time.monotonic() < _cooldown_until.get(key, 0.0):
        return None, f"skipped: failed less than {COOLDOWN_S:g} s ago", True
    try:
        text = await asyncio.wait_for(provider.generate(SYSTEM_PROMPT, user), timeout=provider.timeout)
    except Exception as exc:  # also an adapter bug: it must not break the chain; messages are not forwarded
        try_next = False
        if isinstance(exc, ProviderError):
            reason, try_next = exc.reason, exc.status is not None
        elif isinstance(exc, asyncio.TimeoutError):
            reason = f"timed out after {provider.timeout:g} s"
        else:
            reason = f"unexpected {type(exc).__name__}"
        _cooldown_until[key] = time.monotonic() + COOLDOWN_S
        return None, reason, try_next
    reason = check(text, facts)
    return (None, f"rejected: {reason}", False) if reason else (text, None, False)


async def explain(request: ExplainRequest, env: Optional[Mapping[str, str]] = None, *,
                  transport: Optional["httpx.AsyncBaseTransport"] = None,
                  providers: Optional[Mapping[str, list]] = None) -> ExplainResponse:
    """Word `request` with the first provider whose text passes check(); the template always does."""
    e = os.environ if env is None else env
    order = chain_order(e)
    facts = build_facts(request)
    tiers = dict(providers) if providers is not None else build_providers(e, transport)
    fallbacks: list[Fallback] = []
    for name in order:
        if name == "template":
            text = template_text(facts)
            reason = check(text, facts)
            if reason:  # correct by construction; a failure here is a bug in template_text
                raise RuntimeError(f"template failed the checker: {reason}")
            return ExplainResponse(text=_with_note(text), provider="template", model=None, fallbacks=fallbacks)
        models = tiers[name]
        if not models[0].configured:
            fallbacks.append(Fallback(provider=name, reason=f"{models[0].key_name} not set"))
            continue
        for provider in models:
            text, reason, try_next = await _attempt(provider, facts_json(facts), facts)
            if text is not None:
                return ExplainResponse(text=_with_note(text), provider=name, model=provider.model,
                                       fallbacks=fallbacks)
            log.warning("explain: %s %s fell through: %s", name, provider.model, reason)
            fallbacks.append(Fallback(provider=name, reason=f"{provider.model}: {reason}"))
            if not try_next:
                break
    raise RuntimeError("chain ended without the template")  # chain_order always appends it

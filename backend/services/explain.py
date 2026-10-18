"""Plain-language explanation of computed simulation results (POST /api/explain).

The request carries the numbers /api/simulate computed (the SimulationResponse
fields), or a case_id instead: for "Pat001" the numbers are read from the
femur model's manifest in Vultr Object Storage
(clinical/hfvalid/pat001-femur-manifest.json, de-identified public research
data, HFValid, CC BY 4.0), checked against its pinned sha256 by
services.clinical_store, with the bundled frontend/public copy as backup; the
response's `grounding` says which was used.

No model computes a number: models only word the facts built here, and
check() rejects any text that uses a number which is not a fact (or a fact
rounded to 1 or 0 decimals), spells a quantity out, uses a word from
BLOCKED_OUTPUT_PATTERNS, reads a JSON field name aloud, or runs too long. A
lone number word right before its unit, whose value is a fact ("seventeen GPa"
when 17 is one), is read as that number, not rejected.

Providers are tried in order. AI_CHAIN sets it (comma list of gemini, groq,
template; default gemini,groq,template; template is appended when missing).
AI_OFFLINE=1 uses the template only. A provider that has no key, fails, times
out or is rejected falls through to the next, and the reason is reported in
`fallbacks`. When GEMINI_MODEL answers with an HTTP error (such as 429) or is
cooling down, gemini-3.5-flash-lite is tried before leaving Gemini. A model
whose call failed is skipped for 60 s, or for 300 s after HTTP 429, by this
route and /api/risk-analysis alike (services.llm_providers). Each Gemini model
is asked with every key in GEMINI_API_KEY and GEMINI_API_KEYS before the next
one, and when none answers, the Gemini answer saved for the same facts is
served (served="saved", with its model and saved_at) before Groq. The template is
deterministic, needs no network and passes check() for every valid request.

Answers are kept in memory per case_id, grounding store, facts and chain: a
Gemini answer for 1 h, a Groq or template answer for 60 s (so Gemini is asked
again), and concurrent equal requests share one chain run. Reloading the page
spends no model call. Each answer the chain produces is logged once in Tiger
Cloud (services.ai_log); a kept answer is not logged again and keeps the
`logged` id of its row. An answer whose row was not written is kept for at most
60 s, so a later one is logged.

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

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from services import ai_log
from services.ai_log import Logged
from services.clinical_store import ClinicalDataUnavailable, Grounding, get_clinical_json

from services.llm_providers import (FAILURE_COOLDOWN_S, GEMINI_FALLBACK_MODEL, AnswerCache, GeminiProvider,
                                    GroqProvider, answer_ttl, ask_models, chain_signature, env_value)
from services.llm_providers import reset_cooldowns as reset_provider_cooldowns
from services.settings import runtime_env  # noqa: F401 - routes_explain depends on it from here

if TYPE_CHECKING:  # pragma: no cover
    import httpx

log = logging.getLogger("rainbowbone.explain")

PROVIDER_NAMES: tuple[str, ...] = ("gemini", "groq", "template")
DEFAULT_ORDER: tuple[str, ...] = PROVIDER_NAMES
DISPLAY_DECIMALS = 2
COOLDOWN_S = FAILURE_COOLDOWN_S
MAX_CHARS = 700  # the prompt asks for 600; the template's longest text stays below this
NOTE = "Illustrative engineering simulation with assumed material properties, not a medical assessment."

# Wording lists from the team's AI contract (HackTheValley11 contracts/labels.json, "ai"), plus words that
# judge what the load does to this bone (break, fail, safe, ...).
BLOCKED_OUTPUT_PATTERNS: tuple[str, ...] = (
    "diagnos", "predict", "recommend", "should", "surg", "treat", "therap", r"respon(se|ding|d)\b",
    "likely", "probab", "chance", r"\brisk", "cancer", "metasta", "prognos", "urgent", "fractur",
    r"\bbr(?:eak|oke|eaking)", r"\bcrack", r"\bfail", r"\bsafe", r"\bdanger", r"\bhealth", "osteopor",
    r"\bpatient", r"\bdoctor", "withstand",
)
_UNITS = ("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
          "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen")
_TENS = ("twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")
_SCALES = ("hundred", "thousand", "million", "billion", "trillion", "dozen")
# Each of these also matches its plural and -fold form ("hundreds", "tenfold").
NUMBER_WORDS: tuple[str, ...] = _UNITS + _TENS + _SCALES
OTHER_QUANTITY_WORDS: tuple[str, ...] = (
    "half", "halves", "halved", "third", "thirds", "quarter", "quarters", "double", "doubled", "twice",
    "triple", "tripled", "quadruple", "quadrupled",
)

# A number is a run of digits, optionally with a leading or inner point (".5", "17.71") and thousands
# separators ("10,000" is one number). A digit run after letters is a number too ("x40", "15mm" reads 15),
# except a unit exponent: the 2 or 3 of cm3, mm2, m3 (optionally cm^3).
NUMBER_RE = re.compile(r"(?<!\d)[-−]?(?:\.\d+|(?:\d{1,3}(?:,\d{3})+(?!\d)|\d+)(?:\.\d+)?)")
_UNIT_EXPONENT_BEFORE = re.compile(r"(?<![A-Za-z])(?:cm|mm|m)\^?$", re.IGNORECASE)
_BLOCKED = tuple(re.compile(p, re.IGNORECASE) for p in BLOCKED_OUTPUT_PATTERNS)
_NUMBER_WORDS = re.compile(
    r"\b(?:(?:" + "|".join(sorted(NUMBER_WORDS, key=len, reverse=True)) + r")(?:s|fold)?|"
    + "|".join(sorted(OTHER_QUANTITY_WORDS, key=len, reverse=True)) + r")\b",
    re.IGNORECASE)
# The value of each lone number word ("four" is 4). Scales, plurals, -fold and OTHER_QUANTITY_WORDS have none.
_WORD_VALUES: dict[str, int] = {**{w: i for i, w in enumerate(_UNITS)}, **{w: 20 + 10 * i for i, w in enumerate(_TENS)}}
# A number word joined to the next one ("twenty-two", "one hundred", "three quarters") or to "-fold" is never read as
# one number.
_JOINED_TO_NEXT = re.compile(r"[\s-]+" + _NUMBER_WORDS.pattern + r"|-fold\b", re.IGNORECASE)
# A unit right after a number word ("seventeen GPa", "zero percent"). Only then is the word read as its digits: without
# a unit it is a count or a multiple that no fact holds ("ten times below", "ten bags of sugar").
_UNIT_AFTER_WORD = re.compile(r"\s*(?:%|per\s?cent\b|MPa\b|megapascals?\b|GPa\b|gigapascals?\b|(?-i:N)\b|newtons?\b|"
                              r"cm3|cm³|cubic\b)", re.IGNORECASE)
# The fact a number with a unit after it must be: "10%" is not the 10 GPa stiffness, "16 MPa" not a rounded volume.
_UNIT_FACT: tuple[tuple[re.Pattern, str], ...] = (
    (re.compile(r"\s*(?:%|per\s?cent\b)", re.IGNORECASE), "stress_to_strength_percent"),
    (re.compile(r"\s*(?:MPa\b|megapascals?\b)", re.IGNORECASE), "max_von_mises_stress_mpa"),
    (re.compile(r"\s*(?:GPa\b|gigapascals?\b)", re.IGNORECASE), "average_youngs_modulus_gpa"),
    (re.compile(r"\s*(?:N\b|[Nn]ewtons?\b)"), "load_newtons"),
    (re.compile(r"\s*(?:cm3|cm\u00b3|cm\^3|cubic\b)", re.IGNORECASE), "bone_volume_cm3"),
)
# The facts' JSON field names read aloud ("an average youngs modulus gpa of 10.0"), which a model has written as text.
_ECHOED_KEYS = re.compile(r"\b(?:" + "|".join(k.replace("_", r"[\s_]+") for k in (
    "average_youngs_modulus_gpa", "youngs_modulus_gpa", "max_von_mises_stress_mpa", "von_mises_stress_mpa",
    "stress_to_strength_percent", "bone_volume_cm3", "load_newtons")) + r")\b", re.IGNORECASE)

SYSTEM_PROMPT = (
    "You explain the result of one engineering computer simulation of a bone to a reader with no "
    "engineering or medical background, such as a banker or a hospital manager. The user message is JSON "
    "holding every number our software computed. load_newtons is the force applied to the bone, in "
    "newtons. max_von_mises_stress_mpa is the stress near the most heavily loaded spots, in megapascals "
    "(MPa): how hard the material inside is squeezed or pulled. average_youngs_modulus_gpa is the average "
    "stiffness given to the bone material, in gigapascals (GPa). bone_volume_cm3 is the volume of bone in "
    "the model, in cubic centimetres. stress_to_strength_percent is that stress as a percent of the strength "
    "the model assumes for bone material: the stress-to-strength ratio, an illustrative engineering number "
    "and not a medical measurement; if you mention it, call it the stress-to-strength ratio and say that it "
    "is illustrative. "
    "Write 3 to 5 short sentences of plain English. Use the idea that a bone carries load the way a bridge "
    "does: a thinner or weaker bone carries the same load through less material, so that material is "
    "squeezed harder. "
    "Rules: use only numbers that appear in the JSON, written as digits (800, never eight hundred), exactly "
    "as given or rounded to fewer decimals. Do not calculate any new number: no ratios, differences, "
    "percentages or unit conversions. Never write a number as a word, and do not use words for quantities "
    "or multiples (such as zero, one, two, half, twice, double), not even 'one' in a phrase such as 'one of'. "
    "Do not diagnose, predict, advise or recommend, and do not mention fracture, breaking, cracking, failure, "
    "risk, chance, safety, danger, health, patients, doctors, what bone can withstand, treatment, surgery, "
    "therapy or cancer. No markdown, lists or headings, at most 600 characters. "
    'Answer with JSON: {"text": "..."}.'
)


class ChainConfigError(ValueError):
    """AI_CHAIN or AI_OFFLINE names something the chain does not know."""


class UnknownCase(KeyError):
    """No femur model is published for this case_id."""


class CaseDataUnavailable(RuntimeError):
    """The femur model's manifest could not be read from the bucket nor from the bundled copy, or is malformed."""


# The case ids whose femur model manifest services.clinical_store serves, and its catalogue name.
FEMUR_CASES = {"Pat001": "pat001-femur-manifest"}
ASSUMED_STRENGTH_MPA = 150.0  # services.fea_solver.ASSUMED_STRENGTH_MPA; the index is stress / strength x 100
REQUIRED_NUMBERS = ("max_von_mises_stress_mpa", "average_youngs_modulus_gpa", "bone_volume_cm3",
                    "fracture_risk_index_percent")


class ExplainRequest(BaseModel):
    """The SimulationResponse of one /api/simulate call, or a case_id whose numbers the API reads itself.
    Numbers only reach a model: source_filename and the mesh counts are accepted so a response can be posted
    as it is, and are never sent."""

    model_config = ConfigDict(extra="ignore", strict=True, allow_inf_nan=False)

    max_von_mises_stress_mpa: Optional[float] = Field(default=None, ge=0, le=1e6,
                                                      description="Maximum Von Mises stress in MPa.")
    average_youngs_modulus_gpa: Optional[float] = Field(default=None, ge=0, le=1e4,
                                                        description="Mean Young's modulus in GPa.")
    bone_volume_cm3: Optional[float] = Field(default=None, ge=0, le=1e5, description="Bone volume in cm³.")
    fracture_risk_index_percent: Optional[float] = Field(
        default=None, ge=0, le=100, description="The simulation's illustrative index, 0 to 100 percent.")
    load_newtons: float = Field(default=800, ge=0, le=1e6, description="Applied compressive load.")
    mesh_vertices: Optional[int] = Field(default=None, ge=0, description="Not sent to any model.")
    mesh_faces: Optional[int] = Field(default=None, ge=0, description="Not sent to any model.")
    source_filename: Optional[str] = Field(default=None, max_length=512, description="Not sent to any model.")
    case_id: Optional[str] = Field(
        default=None, min_length=1, max_length=32,
        description="A case whose femur model the API reads from object storage, such as Pat001. Its numbers are "
                    "used instead of any sent with it.")

    @model_validator(mode="after")
    def _numbers_or_case(self) -> "ExplainRequest":
        missing = [name for name in REQUIRED_NUMBERS if getattr(self, name) is None]
        if self.case_id is None and missing:
            raise ValueError("send case_id, or every one of " + ", ".join(missing))
        return self


class Fallback(BaseModel):
    provider: str
    reason: str


class ExplainResponse(BaseModel):
    text: str
    provider: Literal["gemini", "groq", "template"]
    model: Optional[str]
    served: Literal["live", "cached", "saved"] = Field(
        default="live", description="live: written for this request; cached: kept in memory from an earlier one; "
                                    "saved: no Gemini model answered, so this is the Gemini answer saved earlier for "
                                    "the same facts, written by `model` at `saved_at`.")
    saved_at: Optional[str] = Field(default=None, description="When a saved answer was written (ISO 8601, UTC).")
    fallbacks: list[Fallback]
    grounding: Optional[Grounding] = Field(default=None, description="Where the numbers were read from; null when "
                                                                     "they came in the request.")
    logged: Optional[Logged] = Field(default=None, description="The Tiger Cloud row of this answer; null when "
                                                               "DATABASE_URL is unset or the write failed.")


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

    The index is passed as stress_to_strength_percent, what it is (peak stress / assumed strength x 100), so a
    model words it as an illustrative ratio, not as a fracture risk. The request keeps its field name.
    """
    return {
        "load_newtons": _r(request.load_newtons),
        "max_von_mises_stress_mpa": _r(request.max_von_mises_stress_mpa),
        "average_youngs_modulus_gpa": _r(request.average_youngs_modulus_gpa),
        "bone_volume_cm3": _r(request.bone_volume_cm3),
        "stress_to_strength_percent": _r(request.fracture_risk_index_percent),
    }


def request_for_case(case_id: str, env: Mapping[str, str]) -> tuple[ExplainRequest, Grounding]:
    """The numbers of `case_id`'s femur model, read from its manifest in the bucket (or the bundled copy), as the
    dashboard sends them (frontend/lib/model.ts FEMUR_EXPLAIN_REQUEST): the nodal-averaged peak stress the 3D
    colours show, and the index from it. Raises UnknownCase or CaseDataUnavailable."""
    name = FEMUR_CASES.get(case_id)
    if name is None:
        raise UnknownCase(case_id)
    try:
        manifest, grounding = get_clinical_json(name, env)
        if manifest["case_id"] != case_id:
            raise ValueError("another case")
        metrics = manifest["metrics"]
        stress = float(metrics["max_nodal_von_mises_mpa"])
        request = ExplainRequest(
            load_newtons=float(metrics["load_newtons"]),
            max_von_mises_stress_mpa=stress,
            average_youngs_modulus_gpa=float(metrics["youngs_modulus_mpa"]) / 1000.0,
            bone_volume_cm3=float(metrics["volume_cm3"]),
            fracture_risk_index_percent=min(100.0, max(0.0, stress / ASSUMED_STRENGTH_MPA * 100.0)),
        )
    except ClinicalDataUnavailable:
        raise CaseDataUnavailable(f"the femur model of {case_id} is not available") from None
    except (KeyError, TypeError, ValueError, ValidationError) as exc:
        raise CaseDataUnavailable(f"the femur model of {case_id} is not usable ({type(exc).__name__})") from None
    return request, grounding


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


def spelled_numbers_as_digits(text: str, allowed: set[float]) -> str:
    """`text` with each lone number word ("zero" to "ninety") that comes right before its unit and whose value is in
    `allowed` written as digits, so the number checks read it like the fact it is. Other number and quantity words
    are left for check() to refuse: one without a unit after it, one not in `allowed`, a plural or -fold form, a
    scale (hundred), or one joined to the next ("twenty-two")."""
    def digits(match: re.Match) -> str:
        word = match.group(0)
        value = _WORD_VALUES.get(word.lower())
        if value is None or _JOINED_TO_NEXT.match(text, match.end()) or not _UNIT_AFTER_WORD.match(text, match.end()):
            return word
        return str(value) if any(math.isclose(value, a, abs_tol=1e-9) for a in allowed) else word
    return _NUMBER_WORDS.sub(digits, text)


def check(text: str, facts: Mapping[str, float]) -> Optional[str]:
    """None when `text` may be shown, else the reason it is rejected."""
    if not text.strip():
        return "empty text"
    if len(text) > MAX_CHARS:
        return f"over {MAX_CHARS} characters"
    allowed = allowed_numbers(facts)
    scan = spelled_numbers_as_digits(text, allowed)
    for match in NUMBER_RE.finditer(scan):
        if match.group(0) in ("2", "3") and _UNIT_EXPONENT_BEFORE.search(scan, 0, match.start()):
            continue
        value = _number_value(match.group(0))
        if not any(math.isclose(value, a, rel_tol=1e-12, abs_tol=1e-9) for a in allowed):
            return f"number not in input: {match.group(0)}"
        for unit, key in _UNIT_FACT:
            if unit.match(scan, match.end()):
                if key in facts and not any(math.isclose(value, a, rel_tol=1e-12, abs_tol=1e-9)
                                            for a in allowed_numbers({key: facts[key]})):
                    return f"not the {key} in the input: {match.group(0)}"
                break
    word = _NUMBER_WORDS.search(scan)
    if word:
        return f"spelled-out quantity: {word.group(0)!r}"
    for pattern in _BLOCKED:
        hit = pattern.search(scan)
        if hit:
            return f"blocked wording: {hit.group(0)!r}"
    hit = _ECHOED_KEYS.search(scan)
    if hit:
        return f"field name: {hit.group(0)!r}"
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
        f"That stress is {fmt(facts['stress_to_strength_percent'])}% of the strength assumed for bone material: "
        f"an illustrative stress-to-strength ratio, not a medical measurement.",
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


_answers = AnswerCache()


def reset_cooldowns() -> None:
    """Forget failed calls and kept answers (tests, or after fixing a key)."""
    reset_provider_cooldowns()
    _answers.clear()


async def explain(request: ExplainRequest, env: Optional[Mapping[str, str]] = None, *,
                  transport: Optional["httpx.AsyncBaseTransport"] = None,
                  providers: Optional[Mapping[str, list]] = None) -> ExplainResponse:
    """Word `request` with the first provider whose text passes check(); the template always does.

    With a case_id the numbers are read from its femur model (`grounding`) instead of the request. An answer
    is kept per case_id, store, facts and chain (see the module docstring), so an equal request reuses it."""
    started = time.perf_counter()
    e = os.environ if env is None else env
    order = chain_order(e)
    case_id, grounding = request.case_id, None
    if case_id is not None:
        request, grounding = await asyncio.to_thread(request_for_case, case_id, e)
    facts = build_facts(request)
    tiers = dict(providers) if providers is not None else build_providers(e, transport)

    async def produce() -> ExplainResponse:
        answer = await _run_chain(order, facts, tiers)
        logged = await ai_log.log_answer(e, "explain", case_id, answer, facts_json(facts), started, grounding)
        return answer.model_copy(update={"grounding": grounding, "logged": logged})

    # Kept per case and store too, so the ai_analyses row an answer points to records where its facts came from.
    key = (case_id, grounding and grounding.store, facts_json(facts), chain_signature(order, tiers))
    answer = await _answers.get_or_compute(
        key, produce, lambda answer: ai_log.kept_for(answer_ttl(answer.provider), answer.logged, e))
    # A kept answer shows this request's reason for a fallback (the store is the same, or it would not be kept).
    return answer if answer.grounding == grounding else answer.model_copy(update={"grounding": grounding})


async def _run_chain(order: tuple[str, ...], facts: Mapping[str, float], tiers: Mapping[str, list]) -> ExplainResponse:
    fallbacks: list[Fallback] = []
    for name in order:
        if name == "template":
            text = template_text(facts)
            reason = check(text, facts)
            if reason:  # correct by construction; a failure here is a bug in template_text
                raise RuntimeError(f"template failed the checker: {reason}")
            return ExplainResponse(text=_with_note(text), provider="template", model=None, fallbacks=fallbacks)

        def fell_through(model: Optional[str], reason: str, name: str = name) -> None:
            if model is not None:
                log.warning("explain: %s %s fell through: %s", name, model, reason)
            fallbacks.append(Fallback(provider=name, reason=reason if model is None else f"{model}: {reason}"))

        answer = await ask_models(tiers[name], SYSTEM_PROMPT, facts_json(facts), lambda t: check(t, facts),
                                  fell_through, kind="explain", facts=facts_json(facts))
        if answer is not None:
            return ExplainResponse(text=_with_note(answer.text), provider=name, model=answer.model,
                                   served=answer.served, saved_at=answer.saved_at, fallbacks=fallbacks)
    raise RuntimeError("chain ended without the template")  # chain_order always appends it

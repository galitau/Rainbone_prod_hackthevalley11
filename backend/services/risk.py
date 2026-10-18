"""AI fracture risk analysis of one HFValid femur (POST /api/risk-analysis).

The numbers come from the HFValid collection (Aldieri, La Mattina, Szyszko,
Baruffaldi, Viceconti 2025, University of Bologna, CC BY 4.0), read from
public/models/hfvalid-risk.json: each subject's ARF0 and MSF as computed by the
dataset authors' finite-element model, and the recorded follow-up.
Sideways-fall forces are van den Kroonenberg et al. 1995 (PubMed 8618384).

build_facts() computes every number a model may use: the subject's place among
the cohort, the factor of risk (fall force / MSF) and the cohort figures. No
model computes a number. check() rejects text that uses a number which is not a
fact (or a fact rounded to fewer decimals), spells a quantity out, predicts a
time, calls ARF0 a chance or probability, diagnoses or advises. A rejected or
failed provider falls through to the next, and finally to a deterministic
template built only from the facts.

The chain order, providers, timeouts and fallback reasons are the ones
POST /api/explain uses (AI_CHAIN, AI_OFFLINE, GEMINI_*, GROQ_*).
"""
from __future__ import annotations

import asyncio
import json
import logging
import math
import os
import re
import statistics
import time
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal, Mapping, Optional

from pydantic import BaseModel, ConfigDict, Field

from services.explain import (_NUMBER_WORDS, COOLDOWN_S, NUMBER_RE, Fallback, _number_value, build_providers,
                              chain_order)
from services.llm_providers import ProviderError

if TYPE_CHECKING:  # pragma: no cover
    import httpx

log = logging.getLogger("rainbowbone.risk")

DATA_PATH = Path(__file__).resolve().parents[2] / "public" / "models" / "hfvalid-risk.json"
MAX_CHARS = 1000  # the prompt asks for 850; the template's longest text stays below this
NOTE = "Published research data, not a diagnosis or medical advice."

# Named terms whose digits are not quantities: the dataset's ARF0 ("Absolute Risk of Fracture at time 0").
_NAMED_TERMS = re.compile(r"\bARF0\b|\btime 0\b", re.IGNORECASE)
# A number followed by a time unit ("5 years", "78-year-old", "1,529 days").
_TIME_UNIT_AFTER = re.compile(r"\s*-?\s*(day|week|month|year|yr|decade)s?\b", re.IGNORECASE)
# Time horizons without a number ("next year", "within a decade", "lifetime").
TIME_PATTERNS: tuple[str, ...] = (
    r"\b(?:next|coming|following|upcoming)\s+(?:\w+\s+)?(?:days?|weeks?|months?|years?|decades?)\b",
    r"\b(?:per|each|every|a|an)\s+(?:day|week|month|year|decade)\b",
    r"\b(?:few|several|many|some)\s+(?:days|weeks|months|years|decades)\b",
    r"\bannual", r"\blifetime\b", r"\byears?\s+to\s+come\b", r"\bin\s+the\s+future\b", r"\bsoon\b",
)
# Diagnosis, treatment, advice, probabilities and certainty. Fracture, risk, break and fall are allowed.
BLOCKED_OUTPUT_PATTERNS: tuple[str, ...] = (
    "diagnos", "osteopor", "osteopen", r"\bprognos", r"\btreat", r"\btherap", r"\bsurg", r"\bprescri",
    r"\bmedicat", r"\bdrugs?\b", r"\bsupplement", r"\bvitamin", r"\bcalcium", r"\bexercis", r"\bshould\b",
    r"\bmust\b", r"\bought\b", r"\brecommend", r"\badvi[cs]", r"\bconsult", r"\bdoctor", r"\bphysician",
    r"\bclinician", r"\bspecialist", r"\byour?\b", r"\bchance", r"\bprobab", r"\bodds\b", r"\bcertain",
    r"\bdefinitely\b", r"\bguarantee", r"\binevitabl", r"\bwill\s+(?:\w+\s+)?(?:break|fractur|fail|crack|snap)",
    r"\bcancer", r"\bmetasta", r"\btumou?r",
)
_TIME = tuple(re.compile(p, re.IGNORECASE) for p in TIME_PATTERNS)
_BLOCKED = tuple(re.compile(p, re.IGNORECASE) for p in BLOCKED_OUTPUT_PATTERNS)
# The direction of the two ranks. arf0_higher_than women had a lower ARF0 than this femur; msf_lower_than women had a
# stronger femur (higher MSF). "stronger than 75 women" with msf_lower_than 75 states the opposite of the data.
_UP = frozenset({"higher", "greater", "larger", "bigger", "stronger"})
_DOWN = frozenset({"lower", "smaller", "less", "weaker"})
_CMP = "|".join(sorted(_UP | _DOWN))
_COUNT = r"(\d{1,3}(?:,\d{3})+(?!\d)|\d+)"  # a whole number, with or without thousands commas
# This femur against N women: "higher than 56", "a stronger femur than 75 women".
_SUBJECT_VS_N = re.compile(r"\b(" + _CMP + r")\b(?:\s+[\w-]+){0,3}?\s+than\s+(?:those\s+of\s+|that\s+of\s+)?" + _COUNT,
                           re.IGNORECASE)
# N women against this femur: "75 women had a stronger femur", "56 of the 101 women in the study had a lower ARF0".
_N_VS_SUBJECT = re.compile(r"(?<![\d.,])" + _COUNT + r"\s+(?:of\s+the\s+\d[\d,]*\s+|other\s+)*women\b"
                           r"(?:\s+(?:in|the|study|cohort|had|have|has|with|a|an))*\s+(" + _CMP + r")\b", re.IGNORECASE)

SYSTEM_PROMPT = (
    "You explain to a reader with no medical or engineering background how likely one real thigh bone "
    "(femur) is to break, using only published research data about it. The user message is JSON. The femur "
    "belongs to one of cohort_n women in the HFValid study by Aldieri, La Mattina, Szyszko, Baruffaldi and "
    "Viceconti (University of Bologna), who CT-scanned each woman's femur and followed whether she later "
    "had a hip fracture. Fields: age is the woman's age at the CT scan. arf0_percent is her ARF0, the "
    "Absolute Risk of Fracture that the study authors estimated with their finite-element model "
    "of this femur coupled with a model of falling; arf0_higher_than is how many women in the study had a "
    "lower ARF0; cohort_median_arf0_percent is the study's median ARF0; cohort_fractured women had a hip "
    "fracture during the follow-up, and their ARF0 ranged from fractured_arf0_min_percent to "
    "fractured_arf0_max_percent. msf_newtons is her Minimum Sidefall Strength (MSF): the smallest sideways-"
    "fall force, over many simulated fall directions, that the authors' model says would break this femur; "
    "msf_lower_than is how many women in the study had a stronger femur (a higher MSF), so this femur is "
    "weaker than that many women: write it as 'weaker than N of the cohort_n women' or 'N of the cohort_n "
    "women had a stronger femur', never 'stronger than N'. fall_force_low_newtons and "
    "fall_force_high_newtons are the peak force on the side of the hip in a sideways fall for a small and "
    "a large woman (van den Kroonenberg and colleagues). factor_of_risk_low and factor_of_risk_high are "
    "those forces divided by msf_newtons: the fall would load the femur that many times its estimated "
    "strength. fractured_within_followup says whether this woman had a hip fracture during the study's "
    "follow-up, and days_ct_to_fracture is then the days from the CT scan to the fracture. fe, when not "
    "null, is a different and simpler simulation of ours: a standing load of fe.load_newtons newtons gave "
    "a peak stress of fe.peak_stress_mpa MPa, and fe.stress_index_percent compares that stress with an "
    "assumed bone strength; it does not use a fall or the study's model, so it is not comparable with ARF0. "
    "Write 4 to 6 short plain sentences on how likely this femur is to break and why: where its ARF0 sits "
    "among the women in the study (for example 'higher than N of the cohort_n women'), what its sideways-"
    "fall strength compared with typical fall forces means ('a sideways fall would load it X to Y times "
    "its estimated strength'), the outcome actually recorded in the follow-up, and, when fe is not null, "
    "that the stress index shown above is a different, simpler measure. Credit ARF0 and MSF to the HFValid "
    "study authors' finite-element model. "
    "Rules: use only numbers that appear in the JSON, written as digits, exactly as given or rounded to "
    "fewer decimals. Do not calculate any new number: no differences, shares of the cohort, or unit "
    "conversions such as kN. Never write a number as a word, and do not use words for quantities or "
    "multiples (such as one, two, half, twice, double). Write ARF0 as ARF0 and do not expand it. Name "
    "sources without years. Do not call ARF0 a chance, probability or odds, do not attach a time period to "
    "it, and do not predict when a fracture could happen (no 'within N years', 'next year', 'lifetime'); "
    "the follow-up is a record of what happened. Do not diagnose or name a disease, and do not give advice, "
    "treatment, medication, exercise or prescriptions or suggest seeing a doctor. Write about 'this femur' "
    "and 'this woman'; never address the reader as 'you'. No markdown, lists or headings, at most 850 "
    "characters. "
    'Answer with JSON: {"text": "..."}.'
)


class RiskDataUnavailable(RuntimeError):
    """public/models/hfvalid-risk.json is missing or unreadable."""


class UnknownCase(KeyError):
    """The case_id is not a subject of the dataset."""


class FeInput(BaseModel):
    """Our own standing-load FE numbers for the femur on screen (the dashboard's Clinical metrics)."""

    model_config = ConfigDict(extra="ignore", strict=True, allow_inf_nan=False)

    peak_stress_mpa: float = Field(ge=0, le=1e6, description="Peak von Mises stress of the standing-load solve.")
    load_newtons: float = Field(ge=0, le=1e6, description="Standing load of that solve.")
    stress_index_percent: float = Field(ge=0, le=100, description="Peak stress / assumed strength x 100.")


class RiskRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", strict=True, allow_inf_nan=False)

    case_id: str = Field(min_length=1, max_length=32, description="HFValid subject, such as Pat001.")
    fe: Optional[FeInput] = None


class RiskFacts(BaseModel):
    """Every number the card and the text may show. Percents have 1 decimal, forces are whole newtons."""

    age: int
    arf0_percent: float
    arf0_higher_than: int = Field(description="Subjects with a lower ARF0.")
    cohort_n: int
    cohort_median_arf0_percent: float
    cohort_fractured: int
    fractured_arf0_min_percent: Optional[float]
    fractured_arf0_max_percent: Optional[float]
    msf_newtons: int
    msf_lower_than: int = Field(description="Subjects with a higher MSF (a stronger femur).")
    fall_force_low_newtons: int
    fall_force_high_newtons: int
    factor_of_risk_low: float = Field(description="fall_force_low_newtons / MSF, 2 decimals.")
    factor_of_risk_high: float = Field(description="fall_force_high_newtons / MSF, 2 decimals.")
    fractured_within_followup: bool
    days_ct_to_fracture: Optional[int]
    fe: Optional[FeInput]


class RiskSource(BaseModel):
    citation: str
    doi: str
    license: str


class RiskResponse(BaseModel):
    case_id: str
    facts: RiskFacts
    text: str
    provider: Literal["gemini", "groq", "template"]
    model: Optional[str]
    fallbacks: list[Fallback]
    source: RiskSource


# ----------------------------------------------------------------------------- data
@lru_cache(maxsize=4)
def _load(path: Path, mtime_ns: int) -> dict:
    """The file at `path`, checked for the fields build_facts() reads (cached per modification time)."""
    with path.open(encoding="utf-8") as handle:
        data = json.load(handle)
    subjects = data["subjects"]
    if not isinstance(subjects, dict) or not subjects:
        raise ValueError("no subjects")
    for subject in subjects.values():
        values = (float(subject["age"]), float(subject["arf0_percent"]), float(subject["msf_newtons"]))
        if not all(math.isfinite(v) for v in values) or values[2] <= 0:
            raise ValueError("bad subject")
        if not isinstance(subject["fractured_within_followup"], bool):
            raise ValueError("bad fracture status")
    forces = (float(data["fall_force"]["low_newtons"]), float(data["fall_force"]["high_newtons"]))
    if not all(math.isfinite(v) and v > 0 for v in forces):
        raise ValueError("bad fall force")
    if not all(isinstance(data["source"][k], str) for k in ("citation", "doi", "license")):
        raise ValueError("bad source")
    return data


def load_dataset(path: Optional[Path] = None) -> dict:
    """The parsed dataset, re-read when the file changes. Raises RiskDataUnavailable."""
    p = path or DATA_PATH
    try:
        return _load(p, p.stat().st_mtime_ns)
    except (OSError, ValueError, KeyError, TypeError, AttributeError) as exc:
        raise RiskDataUnavailable(f"fracture risk data is not available ({type(exc).__name__})") from None


def build_facts(data: Mapping[str, Any], case_id: str, fe: Optional[FeInput] = None) -> RiskFacts:
    subjects = data["subjects"]
    if case_id not in subjects:
        raise UnknownCase(case_id)
    me = subjects[case_id]
    arf0 = [float(s["arf0_percent"]) for s in subjects.values()]
    msf = [float(s["msf_newtons"]) for s in subjects.values()]
    fractured_arf0 = [float(s["arf0_percent"]) for s in subjects.values() if s["fractured_within_followup"]]
    my_arf0, my_msf = float(me["arf0_percent"]), float(me["msf_newtons"])
    low, high = float(data["fall_force"]["low_newtons"]), float(data["fall_force"]["high_newtons"])
    days = me.get("days_ct_to_fracture")
    return RiskFacts(
        age=round(float(me["age"])),
        arf0_percent=round(my_arf0, 1),
        arf0_higher_than=sum(1 for v in arf0 if v < my_arf0),
        cohort_n=len(subjects),
        cohort_median_arf0_percent=round(statistics.median(arf0), 1),
        cohort_fractured=len(fractured_arf0),
        fractured_arf0_min_percent=round(min(fractured_arf0), 1) if fractured_arf0 else None,
        fractured_arf0_max_percent=round(max(fractured_arf0), 1) if fractured_arf0 else None,
        msf_newtons=round(my_msf),
        msf_lower_than=sum(1 for v in msf if v > my_msf),
        fall_force_low_newtons=round(low),
        fall_force_high_newtons=round(high),
        factor_of_risk_low=round(low / my_msf, 2),
        factor_of_risk_high=round(high / my_msf, 2),
        fractured_within_followup=bool(me["fractured_within_followup"]),
        days_ct_to_fracture=None if days is None else round(float(days)),
        fe=None if fe is None else FeInput(peak_stress_mpa=round(fe.peak_stress_mpa, 2),
                                           load_newtons=round(fe.load_newtons, 2),
                                           stress_index_percent=round(fe.stress_index_percent, 2)),
    )


def facts_json(facts: RiskFacts) -> str:
    return json.dumps(facts.model_dump(), sort_keys=True, separators=(",", ":"))


# ----------------------------------------------------------------------------- checker
def _fact_numbers(value: Any) -> list[float]:
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return []
    if isinstance(value, Mapping):
        return [n for v in value.values() for n in _fact_numbers(v)]
    return [abs(float(value))]


def allowed_numbers(facts: RiskFacts) -> set[float]:
    """Each numeric fact's magnitude, and that magnitude rounded to 0, 1 and 2 decimals."""
    return {round(n, d) for n in _fact_numbers(facts.model_dump()) for d in (0, 1, 2)}


def _time_number_ok(value: float, unit: str, facts: RiskFacts) -> bool:
    """A number with a time unit is only the woman's age in years or the recorded days to her fracture."""
    unit = unit.lower()
    if unit in ("year", "yr"):
        return math.isclose(value, facts.age)
    if unit == "day":
        return facts.days_ct_to_fracture is not None and math.isclose(value, facts.days_ct_to_fracture)
    return False


def _wrong_direction(scan: str, facts: RiskFacts) -> Optional[str]:
    """The first phrase that compares this femur with a rank count in the wrong direction, if any. Skipped when the
    two counts are equal, since the number then cannot tell which rank is meant."""
    higher, lower = facts.arf0_higher_than, facts.msf_lower_than
    if higher == lower:
        return None
    # (pattern, comparatives allowed with arf0_higher_than, comparatives allowed with msf_lower_than)
    for pattern, arf0_ok, msf_ok in ((_SUBJECT_VS_N, _UP - {"stronger"}, _DOWN),
                                     (_N_VS_SUBJECT, _DOWN - {"weaker"}, _UP)):
        for match in pattern.finditer(scan):
            word, count = (match.group(1), match.group(2)) if pattern is _SUBJECT_VS_N else (match.group(2), match.group(1))
            value = _number_value(count)
            allowed = arf0_ok if value == higher else msf_ok if value == lower else None
            if allowed is not None and word.lower() not in allowed:
                return match.group(0)
    return None


def check(text: str, facts: RiskFacts) -> Optional[str]:
    """None when `text` may be shown, else the reason it is rejected."""
    if not text.strip():
        return "empty text"
    if len(text) > MAX_CHARS:
        return f"over {MAX_CHARS} characters"
    scan = _NAMED_TERMS.sub(lambda m: re.sub(r"\d", "", m.group(0)), text)
    allowed = allowed_numbers(facts)
    for match in NUMBER_RE.finditer(scan):
        value = _number_value(match.group(0))
        unit = _TIME_UNIT_AFTER.match(scan, match.end())
        if unit and not _time_number_ok(value, unit.group(1), facts):
            return f"time prediction: {match.group(0) + unit.group(0)!r}"
        if not any(math.isclose(value, a, rel_tol=1e-12, abs_tol=1e-9) for a in allowed):
            return f"number not in input: {match.group(0)}"
    wrong = _wrong_direction(scan, facts)
    if wrong:
        return f"wrong direction: {wrong!r}"
    word = _NUMBER_WORDS.search(scan)
    if word:
        return f"spelled-out quantity: {word.group(0)!r}"
    for pattern in _TIME:
        hit = pattern.search(scan)
        if hit:
            return f"time prediction: {hit.group(0)!r}"
    for pattern in _BLOCKED:
        hit = pattern.search(scan)
        if hit:
            return f"blocked wording: {hit.group(0)!r}"
    return None


# ----------------------------------------------------------------------------- template
def _dec(value: float, decimals: int = 1) -> str:
    """`value` at `decimals` decimals with thousands commas, trailing zeros dropped."""
    text = f"{value:,.{decimals}f}"
    return text.rstrip("0").rstrip(".") if decimals else text


def template_text(facts: RiskFacts) -> str:
    """Deterministic wording of the facts. Every number it prints is a fact, or one rounded to fewer decimals."""
    f = facts
    parts = [
        f"In the HFValid study of {f.cohort_n} women, the authors' finite-element model gave this femur, from a "
        f"{f.age}-year-old woman, a published fracture risk (ARF0) of {_dec(f.arf0_percent)}%: higher than "
        f"{f.arf0_higher_than} of the {f.cohort_n} women, against a study median of "
        f"{_dec(f.cohort_median_arf0_percent)}%.",
    ]
    if f.fractured_arf0_min_percent is not None and f.fractured_arf0_max_percent is not None:
        who = "woman who" if f.cohort_fractured == 1 else "women who"
        parts.append(f"The {f.cohort_fractured} {who} had a hip fracture during the follow-up had ARF0 values "
                     f"from {_dec(f.fractured_arf0_min_percent)}% to {_dec(f.fractured_arf0_max_percent)}%.")
    if f.factor_of_risk_low > 1:
        verdict = "exceed it"
    elif f.factor_of_risk_high < 1:
        verdict = "stay below it"
    else:
        verdict = "about reach it"
    parts += [
        f"The same model puts its sideways-fall strength (MSF) at {f.msf_newtons:,} N; {f.msf_lower_than} of "
        f"the {f.cohort_n} women had a stronger femur.",
        f"A sideways fall onto the hip pushes on it with {f.fall_force_low_newtons:,} to "
        f"{f.fall_force_high_newtons:,} N depending on body size, which is {_dec(f.factor_of_risk_low, 2)} to "
        f"{_dec(f.factor_of_risk_high, 2)} times that strength, so such a fall would {verdict}.",
    ]
    if not f.fractured_within_followup:
        parts.append("No hip fracture was recorded for this woman during the study's follow-up.")
    elif f.days_ct_to_fracture is not None:
        parts.append(f"The study recorded a hip fracture {f.days_ct_to_fracture:,} days after this CT scan.")
    else:
        parts.append("The study recorded a hip fracture during the follow-up.")
    if f.fe is not None:
        parts.append(f"The {_dec(f.fe.stress_index_percent, 0)}% fracture risk index above is a different, simpler "
                     f"measure from our own model: a peak stress of {_dec(f.fe.peak_stress_mpa, 2)} MPa under a "
                     f"standing load of {_dec(f.fe.load_newtons, 0)} N against an assumed bone strength, not a fall.")
    return " ".join(parts)


def _with_note(text: str) -> str:
    return f"{text}{'' if text.endswith(('.', '!', '?')) else '.'} {NOTE}"


# ----------------------------------------------------------------------------- chain
_cooldown_until: dict[tuple[str, str], float] = {}


def reset_cooldowns() -> None:
    """Forget failures (tests, or after fixing a key)."""
    _cooldown_until.clear()


async def _attempt(provider, user: str, facts: RiskFacts) -> tuple[Optional[str], Optional[str], bool]:
    """(text, reason, try_next_model), as in services.explain: an HTTP error status or a cooldown skip may
    try the provider's next model; a timeout, a connection error or a rejected text leaves the provider."""
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


async def analyse(request: RiskRequest, env: Optional[Mapping[str, str]] = None, *,
                  data: Optional[Mapping[str, Any]] = None,
                  transport: Optional["httpx.AsyncBaseTransport"] = None,
                  providers: Optional[Mapping[str, list]] = None) -> RiskResponse:
    """Facts for `request.case_id`, worded by the first provider whose text passes check()."""
    e = os.environ if env is None else env
    order = chain_order(e)
    dataset = load_dataset() if data is None else data
    facts = build_facts(dataset, request.case_id, request.fe)
    source = RiskSource(**{k: dataset["source"][k] for k in ("citation", "doi", "license")})

    def done(text: str, provider: str, model: Optional[str], fallbacks: list[Fallback]) -> RiskResponse:
        return RiskResponse(case_id=request.case_id, facts=facts, text=_with_note(text), provider=provider,
                            model=model, fallbacks=fallbacks, source=source)

    tiers = dict(providers) if providers is not None else build_providers(e, transport)
    fallbacks: list[Fallback] = []
    for name in order:
        if name == "template":
            text = template_text(facts)
            reason = check(text, facts)
            if reason:  # correct by construction; a failure here is a bug in template_text
                raise RuntimeError(f"template failed the checker: {reason}")
            return done(text, "template", None, fallbacks)
        models = tiers[name]
        if not models[0].configured:
            fallbacks.append(Fallback(provider=name, reason=f"{models[0].key_name} not set"))
            continue
        for provider in models:
            text, reason, try_next = await _attempt(provider, facts_json(facts), facts)
            if text is not None:
                return done(text, name, provider.model, fallbacks)
            log.warning("risk: %s %s fell through: %s", name, provider.model, reason)
            fallbacks.append(Fallback(provider=name, reason=f"{provider.model}: {reason}"))
            if not try_next:
                break
    raise RuntimeError("chain ended without the template")  # chain_order always appends it

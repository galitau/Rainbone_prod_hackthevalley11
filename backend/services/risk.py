"""AI fracture risk analysis of one HFValid femur (POST /api/risk-analysis).

The numbers come from the HFValid collection (Aldieri, La Mattina, Szyszko,
Baruffaldi, Viceconti 2025, University of Bologna, CC BY 4.0), read from
frontend/public/models/hfvalid-risk.json: each subject's ARF0 and MSF as computed by the
dataset authors' finite-element model, and the recorded follow-up.
Sideways-fall forces are van den Kroonenberg et al. 1995 (PubMed 8618384).

build_facts() computes every number a model may use: the subject's place among
the cohort, the factor of risk (fall force / MSF) and the cohort figures. No
model computes a number, and the request's own FE numbers (fe) are echoed in
the facts but never sent to a model or allowed in its text. check() rejects
text that uses a number which is not a fact (or a fact rounded to fewer
decimals), uses a fact as the wrong quantity (the age as a percent, a rank as a
risk), states a rank the wrong way round, spells a quantity out, predicts a
time, calls ARF0 a chance or likelihood, diagnoses or advises. A rejected or
failed provider falls through to the next, and finally to a deterministic
template built only from the facts. An AI answer is kept per case, facts and
chain, so a reload does not spend another model call.

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

DATA_PATH = Path(__file__).resolve().parents[2] / "frontend" / "public" / "models" / "hfvalid-risk.json"
MAX_CHARS = 600  # the prompt asks for 420; the template's longest text stays below this
NOTE = "Published research data, not a diagnosis or medical advice."

# Named terms whose digits are not quantities: the dataset's ARF0 ("Absolute Risk of Fracture at time 0").
_NAMED_TERMS = re.compile(r"\bARF0\b|\btime 0\b", re.IGNORECASE)
# A number followed by a time unit ("5 years", "78-year-old", "1,529 days", "4 y").
_TIME_UNIT_AFTER = re.compile(r"\s*-?\s*(day|d|week|wk|month|year|yr|y|decade)s?\b", re.IGNORECASE)
# The age is the only number allowed with years, and only written as an age: "78-year-old", "78 years old", "aged 78".
_YEARS_OLD_AFTER = re.compile(r"[- ]old\b", re.IGNORECASE)
_AGED_BEFORE = re.compile(r"\b(?:aged|age(?:\s+of)?)\s+$", re.IGNORECASE)
# Time horizons without a number ("next year", "within a decade", "lifetime", "in her eighties").
TIME_PATTERNS: tuple[str, ...] = (
    r"\b(?:next|coming|following|upcoming)\s+(?:\w+\s+)?(?:days?|weeks?|months?|years?|decades?)\b",
    r"\b(?:per|each|every|a|an)\s+(?:day|week|month|year|decade)\b",
    r"\b(?:few|several|many|some)\s+(?:days|weeks|months|years|decades)\b",
    r"\bannual", r"\blifetime\b", r"\byears?\s+to\s+come\b", r"\bin\s+the\s+future\b", r"\bsoon\b",
    r"\bwithin\b", r"\b(?:weeks?|months?|decades?)\b", r"\beventual", r"\blater\b", r"\bahead\b",
    r"\b(?:long|short)[- ]term\b", r"\b(?:yearly|monthly|weekly)\b",
    r"\b(?:twenties|thirties|forties|fifties|sixties|seventies|eighties|nineties)\b",
)
# Diagnosis, treatment, advice, referrals, probabilities and certainty. Fracture, risk, break and fall are allowed.
BLOCKED_OUTPUT_PATTERNS: tuple[str, ...] = (
    "diagnos", "osteopor", "osteopen", r"\bprognos", r"\btreat", r"therap", r"\bphysio", r"\bsurg", r"\bprescri",
    r"\bmedicat", r"\bdrugs?\b", r"\bsupplement", r"\bvitamin", r"\bcalcium", r"\bexercis", r"\btraining",
    r"\bbisphosphon", r"\bdenosumab", r"\bteriparatide", r"\balendron", r"\bzoledron", r"\bhip\s+protector",
    r"\b(?:bone\s+density|DXA|DEXA)\b", r"\bbone\s+(?:loss|mass)", r"\bdisease", r"\bshould\b", r"\bmust\b",
    r"\bought\b", r"\bneeds?\s+(?:to|a|an)\b", r"\brecommend", r"\badvi[cs]", r"\bconsult", r"\bdoctor",
    r"\bphysician", r"\bclinician", r"\bspecialist", r"\bGP\b", r"\bnurse", r"\bhealth\s*care", r"\bmedical",
    r"\bhospital", r"\bemergenc", r"\bprevent", r"\bavoid", r"\bhelps?\b",
    r"(?:^|[.!?]\s+)(?:Ask|Talk|Go|Get|See|Seek|Call|Book|Try|Consider|Wear|Take)\b", r"\byour?\b",
    r"\bchance", r"\bprobab", r"\bodds\b", r"\blikelihood", r"(?:%|percent)\s+likely", r"\bcertain",
    r"\bdefinitely\b", r"\bguarantee", r"\binevitabl", r"\bsure(?:ly)?\b", r"\bgoing\s+to\b",
    r"\bbound\s+to\b", r"\bexpected\s+to\b", r"\bwill\b", r"\bcancer", r"\bmetasta", r"\btumou?r",
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
# What a number is a quantity of, read from the words around it. A number of a kind may only be a fact of that kind,
# so the age cannot appear as a percent, a rank as a fracture risk, or a factor of risk as a percent.
_KINDS: tuple[tuple[str, re.Pattern], ...] = (
    ("percent", re.compile(r"\s*(?:%|per\s?cent\b)", re.IGNORECASE)),
    ("force in kN", re.compile(r"\s*(?:kN\b|kilonewtons?\b)", re.IGNORECASE)),
    ("force in newtons", re.compile(r"\s*(?:N\b|[Nn]ewtons?\b)")),
    ("stress", re.compile(r"\s*(?:MPa\b|megapascals?\b)", re.IGNORECASE)),
    ("multiple of the strength", re.compile(r"\s*(?:\u00d7|x\b|times\b)", re.IGNORECASE)),
    ("count of women", re.compile(r"\s+(?:of\s+(?:the\s+)?\d|(?:other\s+)?women\b)", re.IGNORECASE)),
)
_COUNT_BEFORE = re.compile(r"\bthan\s+(?:those\s+of\s+|that\s+of\s+)?$", re.IGNORECASE)
# "Its ARF0 is 47.1%", "an ARF0 of 47.1%", "(ARF0) is 47.1%" state this woman's own ARF0, unless a word just before
# names another one ("the median ARF0 of 44.3%", "the women who fractured had an ARF0 of 53.7%"). Runs on the text
# after _NAMED_TERMS has taken the 0 out of ARF0.
_ARF0_VALUE = re.compile(r"\bARF0?\b\)?\s*(?:\([^)]*\)\s*)?(?:is|was|of|at|=|:)\s*(?:about\s+|around\s+|roughly\s+|"
                         r"nearly\s+|just\s+)?(\d+(?:\.\d+)?)\s*(?:%|per\s?cent\b)", re.IGNORECASE)
_OTHER_ARF0_BEFORE = re.compile(r"\b(?:median|average|mean|typical|fractured|lowest|highest|minimum|maximum|cohort|"
                                r"range[ds]?|ranging|other)\b[^.;]*$", re.IGNORECASE)

SYSTEM_PROMPT = (
    "You explain to a reader with no medical or engineering background how likely one real thigh bone "
    "(femur) is to break, using only published research data about it. The user message is JSON. The femur "
    "belongs to one of cohort_n women in the HFValid study, who had a CT scan of the femur and were followed "
    "to record whether they had a hip fracture afterwards. Fields: age is the woman's age at the CT scan. "
    "msf_newtons is the femur's Minimum Sidefall Strength (MSF): the smallest sideways-fall force, over many "
    "fall directions, that the study authors' finite-element model says would break it. msf_lower_than is how "
    "many women in the study had a stronger femur (a higher MSF): write 'N of the cohort_n women had a "
    "stronger femur' or 'weaker than N of the cohort_n women', never 'stronger than N'. "
    "fall_force_low_newtons and fall_force_high_newtons are the peak force on the side of the hip in a "
    "sideways fall for a small and a large woman (van den Kroonenberg and colleagues). factor_of_risk_low and "
    "factor_of_risk_high are those forces divided by msf_newtons: the fall would load the femur that many "
    "times its strength. cohort_msf_max_newtons is the strongest MSF in the study; when "
    "fall_force_low_newtons is above it, a sideways fall exceeds the MSF of every femur in the study: say "
    "that, and let msf_lower_than show how this femur compares. arf0_percent is its ARF0, the absolute risk of "
    "fracture the study authors estimated from that model coupled with a model of falling; arf0_higher_than "
    "is how many women in the study had a lower ARF0. cohort_median_arf0_percent is the study's median ARF0; "
    "cohort_fractured women had a hip fracture during the follow-up, with ARF0 from "
    "fractured_arf0_min_percent to fractured_arf0_max_percent. fractured_within_followup says whether this "
    "woman had a hip fracture during the follow-up, and days_ct_to_fracture is then the days from the CT scan "
    "to it. "
    "Write 2 or 3 short plain sentences, at most 420 characters, on how likely this femur is to break: first "
    "what a sideways fall would do to it (factor_of_risk_low to factor_of_risk_high times its strength), then "
    "where its ARF0 sits among the cohort_n women, then what the follow-up recorded. Credit ARF0 and MSF to "
    "'the study authors' model' without naming the authors, and add no disclaimer (the page adds one). "
    "Rules: use only numbers that appear in the JSON, written as digits, exactly as given or rounded to "
    "fewer decimals, each for its own quantity: percents only for the ARF0 values, newtons only for MSF and "
    "the fall forces, 'times' only for the factors of risk, and counts of women only for arf0_higher_than, "
    "msf_lower_than, cohort_fractured and cohort_n. Do not calculate any new number: no differences, shares "
    "of the cohort, or unit conversions such as kN. Never write a number as a word, and do not use words for "
    "quantities or multiples (such as one, two, half, twice, double). Spell out each name the first time "
    "it appears, exactly as 'MSF (minimum sidefall strength)' and 'ARF0 (absolute risk of fracture at time "
    "0)', and write MSF and ARF0 after that. Do not call ARF0 a chance, probability, odds or likelihood, do "
    "not attach a time period to it, and "
    "do not predict when or whether a fracture will happen (no will, within, later, soon, eventually, "
    "lifetime); the follow-up is a record of what happened. Do not diagnose or name a disease, and do not "
    "give advice, treatment, medication, exercise, screening, referrals or prevention (no should, need, "
    "help, avoid, prevent, doctor, medical). Write about 'this femur' and 'this woman'; never address the "
    "reader as 'you'. No markdown, lists or headings. "
    'Answer with JSON: {"text": "..."}.'
)


class RiskDataUnavailable(RuntimeError):
    """frontend/public/models/hfvalid-risk.json is missing or unreadable."""


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
    cohort_msf_max_newtons: int = Field(description="The strongest MSF in the cohort.")
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
        cohort_msf_max_newtons=round(max(msf)),
        fractured_within_followup=bool(me["fractured_within_followup"]),
        days_ct_to_fracture=None if days is None else round(float(days)),
        fe=None if fe is None else FeInput(peak_stress_mpa=round(fe.peak_stress_mpa, 2),
                                           load_newtons=round(fe.load_newtons, 2),
                                           stress_index_percent=round(fe.stress_index_percent, 2)),
    )


def facts_json(facts: RiskFacts) -> str:
    return json.dumps(facts.model_dump(), sort_keys=True, separators=(",", ":"))


def model_input(facts: RiskFacts) -> str:
    """What a model reads: the facts without fe, our own FE numbers, which the text may not repeat."""
    return json.dumps(facts.model_dump(exclude={"fe"}), sort_keys=True, separators=(",", ":"))


# ----------------------------------------------------------------------------- checker
def _fact_numbers(value: Any) -> list[float]:
    if isinstance(value, bool) or value is None or isinstance(value, str):
        return []
    if isinstance(value, Mapping):
        return [n for v in value.values() for n in _fact_numbers(v)]
    return [abs(float(value))]


def _rounded(*values: Optional[float]) -> set[float]:
    return {round(float(v), d) for v in values if v is not None for d in (0, 1, 2)}


def allowed_numbers(facts: RiskFacts) -> set[float]:
    """Each numeric fact's magnitude, and that magnitude rounded to 0, 1 and 2 decimals. fe is not included."""
    return _rounded(*_fact_numbers(facts.model_dump(exclude={"fe"})))


def _kind_pools(facts: RiskFacts) -> dict[str, set[float]]:
    """The facts each kind of number may be (see _KINDS)."""
    f = facts
    return {
        "percent": _rounded(f.arf0_percent, f.cohort_median_arf0_percent, f.fractured_arf0_min_percent,
                            f.fractured_arf0_max_percent),
        "force in kN": set(),
        "force in newtons": _rounded(f.msf_newtons, f.fall_force_low_newtons, f.fall_force_high_newtons,
                                     f.cohort_msf_max_newtons),
        "stress": set(),
        "multiple of the strength": _rounded(f.factor_of_risk_low, f.factor_of_risk_high),
        "count of women": _rounded(f.arf0_higher_than, f.msf_lower_than, f.cohort_fractured, f.cohort_n),
    }


def _kind(scan: str, match: re.Match) -> Optional[str]:
    for kind, after in _KINDS:
        if after.match(scan, match.end()):
            return kind
    if _COUNT_BEFORE.search(scan, max(0, match.start() - 40), match.start()):  # "higher than 56"
        return "count of women"
    return None


def _is_one_of(value: float, pool: set[float]) -> bool:
    return any(math.isclose(value, a, rel_tol=1e-12, abs_tol=1e-9) for a in pool)


def _time_number_ok(value: float, unit: re.Match, scan: str, start: int, facts: RiskFacts) -> bool:
    """A number with a time unit is only the woman's age, written as an age, or the recorded days to her fracture."""
    name = unit.group(1).lower()
    if name in ("year", "yr", "y"):
        as_age = _YEARS_OLD_AFTER.match(scan, unit.end()) or _AGED_BEFORE.search(scan, 0, start)
        return bool(as_age) and math.isclose(value, facts.age)
    if name in ("day", "d"):
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
    allowed, pools = allowed_numbers(facts), _kind_pools(facts)
    for match in NUMBER_RE.finditer(scan):
        value = _number_value(match.group(0))
        unit = _TIME_UNIT_AFTER.match(scan, match.end())
        if unit:
            if not _time_number_ok(value, unit, scan, match.start(), facts):
                return f"time prediction: {match.group(0) + unit.group(0)!r}"
            continue
        if not _is_one_of(value, allowed):
            return f"number not in input: {match.group(0)}"
        kind = _kind(scan, match)
        if kind is not None and not _is_one_of(value, pools[kind]):
            return f"not a {kind} in the input: {match.group(0)}"
    for match in _ARF0_VALUE.finditer(scan):
        if _OTHER_ARF0_BEFORE.search(scan, max(0, match.start() - 30), match.start()):
            continue
        if not _is_one_of(_number_value(match.group(1)), _rounded(facts.arf0_percent)):
            return f"not this femur's ARF0: {match.group(1)}%"
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
    if f.fall_force_low_newtons > f.cohort_msf_max_newtons:
        compare = "Such a fall would exceed the MSF of every femur in the study"
    elif f.factor_of_risk_low > 1:
        compare = "Such a fall would exceed its strength"
    elif f.factor_of_risk_high < 1:
        compare = "Such a fall would stay below its strength"
    else:
        compare = "Such a fall would about reach its strength"
    parts = [
        f"A sideways fall would load this femur {_dec(f.factor_of_risk_low, 2)} to {_dec(f.factor_of_risk_high, 2)} "
        f"times its minimum sidefall strength (MSF, {f.msf_newtons:,} N) in the study authors' model.",
        f"{compare}; {f.msf_lower_than} of the {f.cohort_n} women had a stronger femur.",
        f"Its published absolute risk of fracture at time 0 (ARF0) is {_dec(f.arf0_percent)}%, higher than "
        f"{f.arf0_higher_than} of the {f.cohort_n} women.",
    ]
    if not f.fractured_within_followup:
        parts.append("No hip fracture was recorded for this woman during the study's follow-up.")
    elif f.days_ct_to_fracture is not None:
        parts.append(f"The study recorded a hip fracture {f.days_ct_to_fracture:,} days after this CT scan.")
    else:
        parts.append("The study recorded a hip fracture during the follow-up.")
    return " ".join(parts)


def _with_note(text: str) -> str:
    return f"{text}{'' if text.endswith(('.', '!', '?')) else '.'} {NOTE}"


# ----------------------------------------------------------------------------- chain
_cooldown_until: dict[tuple[str, str], float] = {}
# AI answers by (case_id, facts, chain order). The facts of a case only change with the data file or fe, so a reload
# reuses the answer instead of spending the provider quota POST /api/explain also needs. A template answer is not kept,
# so a later request can still get an AI one. Oldest first out past _ANSWERS_MAX, since fe comes from the client.
_answers: dict[tuple[str, str, tuple[str, ...]], RiskResponse] = {}
_ANSWERS_MAX = 256


def reset_cooldowns() -> None:
    """Forget failures and kept answers (tests, or after fixing a key)."""
    _cooldown_until.clear()
    _answers.clear()


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
    kept = (request.case_id, facts_json(facts), order)
    if kept in _answers:
        return _answers[kept]
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
            text, reason, try_next = await _attempt(provider, model_input(facts), facts)
            if text is not None:
                answer = done(text, name, provider.model, fallbacks)
                _answers[kept] = answer
                while len(_answers) > _ANSWERS_MAX:
                    _answers.pop(next(iter(_answers)))
                return answer
            log.warning("risk: %s %s fell through: %s", name, provider.model, reason)
            fallbacks.append(Fallback(provider=name, reason=f"{provider.model}: {reason}"))
            if not try_next:
                break
    raise RuntimeError("chain ended without the template")  # chain_order always appends it

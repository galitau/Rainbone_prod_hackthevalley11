"""Allowlisted, read-only evidence tools. Arguments never select arbitrary files, URLs or SQL."""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Mapping

from services import explain, risk

MAX_TOOL_CALLS = 4
TOOL_ARGS = {
    "get_patient_facts": {"case_id": ("Pat001",)},
    "compare_with_cohort": {"metric": ("arf0", "msf")},
    "get_fea_result": {},
    "get_page_guide": {"topic": ("cut", "press", "upload", "preferences", "progression", "imaging", "navigation", "general")},
    "get_dataset_info": {"name": ("HFValid", "CTPelvic1K")},
}
DESCRIPTIONS = {
    "get_patient_facts": "Read verified published Pat001 ARF0, modeled strength and fall-force ratio.",
    "compare_with_cohort": "Compare Pat001 ARF0 or MSF with the research cohort, using distinct ranks.",
    "get_fea_result": "Read the illustrative FEA manifest and explain the stress index, not fracture chance.",
    "get_page_guide": "Read actual Rainbone routes and controls; general handles unsupported questions.",
    "get_dataset_info": "Read research dataset attribution and scope; no uploaded user files.",
}
DECLARATIONS = [{"name": name, "description": DESCRIPTIONS[name], **({
                 "parameters": {"type": "OBJECT", "properties": {
                     key: {"type": "STRING", "enum": list(values)} for key, values in args.items()},
                     "required": list(args)}} if args else {})} for name, args in TOOL_ARGS.items()]


@dataclass(frozen=True)
class ToolCall:
    name: str
    args: Mapping[str, str]


@dataclass(frozen=True)
class ToolResult:
    tool: str
    statement_ids: tuple[str, ...]
    facts: Mapping[str, Any]
    summary: str


def validate_calls(value: Any) -> list[ToolCall]:
    """Validate the complete plan before executing anything, including the four-call cap."""
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_TOOL_CALLS:
        raise ValueError("tool call count outside limit")
    result, seen = [], set()
    for item in value:
        if not isinstance(item, dict) or set(item) != {"name", "args"}:
            raise ValueError("invalid tool call shape")
        name, args = item["name"], item["args"]
        if not isinstance(name, str) or name not in TOOL_ARGS or not isinstance(args, dict):
            raise ValueError("unknown tool")
        allowed = TOOL_ARGS[name]
        if set(args) != set(allowed) or any(not isinstance(v, str) or v not in allowed[k] for k, v in args.items()):
            raise ValueError("invalid tool arguments")
        identity = json.dumps([name, args], sort_keys=True)
        if identity in seen:
            raise ValueError("duplicate tool call")
        seen.add(identity)
        result.append(ToolCall(name, args))
    return result


def get_patient_facts(case_id: str, env: Mapping[str, str], evidence) -> ToolResult:
    data, grounding = risk.load_grounded_dataset(env)
    facts = risk.build_facts(data, case_id)
    return ToolResult("get_patient_facts", ("arf0", "strength", "fall_ratio"),
                      {"case_id": case_id, "facts": facts.model_dump(exclude={"fe"}),
                       "source_ids": ["HFValid-Pat001", "van-den-Kroonenberg-1995"],
                       "sha256": grounding.sha256}, "Read verified Pat001 research facts; SHA256 checked")


def compare_with_cohort(metric: str, env: Mapping[str, str], evidence) -> ToolResult:
    data, grounding = risk.load_grounded_dataset(env)
    facts = risk.build_facts(data, "Pat001")
    values = {"metric": metric, "cohort_n": facts.cohort_n, "source_ids": ["HFValid-Pat001"], "sha256": grounding.sha256}
    values.update({"higher_than": facts.arf0_higher_than} if metric == "arf0" else {"weaker_than": facts.msf_lower_than})
    return ToolResult("compare_with_cohort", ("arf0_rank",) if metric == "arf0" else ("strength",), values,
                      f"Computed Pat001 {metric.upper()} cohort comparison from verified records")


def get_fea_result(env: Mapping[str, str], evidence) -> ToolResult:
    request, grounding = explain.request_for_case("Pat001", env)
    return ToolResult("get_fea_result", ("stress_index", "fea"),
                      {"facts": explain.build_facts(request), "source_ids": ["FEA-manifest"], "sha256": grounding.sha256},
                      "Read verified illustrative FEA manifest; SHA256 checked")


def get_page_guide(topic: str, env: Mapping[str, str], evidence) -> ToolResult:
    ids = ("upload", "upload_privacy") if topic == "upload" else ("unavailable",) if topic == "general" else (topic,)
    return ToolResult("get_page_guide", ids, {"topic": topic, "source_ids": list(dict.fromkeys(evidence.statements[i].source for i in ids)),
                      "guide": [evidence.statements[i].text for i in ids]}, "Read checked site routes and controls")


def get_dataset_info(name: str, env: Mapping[str, str], evidence) -> ToolResult:
    if name == "HFValid":
        data, grounding = risk.load_grounded_dataset(env)
        facts = risk.build_facts(data, "Pat001")
        values = {"source": data["source"], "subjects": facts.cohort_n, "recorded_fractures": facts.cohort_fractured,
                  "source_ids": ["HFValid-Pat001"], "sha256": grounding.sha256}
        ids = ("sources",)
    else:
        values = {"source_ids": ["CTPelvic1K"], "description": evidence.statements["imaging"].text}
        ids = ("imaging",)
    return ToolResult("get_dataset_info", ids, values, f"Read {name} research dataset attribution and scope")


def execute(call: ToolCall, env: Mapping[str, str], evidence) -> ToolResult:
    # Explicit static dispatch, and revalidation protects internal callers as well as model calls.
    validate_calls([{"name": call.name, "args": dict(call.args)}])
    functions = {"get_patient_facts": get_patient_facts, "compare_with_cohort": compare_with_cohort,
                 "get_fea_result": get_fea_result, "get_page_guide": get_page_guide, "get_dataset_info": get_dataset_info}
    return functions[call.name](**call.args, env=env, evidence=evidence)


def rules_plan(selection: str) -> list[ToolCall]:
    """Deterministic fallback routing. It is always labeled rules, never Gemini triage."""
    calls = []
    for statement in selection.split(","):
        if statement in {"arf0", "strength", "fall_ratio"}:
            item = {"name": "get_patient_facts", "args": {"case_id": "Pat001"}}
        elif statement == "arf0_rank":
            item = {"name": "compare_with_cohort", "args": {"metric": "arf0"}}
        elif statement in {"stress_index", "fea"}:
            item = {"name": "get_fea_result", "args": {}}
        elif statement in {"sources", "imaging"}:
            item = {"name": "get_dataset_info", "args": {"name": "HFValid" if statement == "sources" else "CTPelvic1K"}}
        else:
            item = {"name": "get_page_guide", "args": {"topic": "general" if statement == "unavailable" else
                                                      "upload" if statement == "upload_privacy" else statement}}
        if item not in calls:
            calls.append(item)
    return validate_calls(calls)

"""In-memory five-stage orchestration; graph state contains only a stage name.

No checkpoints, external tracing, retries, credentials or question text are passed into LangGraph.
A framework failure resumes the same cursor. Node/business failures retain their original behavior.
"""
from __future__ import annotations

from collections.abc import Awaitable, Callable, Mapping
from typing import TypedDict

STAGES = ("triage", "evidence", "writer", "critic", "audit")
LANGGRAPH = "Orchestrator: LangGraph StateGraph"
BUILTIN = "Orchestrator: built-in (LangGraph unavailable)"


class GraphState(TypedDict):
    next_stage: str


class Execution:
    def __init__(self, stages: Mapping[str, Callable[[], Awaitable[str]]]):
        self.stages = stages
        self.next_stage = "triage"
        self.node_error: BaseException | None = None

    async def run_stage(self, name: str) -> dict:
        if name != self.next_stage:
            raise RuntimeError("Unexpected Ask orchestration transition")
        try:
            next_stage = await self.stages[name]()
        except BaseException as exc:
            self.node_error = exc
            raise
        # Commit before returning to framework machinery: fallback never replays a completed node.
        self.next_stage = next_stage
        return {"next_stage": next_stage}

    async def builtin(self) -> None:
        while self.next_stage != "end":
            await self.run_stage(self.next_stage)


def compile_graph(execution: Execution):
    from langgraph.graph import END, START, StateGraph
    graph = StateGraph(GraphState)
    for name in STAGES:
        async def node(state: GraphState, name=name):
            return await execution.run_stage(name)
        graph.add_node(name, node)
    graph.add_edge(START, "triage")
    graph.add_edge("triage", "evidence")
    graph.add_edge("evidence", "writer")
    graph.add_edge("writer", "critic")
    graph.add_conditional_edges("critic", lambda state: state["next_stage"], {"writer": "writer", "audit": "audit"})
    graph.add_edge("audit", END)
    return graph.compile()


async def run(stages: Mapping[str, Callable[[], Awaitable[str]]]) -> str:
    execution = Execution(stages)
    try:
        from langsmith import tracing_context
        # Explicit context overrides ambient LangSmith tracing configuration. No checkpointer is used.
        with tracing_context(enabled=False):
            graph = compile_graph(execution)
            await graph.ainvoke({"next_stage": "triage"}, config={"callbacks": [], "recursion_limit": 32})
        return LANGGRAPH
    except Exception:
        if execution.node_error is not None:
            raise execution.node_error
        await execution.builtin()
        return BUILTIN

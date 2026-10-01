"""A minimal, dependency-free sequential state graph.

Its surface deliberately mirrors ``langgraph.StateGraph`` — ``add_node``, ``add_edge``,
``set_entry_point`` and an ``END`` sentinel — so the pipeline in ``pipeline.py`` can be lifted
onto LangGraph unchanged once that dependency is available in the worker. LangGraph is not
installable in this environment (it is absent from the venv and no resolver is reachable), so the
runner is internal for now. See ADR-0015 and the TASK-0032 evidence: this is a recorded, reversible
deviation, not a silent divergence.

The runner is intentionally linear. The creation pipeline is a fixed sequence with one branch —
whether the AI blend ran — and that branch is expressed inside a node, not as graph topology, so a
plain walk from the entry node to ``END`` is faithful. A conditional-edge API is deferred until a
node genuinely needs to fork the graph.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Generic, TypeVar

S = TypeVar("S")

#: Terminal sentinel, the destination of the last edge (mirrors ``langgraph.graph.END``).
END = "__end__"


class GraphError(RuntimeError):
    """Raised for a malformed graph: an unknown node, no entry, or a broken chain."""


class Graph(Generic[S]):
    """A single-path graph over a mutable state value.

    Nodes are ``Callable[[S], S]``. Each node returns the (possibly same) state, which is passed
    to its successor. ``invoke`` walks from the entry node along the declared edges until ``END``.
    """

    def __init__(self) -> None:
        self._nodes: dict[str, Callable[[S], S]] = {}
        self._edges: dict[str, str] = {}
        self._entry: str | None = None

    def add_node(self, name: str, fn: Callable[[S], S]) -> None:
        if name in (END, ""):
            raise GraphError(f"reserved or empty node name: {name!r}")
        if name in self._nodes:
            raise GraphError(f"duplicate node: {name!r}")
        self._nodes[name] = fn

    def add_edge(self, source: str, dest: str) -> None:
        if source not in self._nodes:
            raise GraphError(f"edge from unknown node: {source!r}")
        if dest != END and dest not in self._nodes:
            raise GraphError(f"edge to unknown node: {dest!r}")
        self._edges[source] = dest

    def set_entry_point(self, name: str) -> None:
        if name not in self._nodes:
            raise GraphError(f"entry is not a node: {name!r}")
        self._entry = name

    def node_order(self) -> list[str]:
        """The nodes as they will execute, entry to last. Also validates the chain."""
        if self._entry is None:
            raise GraphError("no entry point set")
        order: list[str] = []
        seen: set[str] = set()
        current = self._entry
        while current != END:
            if current in seen:
                raise GraphError(f"cycle through node: {current!r}")
            if current not in self._edges:
                raise GraphError(f"node has no outgoing edge: {current!r}")
            seen.add(current)
            order.append(current)
            current = self._edges[current]
        return order

    def invoke(self, state: S, on_node: Callable[[str], None] | None = None) -> S:
        """Run the nodes in order. `on_node` hears each node's name as it starts (TASK-0076)."""
        for name in self.node_order():
            if on_node:
                on_node(name)
            state = self._nodes[name](state)
        return state

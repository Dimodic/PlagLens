"""Depth-first search on a directed graph.

Лабораторная 2, вариант: DFS — поиск в глубину, обнаружение циклов,
топологическая сортировка.
Автор: student2 (демо PlagLens — оригинал).
"""

from __future__ import annotations

from collections.abc import Iterable

Graph = dict[int, list[int]]


def dfs_iterative(graph: Graph, source: int) -> list[int]:
    """Return the order in which nodes are first visited from `source`.

    Uses an explicit stack to avoid Python recursion depth limits on
    large graphs. O(V + E).
    """
    visited: set[int] = set()
    order: list[int] = []
    stack: list[int] = [source]
    while stack:
        node = stack.pop()
        if node in visited:
            continue
        visited.add(node)
        order.append(node)
        # reversed so that lower-numbered neighbours are explored first
        for neighbour in reversed(graph.get(node, [])):
            if neighbour not in visited:
                stack.append(neighbour)
    return order


def has_cycle(graph: Graph) -> bool:
    """True if the directed graph contains a cycle. O(V + E)."""
    WHITE, GRAY, BLACK = 0, 1, 2
    colour: dict[int, int] = {n: WHITE for n in graph}

    def dfs(node: int) -> bool:
        colour[node] = GRAY
        for neighbour in graph.get(node, []):
            colour.setdefault(neighbour, WHITE)
            if colour[neighbour] == GRAY:
                return True
            if colour[neighbour] == WHITE and dfs(neighbour):
                return True
        colour[node] = BLACK
        return False

    return any(colour[n] == WHITE and dfs(n) for n in list(colour.keys()))


def topological_sort(graph: Graph) -> list[int] | None:
    """Return a topological ordering of nodes, or None if a cycle exists."""
    if has_cycle(graph):
        return None
    visited: set[int] = set()
    order: list[int] = []

    def dfs(node: int) -> None:
        if node in visited:
            return
        visited.add(node)
        for neighbour in graph.get(node, []):
            dfs(neighbour)
        order.append(node)

    for node in list(graph.keys()):
        dfs(node)
    return list(reversed(order))


def build_directed(edges: Iterable[tuple[int, int]]) -> Graph:
    """Build a directed adjacency-list graph from an iterable of edges."""
    graph: Graph = {}
    for u, v in edges:
        graph.setdefault(u, []).append(v)
        graph.setdefault(v, [])
    return graph


def main() -> None:
    edges = [(1, 2), (1, 3), (2, 4), (3, 4), (4, 5)]
    g = build_directed(edges)
    print("dfs order  :", dfs_iterative(g, 1))
    print("has cycle  :", has_cycle(g))
    print("topo order :", topological_sort(g))


if __name__ == "__main__":
    main()

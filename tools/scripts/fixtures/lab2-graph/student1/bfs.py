"""Breadth-first search on an unweighted graph.

Лабораторная 2, вариант: BFS — поиск в ширину.
Автор: student1 (демо PlagLens — оригинал).
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable

Graph = dict[int, list[int]]


def bfs_levels(graph: Graph, source: int) -> dict[int, int]:
    """Return a dict of `node -> shortest-edge-distance from source`.

    Nodes unreachable from `source` are not present in the result.
    Runs in O(V + E).
    """
    distances: dict[int, int] = {source: 0}
    queue: deque[int] = deque([source])
    while queue:
        node = queue.popleft()
        for neighbour in graph.get(node, []):
            if neighbour not in distances:
                distances[neighbour] = distances[node] + 1
                queue.append(neighbour)
    return distances


def bfs_path(graph: Graph, source: int, target: int) -> list[int] | None:
    """Return one shortest path from `source` to `target`, or None."""
    if source == target:
        return [source]
    parents: dict[int, int] = {source: source}
    queue: deque[int] = deque([source])
    while queue:
        node = queue.popleft()
        for neighbour in graph.get(node, []):
            if neighbour not in parents:
                parents[neighbour] = node
                if neighbour == target:
                    return _reconstruct_path(parents, source, target)
                queue.append(neighbour)
    return None


def _reconstruct_path(parents: dict[int, int], source: int, target: int) -> list[int]:
    """Walk back from target to source via the parent chain."""
    path: list[int] = []
    current = target
    while current != source:
        path.append(current)
        current = parents[current]
    path.append(source)
    return list(reversed(path))


def build_graph(edges: Iterable[tuple[int, int]]) -> Graph:
    """Build an undirected adjacency-list graph from an iterable of edges."""
    graph: Graph = {}
    for u, v in edges:
        graph.setdefault(u, []).append(v)
        graph.setdefault(v, []).append(u)
    return graph


def main() -> None:
    edges = [(1, 2), (1, 3), (2, 4), (3, 5), (4, 6), (5, 6)]
    g = build_graph(edges)
    print("levels from 1:", bfs_levels(g, 1))
    print("path 1 -> 6  :", bfs_path(g, 1, 6))


if __name__ == "__main__":
    main()

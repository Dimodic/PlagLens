"""Quicksort implementation.

Лабораторная 1, вариант: быстрая сортировка (Lomuto partition).
Автор: student2 (демо PlagLens — оригинал).
"""

from __future__ import annotations

import random


def quicksort(values: list[int]) -> list[int]:
    """Sort `values` ascending using a random-pivot quicksort.

    Returns a NEW list and does not mutate the input. Average O(n log n),
    worst-case O(n^2) with adversarial inputs (mitigated by random pivot).
    """
    if len(values) <= 1:
        return list(values)

    pivot_index = random.randrange(len(values))
    pivot = values[pivot_index]

    less: list[int] = []
    equal: list[int] = []
    greater: list[int] = []
    for v in values:
        if v < pivot:
            less.append(v)
        elif v == pivot:
            equal.append(v)
        else:
            greater.append(v)

    return quicksort(less) + equal + quicksort(greater)


def quicksort_inplace(values: list[int], lo: int = 0, hi: int | None = None) -> None:
    """Classic in-place Lomuto-partition quicksort.

    Mutates `values` between indices [lo, hi]. Calls itself recursively.
    """
    if hi is None:
        hi = len(values) - 1
    if lo >= hi:
        return
    pivot = values[hi]
    i = lo
    for j in range(lo, hi):
        if values[j] <= pivot:
            values[i], values[j] = values[j], values[i]
            i += 1
    values[i], values[hi] = values[hi], values[i]
    quicksort_inplace(values, lo, i - 1)
    quicksort_inplace(values, i + 1, hi)


def is_sorted(values: list[int]) -> bool:
    """Return True iff `values` is non-decreasing."""
    return all(values[i] <= values[i + 1] for i in range(len(values) - 1))


def main() -> None:
    random.seed(0)
    sample: list[int] = [5, 2, 9, 1, 5, 6, 7, 3, 8, 4]
    print(f"input            : {sample}")
    print(f"quicksort (copy) : {quicksort(sample)}")
    in_place = list(sample)
    quicksort_inplace(in_place)
    print(f"quicksort (in-pl): {in_place}")
    assert is_sorted(quicksort(sample))
    assert is_sorted(in_place)


if __name__ == "__main__":
    main()

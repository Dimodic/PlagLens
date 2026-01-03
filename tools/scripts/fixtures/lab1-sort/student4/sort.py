"""Merge sort implementation.

Лабораторная 1, вариант: сортировка слиянием.
Автор: student4 (демо PlagLens — оригинал).
"""

from __future__ import annotations


def merge_sort(values: list[int]) -> list[int]:
    """Sort `values` ascending via top-down recursive merge sort.

    Returns a new list, does not mutate the input. Stable, O(n log n) time,
    O(n) extra memory.
    """
    if len(values) <= 1:
        return list(values)
    mid = len(values) // 2
    left = merge_sort(values[:mid])
    right = merge_sort(values[mid:])
    return _merge(left, right)


def _merge(left: list[int], right: list[int]) -> list[int]:
    """Merge two already-sorted lists into one sorted list."""
    merged: list[int] = []
    i = 0
    j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            merged.append(left[i])
            i += 1
        else:
            merged.append(right[j])
            j += 1
    merged.extend(left[i:])
    merged.extend(right[j:])
    return merged


def is_sorted(values: list[int]) -> bool:
    """Return True iff `values` is non-decreasing."""
    return all(values[i] <= values[i + 1] for i in range(len(values) - 1))


def main() -> None:
    sample: list[int] = [5, 2, 9, 1, 5, 6, 7, 3, 8, 4]
    print(f"input : {sample}")
    sorted_values = merge_sort(sample)
    print(f"output: {sorted_values}")
    assert is_sorted(sorted_values), "result must be sorted"


if __name__ == "__main__":
    main()

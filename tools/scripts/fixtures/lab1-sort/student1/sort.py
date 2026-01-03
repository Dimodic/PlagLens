"""Bubble sort implementation.

Лабораторная 1, вариант: пузырьковая сортировка.
Автор: student1 (демо PlagLens — оригинал).
"""

from __future__ import annotations


def bubble_sort(values: list[int]) -> list[int]:
    """Sort `values` ascending in-place via bubble sort and return them.

    Optimised with an early-exit flag: if a full pass produces no swaps,
    the array is already sorted and we stop. Worst-case O(n^2),
    best-case O(n) on already-sorted input.
    """
    n = len(values)
    for i in range(n - 1):
        swapped = False
        for j in range(n - 1 - i):
            if values[j] > values[j + 1]:
                values[j], values[j + 1] = values[j + 1], values[j]
                swapped = True
        if not swapped:
            break
    return values


def is_sorted(values: list[int]) -> bool:
    """Return True iff `values` is non-decreasing."""
    return all(values[i] <= values[i + 1] for i in range(len(values) - 1))


def main() -> None:
    sample: list[int] = [5, 2, 9, 1, 5, 6, 7, 3, 8, 4]
    print(f"input : {sample}")
    sorted_values = bubble_sort(list(sample))
    print(f"output: {sorted_values}")
    assert is_sorted(sorted_values), "result must be sorted"


if __name__ == "__main__":
    main()

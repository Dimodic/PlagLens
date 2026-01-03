from __future__ import annotations


def bubble_sort(arr: list[int]) -> list[int]:
    sz = len(arr)
    for k in range(sz - 1):
        flag = False
        for m in range(sz - 1 - k):
            if arr[m] > arr[m + 1]:
                arr[m], arr[m + 1] = arr[m + 1], arr[m]
                flag = True
        if not flag:
            break
    return arr


def is_sorted(arr: list[int]) -> bool:
    return all(arr[i] <= arr[i + 1] for i in range(len(arr) - 1))


def main() -> None:
    data: list[int] = [5, 2, 9, 1, 5, 6, 7, 3, 8, 4]
    print(f"input : {data}")
    out = bubble_sort(list(data))
    print(f"output: {out}")
    assert is_sorted(out), "result must be sorted"


if __name__ == "__main__":
    main()

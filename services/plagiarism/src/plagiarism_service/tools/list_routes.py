"""Print every registered route. Useful for spec/coverage check."""
from __future__ import annotations

from ..main import app


def main() -> None:
    for route in app.routes:
        methods = sorted(getattr(route, "methods", []) or [])
        path = getattr(route, "path", str(route))
        print(f"{','.join(methods):<12} {path}")


if __name__ == "__main__":
    main()

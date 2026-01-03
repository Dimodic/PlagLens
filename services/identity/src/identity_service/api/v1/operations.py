"""Async-Operation polling endpoints (Canvas-style; see 01-CROSS-CUTTING §7)."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status

from ...common.operation import Operation, OperationProgress
from ...common.problem import ProblemException
from ...deps import CurrentUser, current_user

router = APIRouter(prefix="/operations", tags=["operations"])


# In-memory placeholder. Production keeps Operations in Redis with TTL.
_OPS: dict[str, Operation] = {}


@router.get(
    "/{operation_id}",
    response_model=Operation,
    summary="Get operation status",
)
async def get_operation(
    operation_id: str,
    user: CurrentUser = Depends(current_user),  # noqa: ARG001
) -> Operation:
    op = _OPS.get(operation_id)
    if op is None:
        # Synthesize a 'queued' op if unknown (worker would normally insert it).
        op = Operation(
            id=operation_id,
            kind="unknown",
            status="queued",
            progress=OperationProgress(),
            started_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        _OPS[operation_id] = op
    return op


@router.post(
    "/{operation_id}:cancel",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Cancel a running operation (when supported)",
)
async def cancel_operation(
    operation_id: str,
    user: CurrentUser = Depends(current_user),  # noqa: ARG001
) -> Operation:
    op = _OPS.get(operation_id)
    if op is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="Operation not found")
    if op.status in ("completed", "failed", "cancelled"):
        raise ProblemException(
            status=409, code="CONFLICT", title=f"Operation already {op.status}"
        )
    op.status = "cancelled"
    op.finished_at = datetime.now(timezone.utc)
    op.updated_at = op.finished_at
    return op

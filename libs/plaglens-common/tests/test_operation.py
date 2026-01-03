from __future__ import annotations

import json

import pytest

from plaglens_common.operation import (
    Operation,
    OperationStatus,
    operation_response,
)


def test_operation_status_values() -> None:
    assert OperationStatus.QUEUED.value == "queued"
    assert OperationStatus.RUNNING.value == "running"
    assert OperationStatus.COMPLETED.value == "completed"
    assert OperationStatus.FAILED.value == "failed"
    assert OperationStatus.CANCELLED.value == "cancelled"


def test_operation_default_serialisation() -> None:
    op = Operation(id="op_1", kind="submission_import")
    dumped = op.model_dump()
    assert dumped["status"] == "queued"
    assert dumped["metadata"] == {}


def test_operation_response_returns_202_with_location() -> None:
    pytest.importorskip("starlette")
    response = operation_response("op_42")
    assert response.status_code == 202
    assert response.headers["location"] == "/v1/operations/op_42"
    body = json.loads(bytes(response.body))
    assert body == {"operation_id": "op_42", "status_url": "/v1/operations/op_42"}


def test_operation_response_custom_location() -> None:
    pytest.importorskip("starlette")
    response = operation_response("op_77", location="/v1/imports/op_77")
    assert response.headers["location"] == "/v1/imports/op_77"

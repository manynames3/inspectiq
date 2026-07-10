from __future__ import annotations

import copy
from typing import Any

from handler import project_event


class FakeDynamo:
    def __init__(self) -> None:
        self.items: dict[tuple[str, str], dict[str, Any]] = {}
        self.transactions = 0

    def transact_write_items(self, **kwargs: Any) -> dict[str, Any]:
        writes = kwargs["TransactItems"]
        idempotency = writes[0]["Put"]["Item"]
        key = (idempotency["pk"]["S"], idempotency["sk"]["S"])
        if key in self.items:
            raise RuntimeError("Transaction cancelled")
        staged = copy.deepcopy(self.items)
        for write in writes:
            if "Put" in write:
                item = write["Put"]["Item"]
                staged[(item["pk"]["S"], item["sk"]["S"])] = item
            else:
                update = write["Update"]
                update_key = (update["Key"]["pk"]["S"], update["Key"]["sk"]["S"])
                existing = staged.get(update_key, {**update["Key"]})
                if update_key == ("PROJECTOR#HEALTH", "STATE"):
                    projected = int(existing.get("projectedCount", {"N": "0"})["N"]) + 1
                    staged[update_key] = {
                        **existing,
                        "projectedCount": {"N": str(projected)},
                        "lastEventId": update["ExpressionAttributeValues"][":eventId"],
                    }
                else:
                    staged[update_key] = {
                        **existing,
                        "latestEventId": update["ExpressionAttributeValues"][":eventId"],
                        "latestEventType": update["ExpressionAttributeValues"][":eventType"],
                    }
        self.items = staged
        self.transactions += 1
        return {}

    def get_item(self, **kwargs: Any) -> dict[str, Any]:
        key = kwargs["Key"]
        item = self.items.get((key["pk"]["S"], key["sk"]["S"]))
        return {"Item": item} if item else {}

    def update_item(self, **kwargs: Any) -> dict[str, Any]:
        key = kwargs["Key"]
        item_key = (key["pk"]["S"], key["sk"]["S"])
        existing = self.items.get(item_key, {**key})
        duplicate_count = int(existing.get("duplicateCount", {"N": "0"})["N"]) + 1
        self.items[item_key] = {
            **existing,
            "duplicateCount": {"N": str(duplicate_count)},
            "lastDuplicateEventId": kwargs["ExpressionAttributeValues"][":eventId"],
        }
        return {}


def event() -> dict[str, Any]:
    return {
        "detail": {
            "eventId": "fdd6c7e3-b9cb-4d5b-a3db-55b830e472a0",
            "eventType": "report.finalized",
            "schemaVersion": "1.0",
            "occurredAt": "2026-07-09T12:00:00.000Z",
            "inspectionId": "aefec934-dd61-4ea4-80df-cd5101769924",
            "actor": {"id": "reviewer-1", "role": "reviewer"},
            "correlationId": "request-123",
            "payload": {"reportId": "report-1", "version": 3},
        }
    }


def test_projects_event_and_latest_state() -> None:
    client = FakeDynamo()
    result = project_event(event(), client, "inspectiq-operations")
    assert result["status"] == "projected"
    assert client.transactions == 1
    assert client.items[("PROJECTOR#HEALTH", "STATE")]["projectedCount"]["N"] == "1"
    assert (
        "INSPECTION#aefec934-dd61-4ea4-80df-cd5101769924",
        "STATE",
    ) in client.items


def test_duplicate_delivery_is_idempotent() -> None:
    client = FakeDynamo()
    project_event(event(), client, "inspectiq-operations")
    duplicate = project_event(event(), client, "inspectiq-operations")
    assert duplicate == {
        "status": "duplicate",
        "eventId": "fdd6c7e3-b9cb-4d5b-a3db-55b830e472a0",
    }
    assert client.transactions == 1
    assert client.items[("PROJECTOR#HEALTH", "STATE")]["duplicateCount"]["N"] == "1"


def test_rejects_unknown_schema_version() -> None:
    client = FakeDynamo()
    invalid = event()
    invalid["detail"]["schemaVersion"] = "2.0"
    try:
        project_event(invalid, client, "inspectiq-operations")
    except ValueError as error:
        assert "Unsupported" in str(error)
    else:
        raise AssertionError("Expected schema validation to fail")

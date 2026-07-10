from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone
from typing import Any, Protocol


class DynamoClient(Protocol):
    def transact_write_items(self, **kwargs: Any) -> dict[str, Any]: ...

    def get_item(self, **kwargs: Any) -> dict[str, Any]: ...

    def update_item(self, **kwargs: Any) -> dict[str, Any]: ...


REQUIRED_DETAIL_FIELDS = {
    "eventId",
    "eventType",
    "schemaVersion",
    "occurredAt",
    "inspectionId",
    "actor",
    "correlationId",
    "payload",
}


def _client() -> DynamoClient:
    import boto3

    return boto3.client("dynamodb", region_name=os.getenv("AWS_REGION", "us-east-1"))


def _detail(event: dict[str, Any]) -> dict[str, Any]:
    detail = event.get("detail", event)
    if isinstance(detail, str):
        detail = json.loads(detail)
    if not isinstance(detail, dict):
        raise ValueError("EventBridge detail must be an object.")
    missing = sorted(REQUIRED_DETAIL_FIELDS.difference(detail))
    if missing:
        raise ValueError(f"Domain event is missing required fields: {', '.join(missing)}")
    if detail["schemaVersion"] != "1.0":
        raise ValueError(f"Unsupported domain event schema version: {detail['schemaVersion']}")
    actor = detail["actor"]
    if not isinstance(actor, dict) or actor.get("role") not in {"inspector", "reviewer", "admin"}:
        raise ValueError("Domain event actor role is invalid.")
    if not isinstance(detail["payload"], dict):
        raise ValueError("Domain event payload must be an object.")
    return detail


def _epoch_after(days: int) -> int:
    return int(time.time()) + days * 24 * 60 * 60


def _is_duplicate(client: DynamoClient, table_name: str, event_id: str) -> bool:
    response = client.get_item(
        TableName=table_name,
        Key={"pk": {"S": f"EVENT#{event_id}"}, "sk": {"S": "IDEMPOTENCY"}},
        ConsistentRead=True,
    )
    return bool(response.get("Item"))


def project_event(event: dict[str, Any], client: DynamoClient, table_name: str) -> dict[str, Any]:
    detail = _detail(event)
    event_id = str(detail["eventId"])
    inspection_id = str(detail["inspectionId"])
    occurred_at = str(detail["occurredAt"])
    event_type = str(detail["eventType"])
    correlation_id = str(detail["correlationId"])
    actor_role = str(detail["actor"]["role"])
    timeline_key = f"EVENT#{occurred_at}#{event_id}"
    now = datetime.now(timezone.utc).isoformat()

    try:
        client.transact_write_items(
            TransactItems=[
                {
                    "Put": {
                        "TableName": table_name,
                        "Item": {
                            "pk": {"S": f"EVENT#{event_id}"},
                            "sk": {"S": "IDEMPOTENCY"},
                            "eventId": {"S": event_id},
                            "expiresAt": {"N": str(_epoch_after(7))},
                        },
                        "ConditionExpression": "attribute_not_exists(pk)",
                    }
                },
                {
                    "Put": {
                        "TableName": table_name,
                        "Item": {
                            "pk": {"S": f"INSPECTION#{inspection_id}"},
                            "sk": {"S": timeline_key},
                            "eventId": {"S": event_id},
                            "eventType": {"S": event_type},
                            "inspectionId": {"S": inspection_id},
                            "occurredAt": {"S": occurred_at},
                            "correlationId": {"S": correlation_id},
                            "actorRole": {"S": actor_role},
                            "gsi1pk": {"S": "OPS"},
                            "gsi1sk": {"S": f"{occurred_at}#{event_id}"},
                            "expiresAt": {"N": str(_epoch_after(30))},
                        },
                    }
                },
                {
                    "Update": {
                        "TableName": table_name,
                        "Key": {
                            "pk": {"S": f"INSPECTION#{inspection_id}"},
                            "sk": {"S": "STATE"},
                        },
                        "UpdateExpression": (
                            "SET latestEventId = :eventId, latestEventType = :eventType, "
                            "latestOccurredAt = :occurredAt, correlationId = :correlationId, updatedAt = :updatedAt"
                        ),
                        "ExpressionAttributeValues": {
                            ":eventId": {"S": event_id},
                            ":eventType": {"S": event_type},
                            ":occurredAt": {"S": occurred_at},
                            ":correlationId": {"S": correlation_id},
                            ":updatedAt": {"S": now},
                        },
                    }
                },
                {
                    "Update": {
                        "TableName": table_name,
                        "Key": {"pk": {"S": "PROJECTOR#HEALTH"}, "sk": {"S": "STATE"}},
                        "UpdateExpression": (
                            "ADD projectedCount :one SET lastEventId = :eventId, lastEventType = :eventType, "
                            "lastCorrelationId = :correlationId, lastProjectedAt = :updatedAt"
                        ),
                        "ExpressionAttributeValues": {
                            ":one": {"N": "1"},
                            ":eventId": {"S": event_id},
                            ":eventType": {"S": event_type},
                            ":correlationId": {"S": correlation_id},
                            ":updatedAt": {"S": now},
                        },
                    }
                },
            ]
        )
    except Exception:
        if _is_duplicate(client, table_name, event_id):
            client.update_item(
                TableName=table_name,
                Key={"pk": {"S": "PROJECTOR#HEALTH"}, "sk": {"S": "STATE"}},
                UpdateExpression="ADD duplicateCount :one SET lastDuplicateEventId = :eventId, lastDuplicateAt = :updatedAt",
                ExpressionAttributeValues={
                    ":one": {"N": "1"},
                    ":eventId": {"S": event_id},
                    ":updatedAt": {"S": now},
                },
            )
            return {"status": "duplicate", "eventId": event_id}
        raise

    return {
        "status": "projected",
        "eventId": event_id,
        "inspectionId": inspection_id,
        "eventType": event_type,
    }


def handler(event: dict[str, Any], _context: Any) -> dict[str, Any]:
    table_name = os.environ["OPERATIONS_TABLE_NAME"]
    result = project_event(event, _client(), table_name)
    print(
        json.dumps(
            {
                "level": "info",
                "event": "inspectiq.operations_projected",
                **result,
            },
            separators=(",", ":"),
        )
    )
    return result

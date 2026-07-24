from __future__ import annotations

from typing import Any


def read_urgency_score(value: Any) -> int:
    score = int(value)
    if score < 1 or score > 5:
        raise ValueError("Urgency score must be between 1 and 5")
    return score


def classify_urgency(value: Any) -> str:
    score = read_urgency_score(value)
    if score >= 4:
        return "HIGH"
    if score >= 2:
        return "MEDIUM"
    return "LOW"


def count_high_urgency(inspections: list[dict[str, Any]]) -> int:
    count = 0
    for inspection in inspections:
        if read_urgency_score(inspection["urgencyScore"]) >= 4:
            count += 1
    return count


def sort_by_urgency_and_sale_deadline(
    inspections: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    return sorted(
        inspections,
        key=lambda inspection: (
            -read_urgency_score(inspection["urgencyScore"]),
            inspection["saleDateTime"],
        ),
    )

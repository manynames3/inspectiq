import pytest

from app.urgency import (
    classify_urgency,
    count_high_urgency,
    read_urgency_score,
    sort_by_urgency_and_sale_deadline,
)


def test_scores_four_and_five_are_high_urgency() -> None:
    assert classify_urgency(4) == "HIGH"
    assert classify_urgency(5) == "HIGH"
    assert classify_urgency(3) == "MEDIUM"
    assert classify_urgency(1) == "LOW"


def test_high_urgency_count_uses_a_loop_not_sorting() -> None:
    inspections = [
        {"urgencyScore": 5},
        {"urgencyScore": 2},
        {"urgencyScore": 4},
    ]

    assert count_high_urgency(inspections) == 2


def test_sort_orders_by_urgency_then_sale_deadline() -> None:
    inspections = [
        {"vin": "LOW", "urgencyScore": 1, "saleDateTime": "2026-07-24T12:00:00Z"},
        {"vin": "HIGH-LATER", "urgencyScore": 5, "saleDateTime": "2026-07-24T11:00:00Z"},
        {"vin": "HIGH-SOONER", "urgencyScore": 5, "saleDateTime": "2026-07-24T09:00:00Z"},
    ]

    ordered = sort_by_urgency_and_sale_deadline(inspections)
    assert [item["vin"] for item in ordered] == ["HIGH-SOONER", "HIGH-LATER", "LOW"]


def test_invalid_numeric_urgency_is_rejected() -> None:
    with pytest.raises(ValueError):
        read_urgency_score(6)

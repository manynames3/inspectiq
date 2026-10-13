from app.recon_policy import (
    cost_overrun_requires_reauthorization,
    estimated_grade_after_authorized_recon,
    evaluate_authorization_policy,
)


POLICY = {
    "approvalMode": "AUTO_APPROVE_UNDER_LIMIT",
    "totalVehicleLimit": 500,
    "serviceRules": {
        "DETAIL": {"enabled": True, "automaticApprovalLimit": 200},
        "TIRE": {"enabled": True, "automaticApprovalLimit": 300},
        "BODY": {"enabled": True, "automaticApprovalLimit": 0},
    },
    "costOverrunTolerance": 25,
}


def test_only_authorized_recon_changes_projected_grade() -> None:
    projected_grade = estimated_grade_after_authorized_recon(
        4.2,
        [
            {"authorizationStatus": "AUTHORIZED", "expectedGradeLift": 0.3},
            {"authorizationStatus": "PENDING", "expectedGradeLift": 0.4},
            {"authorizationStatus": "DECLINED", "expectedGradeLift": 0.5},
        ],
    )

    assert projected_grade == 4.5


def test_projected_grade_cannot_exceed_five() -> None:
    projected_grade = estimated_grade_after_authorized_recon(
        4.9,
        [{"authorizationStatus": "AUTHORIZED", "expectedGradeLift": 1.0}],
    )

    assert projected_grade == 5.0


def test_service_limit_is_applied() -> None:
    eligible = evaluate_authorization_policy(POLICY, "DETAIL", 175, 0)
    above_limit = evaluate_authorization_policy(POLICY, "DETAIL", 225, 0)

    assert eligible["decision"] == "AUTO_AUTHORIZED"
    assert eligible["authorizationSource"] == "CONSIGNOR_POLICY"
    assert above_limit["decision"] == "MANUAL_REQUIRED"


def test_combined_cost_cannot_bypass_vehicle_limit() -> None:
    result = evaluate_authorization_policy(POLICY, "TIRE", 150, 400)

    assert result["decision"] == "MANUAL_REQUIRED"
    assert "combined authorized work" in result["reason"]


def test_cost_overrun_requires_reauthorization() -> None:
    assert cost_overrun_requires_reauthorization(300, 326, 25) is True
    assert cost_overrun_requires_reauthorization(300, 325, 25) is False

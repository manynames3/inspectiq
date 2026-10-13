from typing import Any


def clamp_reference_grade(value: float) -> float:
    """Keep an InspectIQ reference grade inside the documented 0.0-5.0 range."""
    bounded_value = max(0.0, min(5.0, value))
    return round(bounded_value, 1)


def estimated_grade_after_authorized_recon(
    condition_grade_before_recon: float,
    recommendations: list[dict[str, Any]],
) -> float:
    """Project grade lift from authorized recommendations only."""
    projected_grade = condition_grade_before_recon

    for recommendation in recommendations:
        if recommendation.get("authorizationStatus") != "AUTHORIZED":
            continue
        projected_grade += float(recommendation.get("expectedGradeLift", 0.0))

    return clamp_reference_grade(projected_grade)


def evaluate_authorization_policy(
    policy: dict[str, Any],
    service_type: str,
    estimated_cost: float,
    already_authorized_cost: float,
) -> dict[str, Any]:
    """Return the policy decision without treating an automatic decision as a user approval."""
    total_vehicle_limit = float(policy.get("totalVehicleLimit", 0.0))
    remaining_vehicle_limit = max(0.0, total_vehicle_limit - already_authorized_cost)
    approval_mode = str(policy.get("approvalMode", "MANUAL"))

    if approval_mode == "NO_RECON":
        return {
            "decision": "POLICY_DECLINED",
            "authorizationSource": None,
            "reason": "The consignor policy does not authorize recon work.",
        }

    service_rules = policy.get("serviceRules", {})
    service_rule = service_rules.get(service_type)
    if not service_rule or not service_rule.get("enabled", False):
        return {
            "decision": "MANUAL_REQUIRED",
            "authorizationSource": None,
            "reason": f"{service_type} work is not enabled for automatic authorization.",
        }

    if approval_mode == "MANUAL":
        return {
            "decision": "MANUAL_REQUIRED",
            "authorizationSource": None,
            "reason": "The consignor policy requires a person to approve recon spending.",
        }

    service_limit = float(service_rule.get("automaticApprovalLimit", 0.0))
    if estimated_cost > service_limit:
        return {
            "decision": "MANUAL_REQUIRED",
            "authorizationSource": None,
            "reason": f"The estimate exceeds the {service_type} automatic approval limit.",
        }

    if estimated_cost > remaining_vehicle_limit:
        return {
            "decision": "MANUAL_REQUIRED",
            "authorizationSource": None,
            "reason": "The combined authorized work would exceed the vehicle authorization limit.",
        }

    authorization_source = (
        "MANAGED_PROGRAM_POLICY"
        if approval_mode == "MANAGED_PROGRAM"
        else "CONSIGNOR_POLICY"
    )
    return {
        "decision": "AUTO_AUTHORIZED",
        "authorizationSource": authorization_source,
        "reason": "The estimate is eligible under the consignor authorization policy.",
    }


def cost_overrun_requires_reauthorization(
    authorized_amount: float,
    current_estimated_cost: float,
    cost_overrun_tolerance: float,
) -> bool:
    permitted_total = authorized_amount + cost_overrun_tolerance
    return current_estimated_cost > permitted_total

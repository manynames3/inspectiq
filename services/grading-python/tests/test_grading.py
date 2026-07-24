from datetime import date

from fastapi.testclient import TestClient

from app.main import GradeRequest, app, clamp_grade, grade_condition


client = TestClient(app)


def request(year: int, mileage: int, completion: float, damage: list[dict]) -> GradeRequest:
    return GradeRequest(
        vehicle={"year": year, "mileage": mileage},
        requiredPhotoCompletion=completion,
        damageItems=damage,
    )


def test_grade_always_remains_between_zero_and_five() -> None:
    severe_damage = [
        {"location": f"panel {index}", "damageType": "dent", "severity": "severe"}
        for index in range(10)
    ]
    response = grade_condition(request(2025, 12000, 1.0, severe_damage))

    assert response.suggestedGrade == 0.0
    assert clamp_grade(8.2) == 5.0
    assert clamp_grade(-3.0) == 0.0


def test_clean_vehicle_reference_grade() -> None:
    response = grade_condition(request(2025, 12000, 1.0, []))

    assert response.suggestedGrade == 5.0
    assert response.conditionGradeBeforeRecon == 5.0


def test_damage_severity_changes_grade() -> None:
    response = grade_condition(
        request(
            date.today().year,
            10000,
            1.0,
            [
                {"location": "front bumper", "damageType": "scratch", "severity": "minor"},
                {"location": "rear bumper", "damageType": "dent", "severity": "severe"},
            ],
        )
    )

    assert response.suggestedGrade == 4.0
    assert response.explanation.deductions[0].amount == 0.15


def test_missing_evidence_is_a_blocker_not_a_grade_deduction() -> None:
    response = grade_condition(request(date.today().year, 10000, 0.5, []))

    assert response.suggestedGrade == 5.0
    assert response.evidenceBlockers == ["Required inspection photographs are incomplete"]


def test_mileage_and_age_are_report_facts_not_deductions() -> None:
    older_high_mileage = grade_condition(request(2001, 250000, 1.0, []))
    new_low_mileage = grade_condition(request(2026, 1000, 1.0, []))

    assert older_high_mileage.suggestedGrade == new_low_mileage.suggestedGrade == 5.0


def test_grade_endpoint() -> None:
    response = client.post(
        "/grade",
        json={
            "vehicle": {"year": date.today().year, "mileage": 10000},
            "requiredPhotoCompletion": 1,
            "damageItems": [{"location": "front bumper", "damageType": "scratch", "severity": "minor"}],
        },
    )

    assert response.status_code == 200
    assert response.json()["suggestedGrade"] == 4.8
    assert response.json()["gradingVersion"] == "inspectiq-reference-grade-v2-python"

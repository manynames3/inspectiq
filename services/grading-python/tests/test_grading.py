from datetime import date

from fastapi.testclient import TestClient

from app.main import app, grade_condition, GradeRequest


client = TestClient(app)


def request(year: int, mileage: int, completion: float, damage: list[dict]) -> GradeRequest:
    return GradeRequest(
        vehicle={"year": year, "mileage": mileage},
        requiredPhotoCompletion=completion,
        damageItems=damage,
    )


def test_clean_vehicle_grade() -> None:
    response = grade_condition(request(2025, 12000, 1.0, []))

    assert response.grade == "A"
    assert response.score >= 94


def test_minor_damage_deduction() -> None:
    response = grade_condition(
        request(
            date.today().year,
            10000,
            1.0,
            [{"location": "front bumper", "damageType": "scratch", "severity": "minor"}],
        )
    )

    assert response.score == 97


def test_severe_damage_deduction() -> None:
    response = grade_condition(
        request(
            date.today().year,
            10000,
            1.0,
            [{"location": "rear bumper", "damageType": "dent", "severity": "severe"}],
        )
    )

    assert response.score == 82


def test_shared_damage_types_match_api_contract() -> None:
    response = grade_condition(
        request(
            date.today().year,
            10000,
            1.0,
            [{"location": "left rear wheel", "damageType": "wheel_damage", "severity": "unknown"}],
        )
    )

    assert response.score == 95
    assert response.explanation.deductions[0].reason == "unknown wheel damage on left rear wheel"


def test_missing_photo_penalty() -> None:
    response = grade_condition(request(date.today().year, 10000, 0.5, []))

    assert response.score == 88


def test_mileage_adjustment() -> None:
    response = grade_condition(request(date.today().year, 130000, 1.0, []))

    assert response.score == 90


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
    assert response.json()["score"] == 97
    assert response.json()["gradingVersion"] == "grading-rules-v1-python"

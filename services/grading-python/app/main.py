from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import FastAPI
from pydantic import BaseModel, Field


class Vehicle(BaseModel):
    year: int = Field(ge=1980)
    mileage: int = Field(ge=0)


class DamageItem(BaseModel):
    location: str = Field(min_length=1)
    damageType: Literal[
        "scratch",
        "dent",
        "crack",
        "paint_damage",
        "glass_damage",
        "wheel_damage",
        "interior_wear",
        "unknown",
    ]
    severity: Literal["minor", "moderate", "severe", "unknown"]


class GradeRequest(BaseModel):
    vehicle: Vehicle
    requiredPhotoCompletion: float = Field(ge=0, le=1)
    damageItems: list[DamageItem] = Field(default_factory=list)


class Deduction(BaseModel):
    reason: str
    points: int


class GradeExplanation(BaseModel):
    baseScore: int
    deductions: list[Deduction]
    completionPenalty: int
    mileageAdjustment: int
    ageAdjustment: int


class GradeResponse(BaseModel):
    score: int = Field(ge=0, le=100)
    grade: Literal["A", "B", "C", "D", "F"]
    explanation: GradeExplanation
    gradingVersion: str


app = FastAPI(title="InspectIQ Grading Service", version="0.1.0")


def mileage_adjustment(mileage: int) -> int:
    if mileage > 120_000:
        return 10
    if mileage > 90_000:
        return 7
    if mileage > 60_000:
        return 4
    if mileage > 30_000:
        return 2
    return 0


def letter_grade(score: int) -> Literal["A", "B", "C", "D", "F"]:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"


def grade_condition(request: GradeRequest) -> GradeResponse:
    severity_points = {"severe": 18, "moderate": 9, "minor": 3, "unknown": 5}
    deductions = [
        Deduction(
            reason=f"{item.severity} {item.damageType.replace('_', ' ')} on {item.location}",
            points=severity_points[item.severity],
        )
        for item in request.damageItems
    ]

    missing_ratio = max(0, 1 - request.requiredPhotoCompletion)
    completion_penalty = round(missing_ratio * 24)
    mileage = mileage_adjustment(request.vehicle.mileage)
    age = max(0, min(8, (date.today().year - request.vehicle.year) // 3))
    total = sum(item.points for item in deductions) + completion_penalty + mileage + age
    score = max(0, min(100, 100 - total))

    return GradeResponse(
        score=score,
        grade=letter_grade(score),
        explanation=GradeExplanation(
            baseScore=100,
            deductions=deductions,
            completionPenalty=completion_penalty,
            mileageAdjustment=mileage,
            ageAdjustment=age,
        ),
        gradingVersion="grading-rules-v1-python",
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true", "service": "inspectiq-grading-python"}


@app.post("/grade", response_model=GradeResponse)
def grade(request: GradeRequest) -> GradeResponse:
    return grade_condition(request)

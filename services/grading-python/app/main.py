from __future__ import annotations

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
    amount: float = Field(ge=0, le=5)


class GradeExplanation(BaseModel):
    baseGrade: float = Field(ge=0, le=5)
    deductions: list[Deduction]


class GradeResponse(BaseModel):
    suggestedGrade: float = Field(ge=0, le=5)
    conditionGradeBeforeRecon: float = Field(ge=0, le=5)
    evidenceBlockers: list[str]
    explanation: GradeExplanation
    gradingVersion: str


app = FastAPI(title="InspectIQ Grading Service", version="0.2.0")


def clamp_grade(value: float) -> float:
    bounded_value = max(0.0, min(5.0, value))
    return round(bounded_value, 1)


def severity_deduction(severity: str) -> float:
    if severity == "severe":
        return 0.9
    if severity == "moderate":
        return 0.45
    if severity == "minor":
        return 0.15
    return 0.3


def grade_condition(request: GradeRequest) -> GradeResponse:
    deductions: list[Deduction] = []
    for item in request.damageItems:
        deductions.append(
            Deduction(
                reason=f"{item.severity} {item.damageType.replace('_', ' ')} on {item.location}",
                amount=severity_deduction(item.severity),
            )
        )

    evidence_blockers: list[str] = []
    if request.requiredPhotoCompletion < 1:
        evidence_blockers.append("Required inspection photographs are incomplete")

    total_deduction = 0.0
    for deduction in deductions:
        total_deduction += deduction.amount

    suggested_grade = clamp_grade(5.0 - total_deduction)
    return GradeResponse(
        suggestedGrade=suggested_grade,
        conditionGradeBeforeRecon=suggested_grade,
        evidenceBlockers=evidence_blockers,
        explanation=GradeExplanation(
            baseGrade=5.0,
            deductions=deductions,
        ),
        gradingVersion="inspectiq-reference-grade-v2-python",
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"ok": "true", "service": "inspectiq-grading-python"}


@app.post("/grade", response_model=GradeResponse)
def grade(request: GradeRequest) -> GradeResponse:
    return grade_condition(request)

package com.inspectiq.grading;

import java.util.List;
import java.util.Map;

public record GradeResponse(
    int score,
    String grade,
    Map<String, Object> explanation,
    String gradingVersion) {

  public record Deduction(String reason, int points) {
  }

  public static GradeResponse of(int score, String grade, List<Deduction> deductions, int completionPenalty, int mileageAdjustment, int ageAdjustment) {
    return new GradeResponse(
        score,
        grade,
        Map.of(
            "baseScore", 100,
            "deductions", deductions,
            "completionPenalty", completionPenalty,
            "mileageAdjustment", mileageAdjustment,
            "ageAdjustment", ageAdjustment),
        "grading-rules-v1");
  }
}


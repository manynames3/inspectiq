package com.inspectiq.grading;

import java.time.Year;
import java.util.ArrayList;
import java.util.List;
import org.springframework.stereotype.Service;

@Service
public class GradeService {
  public GradeResponse grade(GradeRequest request) {
    List<GradeResponse.Deduction> deductions = new ArrayList<>();

    for (GradeRequest.DamageItem item : request.damageItems()) {
      int points = switch (item.severity()) {
        case "severe" -> 18;
        case "moderate" -> 9;
        case "minor" -> 3;
        default -> 5;
      };
      deductions.add(new GradeResponse.Deduction(
          "%s %s on %s".formatted(item.severity(), item.damageType().replace("_", " "), item.location()),
          points));
    }

    int completionPenalty = (int) Math.round(Math.max(0, 1 - request.requiredPhotoCompletion()) * 24);
    int mileageAdjustment = mileageAdjustment(request.vehicle().mileage());
    int ageAdjustment = Math.max(0, Math.min(8, (Year.now().getValue() - request.vehicle().year()) / 3));
    int totalDeductions = deductions.stream().mapToInt(GradeResponse.Deduction::points).sum()
        + completionPenalty + mileageAdjustment + ageAdjustment;
    int score = Math.max(0, Math.min(100, 100 - totalDeductions));

    return GradeResponse.of(score, letter(score), deductions, completionPenalty, mileageAdjustment, ageAdjustment);
  }

  private int mileageAdjustment(int mileage) {
    if (mileage > 120_000) return 10;
    if (mileage > 90_000) return 7;
    if (mileage > 60_000) return 4;
    if (mileage > 30_000) return 2;
    return 0;
  }

  private String letter(int score) {
    if (score >= 90) return "A";
    if (score >= 80) return "B";
    if (score >= 70) return "C";
    if (score >= 60) return "D";
    return "F";
  }
}


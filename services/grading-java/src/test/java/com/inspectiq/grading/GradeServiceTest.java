package com.inspectiq.grading;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Year;
import java.util.List;
import org.junit.jupiter.api.Test;

class GradeServiceTest {
  private final GradeService service = new GradeService();

  @Test
  void cleanVehicleGrade() {
    GradeResponse response = service.grade(request(2025, 12000, 1.0, List.of()));
    assertThat(response.grade()).isEqualTo("A");
    assertThat(response.score()).isGreaterThanOrEqualTo(94);
  }

  @Test
  void minorDamageDeduction() {
    GradeResponse response = service.grade(request(Year.now().getValue(), 10000, 1.0,
        List.of(new GradeRequest.DamageItem("front bumper", "scratch", "minor"))));
    assertThat(response.score()).isEqualTo(97);
  }

  @Test
  void severeDamageDeduction() {
    GradeResponse response = service.grade(request(Year.now().getValue(), 10000, 1.0,
        List.of(new GradeRequest.DamageItem("rear bumper", "dent", "severe"))));
    assertThat(response.score()).isEqualTo(82);
  }

  @Test
  void missingPhotoPenalty() {
    GradeResponse response = service.grade(request(Year.now().getValue(), 10000, 0.5, List.of()));
    assertThat(response.score()).isEqualTo(88);
  }

  @Test
  void mileageAdjustment() {
    GradeResponse response = service.grade(request(Year.now().getValue(), 130000, 1.0, List.of()));
    assertThat(response.score()).isEqualTo(90);
  }

  private GradeRequest request(int year, int mileage, double completion, List<GradeRequest.DamageItem> damage) {
    return new GradeRequest(new GradeRequest.Vehicle(year, mileage), completion, damage);
  }
}


package com.inspectiq.grading;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record GradeRequest(
    @Valid @NotNull Vehicle vehicle,
    @Min(0) @Max(1) double requiredPhotoCompletion,
    @Valid @NotNull List<DamageItem> damageItems) {

  public record Vehicle(
      @Min(1980) int year,
      @Min(0) int mileage) {
  }

  public record DamageItem(
      @NotNull String location,
      @NotNull String damageType,
      @NotNull String severity) {
  }
}


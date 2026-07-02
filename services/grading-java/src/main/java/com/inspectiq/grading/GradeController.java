package com.inspectiq.grading;

import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class GradeController {
  private final GradeService gradeService;

  public GradeController(GradeService gradeService) {
    this.gradeService = gradeService;
  }

  @PostMapping("/grade")
  public GradeResponse grade(@Valid @RequestBody GradeRequest request) {
    return gradeService.grade(request);
  }
}


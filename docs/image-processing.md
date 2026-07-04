# Image Processing

Local flow:

1. Attach required photo evidence or upload a vehicle photo.
2. Store S3-style object metadata on the inspection.
3. Create an `image_analysis_jobs` row with queued status and idempotency key.
4. Run the selected vision provider.
5. Validate output against `VisionOutputSchema`.
6. Save raw output and validated output separately.
7. Create pending suggestions for angle, image-quality retakes, damage candidates, and extracted text.
8. Require human accept, reject, or edit.

Production AWS flow:

```mermaid
flowchart LR
  Upload[Presigned S3 upload] --> Event[S3/EventBridge event]
  Event --> Queue[SQS image analysis queue]
  Queue --> Worker[Image analysis worker]
  Worker --> Bedrock[Bedrock multimodal model]
  Worker --> Validate[Zod or JSON Schema validation]
  Validate --> DB[(Postgres jobs, outputs, suggestions)]
  DB --> Audit[Audit event]
```

Job statuses:

- `queued`
- `running`
- `completed`
- `failed`
- `dead_letter`

Contract fields:

- required angle and confidence;
- image-quality grade, blur score, exposure score, framing score, resolution score, occlusion risk, and retake-required flag;
- damage candidate location, type, severity, confidence, explanation, and repair estimate range;
- OCR values for odometer and VIN;
- human-review routing.

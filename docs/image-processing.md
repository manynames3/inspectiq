# Image Processing

Local flow:

1. Attach a photographic sample image or upload image metadata.
2. Store S3-style object metadata on the inspection.
3. Run the selected vision provider.
4. Validate output against `VisionOutputSchema`.
5. Save raw output and validated output separately.
6. Create pending suggestions for angle, quality warnings, damage candidates, and extracted text.
7. Require human accept, reject, or edit.

Production AWS flow:

```mermaid
flowchart LR
  Upload[Presigned S3 upload] --> Event[S3/EventBridge event]
  Event --> Queue[SQS image analysis queue]
  Queue --> Worker[Image analysis worker]
  Worker --> Bedrock[Bedrock multimodal model]
  Worker --> Validate[Zod or JSON Schema validation]
  Validate --> DB[(Postgres)]
  DB --> Audit[Audit event]
```

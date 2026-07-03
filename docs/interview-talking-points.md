# Interview Talking Points

1. Why build this? To model a wholesale/offsite inspection workflow with AI assistance, deterministic rules, and review controls.
2. Relevance? Inspection teams handle image ingestion, required-angle quality, damage documentation, CR readiness, VDP readiness, buyer trust, seller disclosure, auditability, and reviewer workflows.
3. Why advisory AI? Model output can be uncertain, so humans confirm facts before grading or disclosure.
4. Why deterministic grading? Scores need explainable, repeatable business rules.
5. Why Java service? It shows a service boundary for independently owned business rules; it could be collapsed early in a smaller system.
6. Why async reports? Model calls can be slow, fail, or need retries without blocking the UI.
7. Image processing? Provider interface, strict schema validation, raw and validated output, angle confidence, damage confidence, OCR, repair estimate range, pending suggestions.
8. AWS scale? React -> API Gateway/Lambda or ECS -> Neon Free Postgres/Aurora -> S3 -> SQS/EventBridge -> image worker -> Bedrock/Rekognition/custom model -> validated suggestions -> audit trail.
9. AI failure? Save failed jobs, preserve audit events, block finalization, retry safely.
10. Prevent hallucinations? Constrain prompts to confirmed facts and validate schema.
11. Audit trail value? It explains every AI suggestion, human decision, grade, report edit, and finalization.
12. Role model? Inspector handles intake and image analysis, Reviewer confirms AI findings and finalizes reports, Admin owns corrections and exception handling.
13. More time? Full Postgres repository, presigned uploads, real Bedrock/Rekognition/custom model integration, richer failed-image workflows.
14. AI coding tools? Use them to draft, then validate with tests, schemas, and manual review.
15. MVP tradeoff? I kept AI deterministic locally so the walkthrough never fails, but shaped the interfaces around real async model workflows.

## 5-Minute Walkthrough Script

1. Start on Dashboard: "This is a wholesale inspection queue. The operational outcome is a trusted CR and buyer-visible release."
2. Start as Inspector, open New Inspection, create a vehicle, then attach the required photo set: "Inspectors own intake, photo evidence, and image-analysis execution."
3. Run analysis: "The provider returns angle, quality, damage, OCR, confidence, and repair estimate fields, and the API validates the schema before creating suggestions."
4. Switch to Reviewer and open Suggestions: "AI is advisory. Photo angles, damage candidates, and OCR stay pending until a reviewer accepts, rejects, or edits them."
5. Accept required photo-angle suggestions and damage candidates: "Accepted evidence updates completeness, accepted damage materializes as a damage item, and the workbench updates CR/VDP/recon/arbitration status."
6. Open Damage and Report: "Manual and AI-sourced damage feed deterministic grading and reconditioning estimates. The report draft only uses confirmed facts."
7. Draft the report, edit if needed, then finalize: "Finalization is a terminal state. After this, material workflow endpoints reject edits."
8. Open Audit and Platform Health: "This is the operational story: request IDs, provider metadata, prompt versions, schema validation, human decisions, metrics, and deployment tradeoffs."

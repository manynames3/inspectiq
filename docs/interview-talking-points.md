# Interview Talking Points

1. Why build this? To model a realistic inspection and imaging workflow with AI assistance, deterministic rules, and review controls.
2. Relevance? Inspection teams handle image ingestion, evidence quality, damage documentation, auditability, and reviewer workflows.
3. Why advisory AI? Model output can be uncertain, so humans confirm facts before grading or disclosure.
4. Why deterministic grading? Scores need explainable, repeatable business rules.
5. Why Java service? It shows a service boundary for independently owned business rules; it could be collapsed early in a smaller system.
6. Why async reports? Model calls can be slow, fail, or need retries without blocking the UI.
7. Image processing? Provider interface, strict schema validation, raw and validated output, pending suggestions.
8. AWS scale? S3, EventBridge/SQS, workers, Step Functions, Bedrock, Postgres, CloudWatch.
9. AI failure? Save failed jobs, preserve audit events, block finalization, retry safely.
10. Prevent hallucinations? Constrain prompts to confirmed facts and validate schema.
11. Audit trail value? It explains every AI suggestion, human decision, grade, report edit, and finalization.
12. Production auth? Cognito/OIDC, JWT validation, RBAC, object-level authorization.
13. More time? Full Postgres repository, presigned uploads, real Bedrock integration, richer reviewer queues.
14. AI coding tools? Use them to draft, then validate with tests, schemas, and manual review.
15. MVP tradeoff? Complete workflow beats broad unfinished infrastructure.

## 5-Minute Walkthrough Script

1. Start on Dashboard: "This is an inspection workbench for evidence completeness, AI suggestions, condition grading, and reviewer approval."
2. Open New Inspection, create a vehicle, then attach the complete sample set: "The sample images keep the workflow deterministic, but the data model matches an S3 upload flow."
3. Run analysis: "The mock provider stands in for Bedrock multimodal analysis, and the API validates the model output before storing raw and normalized results."
4. Open Suggestions: "AI is advisory. Photo angles and damage candidates stay pending until a human accepts, rejects, or edits them."
5. Accept required photo-angle suggestions and one damage candidate: "Accepted evidence updates completeness, and accepted damage materializes as a damage item with an audit event."
6. Open Damage and Report: "Manual and AI-sourced damage feed a deterministic grade. The report draft only uses confirmed facts."
7. Draft the report, edit if needed, then finalize: "Finalization is a terminal state. After this, material workflow endpoints reject edits."
8. Open Audit and Platform Health: "This is the operational story: request IDs, provider metadata, human decisions, state changes, and deployment tradeoffs."

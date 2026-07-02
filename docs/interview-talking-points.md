# Interview Talking Points

1. Why build this? To model a realistic inspection and imaging workflow with AI assistance, deterministic rules, and review controls.
2. Relevance? Inspection teams handle image ingestion, evidence quality, damage documentation, auditability, and reviewer workflows.
3. Why advisory AI? Model output can be uncertain, so humans confirm facts before grading or disclosure.
4. Why deterministic grading? Scores need explainable, repeatable business rules.
5. Why Java service? It demonstrates a service boundary for independently owned business rules; it could be collapsed early in a smaller system.
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


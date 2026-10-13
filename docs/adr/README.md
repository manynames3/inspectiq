# Architecture Decision Records

These records describe `agent/inspection-recon-operations`, which remains unmerged into `main`. They explain decisions and tradeoffs; they are not proof that every service or proposed model is deployed.

| ADR | Decision | Implementation boundary |
| --- | --- | --- |
| [0001 — Architecture choice](0001-architecture-choice.md) | Monorepo with web, API, shared contracts, Python boundaries, and Terraform. | Expo/React Native is the native client; see the [C4 map](../c4.md). |
| [0002 — Async report generation](0002-async-ai-report-generation.md) | Explicit report jobs and retryable provider work. | An async-shaped API is not a separately deployed Step Functions workflow. |
| [0003 — AI human review](0003-ai-human-review.md) | Model output stays advisory until a human decides. | Schema validity or model confidence does not establish field accuracy. |
| [0004 — Deterministic grading](0004-deterministic-grading-vs-generative-ai.md) | Grade from auditable business rules, not generative text. | InspectIQ's reference grade is not a proprietary auction score. |
| [0005 — Python grading boundary](0005-python-grading-service-boundary.md) | Separate grading only when ownership/reuse justifies it. | Optional HTTP service; equivalent Node rules keep the workflow available. |
| [0006 — Presigned image uploads](0006-s3-presigned-image-uploads.md) | Private S3 objects with short-lived client upload access. | API still authorizes the inspection and validates upload metadata. |
| [0007 — Serverless vs containers](0007-serverless-vs-containers.md) | Prefer request-driven AWS services. | C4 "container" means application/data store, not a Docker mandate. |
| [0008 — Local AI provider](0008-local-ai-provider-for-development.md) | Deterministic providers for development and regression. | Contract/workflow proof, not a computer-vision benchmark. |
| [0009 — Orchestration and vision services](0009-aws-orchestration-and-vision-services.md) | SQS jobs, EventBridge events, Postgres truth, DynamoDB projections. | No direct Postgres-to-EventBridge delivery; API/worker flush the persisted outbox. |
| [0010 — Hybrid AI/ML direction](0010-hybrid-ai-ml-image-analysis.md) | Specialized automotive models may complement Bedrock. | Dedicated damage segmentation, calibrated OCR, and angle models are not implemented. |
| [0011 — Offline capture, online decisions](0011-offline-capture-online-decisions.md) | Durable native capture; server-authoritative review/release. | Cached assignments and queued uploads are not finalized reports. |
| [0012 — Shared brand, evidence-first surfaces](0012-shared-brand-evidence-first-surfaces.md) | Shared tokens; task-specific desktop and native UI. | No new mobile framework, shared UI renderer, or backend approval shortcut. |

The first ten records predate this documentation refresh and retain their original wording. ADRs 0011–0012 record already-implemented choices, not a new infrastructure migration.

For a new record, include status, context, decision, alternatives, consequences, and links to the implementation. Clearly distinguish an implemented decision from a future direction; do not mark a proposed deployment as already operational.

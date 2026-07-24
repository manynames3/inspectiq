# Engineering Iterations

InspectIQ was tightened through review passes focused on walkthrough reliability, production ambiguity, and end-user friction. Each change below closes a concrete risk and records why the tradeoff was made.

| Concern found | Improvement made | Reasoning |
| --- | --- | --- |
| Image analysis needed stronger evidence grounding | Added source-documented vehicle photo sets, bad-capture cases, a model evaluation report, and a deployed Bedrock multimodal provider. | Local analysis stays deterministic for repeatable CI; the deployed path uses the same schema contract with Bedrock. |
| Reference data could be mistaken for model output | Separated source-manifest mappings from model analysis, removed unsupported damage claims, stopped metadata-derived OCR, and added startup reconciliation. | A source photo, checklist slot, model finding, and reviewer-confirmed fact are different evidence classes. |
| Evaluation labels overstated visible damage | Replaced mislabeled, duplicated, and pixel-identical cases with hash-distinct, source-documented offline cases. | Ground truth must be defensible from pixels, provenance, and dataset identity. |
| The first live positive case was not representative of U.S. wholesale inventory | Replaced it with a source-attributed 2022 Ford Escape SE from Copart lot `51175056`; Bedrock identified visible rear damage and a Reviewer accepted it. | Marketplace evidence is operationally relevant, but its images stay out of Git. VIN verification remains separate from OCR. |
| Concurrent marketplace-photo analysis exposed DynamoDB transaction conflicts in the Bedrock cost guard | Added bounded full-jitter retries around the atomic idempotency reservation and monthly usage increment. | The quota remains fail-closed and duplicate-safe while normal SQS batch concurrency no longer turns transient conflicts into failed image jobs. |
| A low-quality VIN image was also labeled as an analysis failure | Split completed-but-unusable evidence from provider or job failure and added regression coverage. | A retake needs field recapture; an analysis failure needs retry or operator recovery. |
| Roles were too similar | Split Inspector, Reviewer, and Admin responsibilities in UI, API RBAC, tests, and proof docs. | Local role sessions support repeatable review; the deployed path uses Cognito/JWT claims. |
| Field capture needed a production-shaped mobile path | Added an Expo/React Native client with Cognito PKCE, SecureStore, SQLite queues, offline capture, idempotent sync, and local quality guidance. | Capture works offline; approval and buyer-visible mutations remain online. |
| Android tabs overlapped system navigation | Made the native tab bar bottom-inset aware and added layout coverage. | Safe areas are a functional input, not cosmetic padding. |
| Clean-runner CI exposed local assumptions | Added workflow contract tests, Android build verification, emulator handling, and separate visual baselines. | CI must distinguish application failure from runner or emulator failure. |
| Async operations needed durable delivery semantics | Added a Postgres outbox, EventBridge events, a Python projector Lambda, DynamoDB idempotency/projections, DLQ handling, replay, and correlation IDs. | Neon remains authoritative; DynamoDB holds disposable operational state. |
| A DynamoDB authorization failure looked like spent model budget | Distinguished quota exhaustion from reservation infrastructure failure and corrected table-scoped IAM. | Cost controls should fail closed without hiding the actual operational fault. |
| Lambda cold starts exposed boot-time write contention | Made loaded Postgres cold starts read-only and covered bootstrap persistence decisions with tests. | Read traffic must not become implicit database writes. |
| Repeated analysis and concurrent reconciliation created duplicate review cards for one photo | Added semantic suggestion keys, application-level reuse, migration cleanup, and a Postgres uniqueness constraint. | One photo finding should create one actionable decision while prior reviewer actions remain available in the audit trail. |
| Imported listing assets could display external bytes while Bedrock analyzed an older S3 object | Made private S3 the shared preview/analysis authority, limited manifests to provenance and slot metadata, superseded unresolved findings on reanalysis, validated model consistency, and detect media type from bytes. | Every visual claim must resolve to the same immutable evidence bytes; stale source notes, URLs, or headers cannot contradict the reviewer-visible photo. |
| Imported side views were cross-mapped and a legacy manifest note remained an accepted quality finding | Corrected the Honda side mapping using physical vehicle cues, removed unsupported reference-authored quality claims from active state, retained each prior decision in an audit correction event, removed declared-slot anchoring from the Bedrock prompt, and raised the damage precision gate to `0.85`. | Side identity, capture quality, and damage must come from canonical image bytes or human review; marginal visual guesses should not become operational facts. |
| The account had a 10-concurrency Lambda quota | Kept the projector on unreserved concurrency and retained retry, idempotency, and DLQ controls. | The design respects the real account limit without adding idle infrastructure. |
| Production readiness was buried in docs | Added Platform Health runtime proof for auth, persistence, providers, queues, analysis, and recovery state. | Architecture should be observable in the product. |
| Operations lacked a demonstrable failure path | Added guarded Admin simulation and recovery for image-analysis jobs in local mode. | It demonstrates retry and recovery without injecting production AWS failures. |
| Persistence looked transitional | Moved deployed Postgres hot paths toward row-level upsert/delete and conditional versions. | The hosted slice is credible; higher concurrency still calls for DB-first aggregate repositories. |
| Dense screens could regress | Added Playwright screenshots for the main operational views and mobile capture. | Visual behavior is verified instead of inferred from CSS. |
| CR and recon comparisons were ambiguous for newly added vehicles | Backfilled recon intake incrementally, labeled incomplete scores as preliminary, and surfaced confirmed-damage ranges beside clean `$0` outcomes. | Operators can compare vehicles without implying that a CR score alone proves repair scope or that incomplete evidence is a final report. |
| Architecture could look over-scaffolded | Kept the AWS diagram to services actually used and documented deferred choices separately. | Services such as OpenSearch, Kinesis, Step Functions, and Rekognition are not included for resume value alone. |

Related documents:

- [Implementation boundary](implementation-boundary.md)
- [Production readiness](production-readiness.md)
- [Architecture decisions](adr/0001-architecture-choice.md)
- [Model evaluation report](model-evaluation-report.md)

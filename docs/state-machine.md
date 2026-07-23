# Business State Machines

InspectIQ keeps business workflow states separate from internal AI/report job states. Every business transition is validated by the API; invalid transitions return a domain error instead of silently changing the record.

## Inspection

```text
ASSIGNED
-> CAPTURE_IN_PROGRESS
-> REVIEW_READY
-> RETAKE_REQUIRED
-> CAPTURE_IN_PROGRESS

REVIEW_READY
-> CR_PUBLISHED
```

`CR_PUBLISHED` means the required evidence is complete, AI-assisted findings have received human decisions, the 0.0–5.0 InspectIQ Reference Grade is approved, and the report version is published.

## Recon Authorization

```text
ESTIMATE_PENDING
-> AUTHORIZATION_PENDING
-> AUTHORIZED
-> PARTIALLY_AUTHORIZED
-> DECLINED

AUTHORIZED or PARTIALLY_AUTHORIZED
-> REAUTHORIZATION_REQUIRED
-> AUTHORIZED, PARTIALLY_AUTHORIZED, or DECLINED
```

The plan status is derived from its item decisions. Policy authorization and human authorization remain visibly distinct.

## Work Order

```text
QUEUED
-> IN_PROGRESS
-> BLOCKED
-> IN_PROGRESS
-> QC_REQUIRED
-> COMPLETED

QC_REQUIRED
-> IN_PROGRESS  (failed QC)
```

Only authorized recommendations create work orders. A cost overrun blocks the affected order until reauthorization.

## Sale Readiness

```text
BLOCKED
-> READY
-> SCHEDULED
```

Readiness is recalculated from backend facts and includes structured blocker codes. Failed QC, incomplete required work, pending reauthorization, missing evidence, an unpublished report, or incomplete disclosures prevent `READY`.

## Internal Report Lifecycle

The existing report-generation lifecycle remains an implementation detail:

```text
DRAFT -> NEEDS_PHOTOS -> READY_FOR_GRADING -> GRADED
GRADED -> AI_DRAFT_PENDING
AI_DRAFT_PENDING -> AI_DRAFTED | HUMAN_REVIEW_REQUIRED | REPORT_FAILED
REPORT_FAILED -> AI_DRAFT_PENDING
AI_DRAFTED -> HUMAN_REVIEW_REQUIRED | FINALIZED
HUMAN_REVIEW_REQUIRED -> AI_DRAFT_PENDING | FINALIZED
```

`FINALIZED` is terminal for normal report users. This internal lifecycle does not replace inspection, authorization, work-order, or sale-readiness state.

## Concurrency

Mutable authorization and work-order commands include `expectedVersion`. A stale command returns `409 VERSION_CONFLICT` and the current authoritative record so two operators cannot silently overwrite each other.

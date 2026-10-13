# Inspection-to-Reconditioning Workflow

InspectIQ coordinates the work between vehicle intake, inspection, condition-report review, recon authorization, facility work, quality control, and sale release. It is designed for wholesale and offsite vehicle operations where the facility documents condition, but the consignor controls discretionary spending.

## Business Flow

```text
Vehicle check-in
-> inspection assignment
-> required evidence capture
-> human-reviewed condition report
-> recon recommendations and illustrative estimates
-> consignor authorization
-> authorized facility work orders
-> quality control
-> sale-readiness assessment
```

The stages are deliberately separate:

- A **condition finding** records an observed vehicle fact.
- A **recon recommendation** proposes work and an illustrative cost.
- A **recon authorization** records whether the consignor or its policy permits spending.
- A **work order** is executable facility work created only from authorized recommendations.
- A **quality-control result** verifies whether authorized work was completed acceptably.
- A **sale-readiness assessment** returns structured blockers rather than relying on a UI status alone.

## Roles

| Role | Responsibility |
| --- | --- |
| Inspector | Check in assigned vehicles, capture required evidence, resolve retakes, and submit analysis. |
| Reviewer | Confirm findings, approve or override the InspectIQ Reference Grade, and publish the condition report. |
| Recon Coordinator | Create recommendations, prepare estimates, submit authorization requests, and coordinate work and QC. |
| Consignor Approver | Approve, decline, or request revision for spending associated with represented consignor accounts. |
| Technician | Update assigned, authorized work orders. |
| Admin | Manage authorization policies and documented exceptional workflows. |

Permissions are enforced by the API. Consignor access is also restricted by account, not only by role.

## Condition Report

The primary report is a **visual condition report**. It organizes verified or observed data into sections including identity, odometer, exterior, interior, structural observations, tires, wheels, glass, keys, warning indicators, odor, emissions, air conditioning, SRS, flood indicators, reviewer notes, and disclosures.

The report does not claim that visual evidence is a mechanical certification or post-sale inspection. Unobserved items remain explicitly unobserved, and ADAS work is referred to a qualified third party. A versioned buyer-facing report is published only after Reviewer approval.

## Grade And Urgency

The **InspectIQ Reference Grade** is a reviewer-approved 0.0–5.0 description of vehicle condition. Confirmed condition findings can affect it. Mileage and age remain report facts, and missing evidence blocks readiness instead of artificially lowering the grade.

Operational **urgency** is a separate 1–5 score. It reflects time and workflow risk such as an approaching sale, retakes, pending authorization, overdue work, reauthorization, failed QC, or incorrect facility location. A high-urgency vehicle is not necessarily in poor condition.

## Authorization And Work

Each recommendation is evaluated independently against the consignor's snapshotted authorization policy. Eligible work can be authorized by policy; other work remains pending for a consignor decision. If only some items are authorized, InspectIQ creates work orders only for those items and reports the plan as partially authorized.

Work orders are grouped by vehicle, facility, and service department. Creation is idempotent. If a revised estimate exceeds the authorized amount plus policy tolerance, the work order is blocked and the decision returns to reauthorization.

## Sale Readiness

A vehicle is sale-ready only when:

- required evidence is complete;
- the condition report is published;
- required recon decisions are complete;
- authorized required work is complete;
- no estimate awaits reauthorization;
- quality control passed;
- required announcements and disclosures are complete; and
- no other blocking issue remains.

Declining optional recon does not automatically block sale release. The original finding and disclosure remain in the report.

## Audit And Events

Business mutations write operational state, audit history, and an outbox event together. The outbox publishes versioned, non-PII events to EventBridge after commit. Event consumers are idempotent, and failed delivery is visible through Platform Health and the DLQ replay controls.

SQS remains dedicated to durable image-analysis work because model calls need independent retry, backpressure, and dead-letter handling. EventBridge handles business-event fan-out because those events notify independent operational consumers rather than execute one long workflow.

## Honest Boundary

InspectIQ Reference Grade, Estimated Grade After Recon, repair estimates, durations, and authorization policies are reference calculations for this implementation. They are not Manheim AutoGrade, MMR, a complete repair-pricing database, or a substitute for qualified mechanical, structural, safety, or certification inspection.

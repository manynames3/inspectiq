# Five-Minute Inspection-to-Recon Walkthrough

Run the seeded application, then use the role selector in local mode. The public Evaluation Workspace is read-only, so mutation steps require local header auth or an authenticated Cognito session.

## 0:00–0:45 — Frame The Problem

Open **Auction Operations**.

Explain that InspectIQ coordinates evidence, a human-reviewed condition report, consignor spending decisions, authorized facility work, QC, and sale release. Point out that urgency is operational timing risk, while the 0.0–5.0 InspectIQ Reference Grade describes vehicle condition.

## 0:45–1:30 — Show Different Operational States

Use the summary metrics and filters to identify:

- a published CR waiting on recon authorization;
- policy-authorized work;
- a revised estimate waiting for reauthorization;
- a failed QC item; and
- a sale-ready vehicle.

Open a record and show its facility, zone, parking space, sale lane/run, deadline, urgency reasons, and structured blocker.

## 1:30–2:15 — Show The Defensible Condition Report

Open the inspection workbench as **Reviewer**.

Show required evidence, human-reviewed findings, the 0.0–5.0 grade, immutable report version, and expandable condition-report sections. Explain that missing evidence blocks publication instead of changing the grade, and that unobserved mechanical or safety facts are not presented as verified.

## 2:15–3:20 — Show Economic Control

Open **Recon Decisions** as **Recon Coordinator**.

Show:

- recommended cost;
- policy-authorized cost;
- manually authorized cost;
- declined and pending cost;
- remaining authorization;
- current and estimated post-recon grade; and
- authorization source on each item.

Switch to **Consignor Approver** for a pending item. Approve one item and decline another. Emphasize that the consignor cannot rewrite the estimate and that facility users cannot authorize spending on the consignor's behalf.

## 3:20–4:15 — Show Work, Overrun, And QC

Open **Shop Board**.

Show that only authorized recommendations created work orders. Open the tire order whose revised estimate exceeded its authorization, explain the blocked state, then record reauthorization. Start the order, send it to QC, and pass it.

Open the glass order with failed QC, return it through work, then pass QC. Point out the work-order version checks and audit entries.

## 4:15–5:00 — Prove Release And Operations

Recalculate sale readiness and show the blockers disappear only after required authorized work and QC complete. Optional declined recon remains disclosed but does not block release.

Finish in **Platform Health**:

- Postgres remains authoritative;
- image jobs use SQS and a DLQ;
- business events use the transactional outbox and EventBridge;
- the Python projector uses idempotent DynamoDB writes; and
- failed events can be inspected and replayed.

## Close

Use this one-sentence summary:

> InspectIQ turns vehicle evidence into a reviewer-approved condition report, keeps recon recommendations separate from consignor authorization, executes only approved work, and produces an auditable sale-readiness decision.

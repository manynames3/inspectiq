# Inspection And Recon API Examples

These examples use local header authentication. A deployed environment uses a Cognito bearer token with the same API-side role and object-authorization checks.

```bash
export API_BASE_URL=http://localhost:8080
export INSPECTION_ID=<inspection-uuid>
```

## Read The Operations Record

```bash
curl "$API_BASE_URL/api/operations/recon/$INSPECTION_ID" \
  -H "x-actor-id: recon-1" \
  -H "x-actor-name: Recon Coordinator" \
  -H "x-actor-role: recon_coordinator"
```

The response combines intake, sale assignment, location, inspection workflow, published report, recommendations, authorizations, work orders, QC, readiness, urgency, and calculated totals for one vehicle.

## Create A Recommendation

```bash
curl -X POST "$API_BASE_URL/api/inspections/$INSPECTION_ID/recon/recommendations" \
  -H "content-type: application/json" \
  -H "x-actor-id: recon-1" \
  -H "x-actor-name: Recon Coordinator" \
  -H "x-actor-role: recon_coordinator" \
  -d '{
    "serviceType": "DETAIL",
    "recommendedAction": "Perform standard interior and exterior detail",
    "estimatedCost": 175,
    "estimatedDurationHours": 2.5,
    "expectedGradeLift": 0.1,
    "supportingPhotoIds": [],
    "notes": "Illustrative estimate; verify scope before authorization."
  }'
```

The recommendation is not executable work. Submit one or more recommendation IDs for policy evaluation:

```bash
curl -X POST "$API_BASE_URL/api/inspections/$INSPECTION_ID/recon/submit" \
  -H "content-type: application/json" \
  -H "x-actor-id: recon-1" \
  -H "x-actor-name: Recon Coordinator" \
  -H "x-actor-role: recon_coordinator" \
  -d '{"recommendationIds":["<recommendation-uuid>"]}'
```

The response shows policy-authorized items separately from items awaiting a person.

## Record A Consignor Decision

```bash
curl -X POST "$API_BASE_URL/api/recon/authorizations/<authorization-uuid>/decision" \
  -H "content-type: application/json" \
  -H "x-actor-id: consignor-user-1" \
  -H "x-actor-name: Consignor Approver" \
  -H "x-actor-role: consignor_approver" \
  -d '{
    "decision": "APPROVE",
    "decisionReason": "Approved within the vehicle release plan.",
    "authorizedAmount": 425,
    "expectedVersion": 1
  }'
```

`DECLINE` preserves the recommendation and disclosure without creating work. `REQUEST_REVISION` sends the estimate back to the facility. A stale `expectedVersion` returns `409 VERSION_CONFLICT`.

## Update Authorized Work

```bash
curl -X PATCH "$API_BASE_URL/api/work-orders/<work-order-uuid>" \
  -H "content-type: application/json" \
  -H "x-actor-id: technician-1" \
  -H "x-actor-name: Assigned Technician" \
  -H "x-actor-role: technician" \
  -d '{
    "action": "START",
    "expectedVersion": 1
  }'
```

To record a revised estimate:

```json
{
  "action": "REVISE_ESTIMATE",
  "currentEstimatedCost": 475,
  "expectedVersion": 2
}
```

An amount beyond the authorized amount plus tolerance blocks the order and creates a reauthorization requirement.

## Record Quality Control

```bash
curl -X POST "$API_BASE_URL/api/work-orders/<work-order-uuid>/quality-control" \
  -H "content-type: application/json" \
  -H "x-actor-id: recon-1" \
  -H "x-actor-name: Recon Coordinator" \
  -H "x-actor-role: recon_coordinator" \
  -d '{
    "decision": "PASS",
    "notes": "Authorized scope completed and visually verified.",
    "expectedVersion": 4
  }'
```

A failed result returns the work order to `IN_PROGRESS` and blocks sale readiness.

## Recalculate Sale Readiness

```bash
curl -X POST "$API_BASE_URL/api/inspections/$INSPECTION_ID/sale-readiness" \
  -H "x-actor-id: recon-1" \
  -H "x-actor-name: Recon Coordinator" \
  -H "x-actor-role: recon_coordinator"
```

Blocked responses contain structured reasons:

```json
{
  "saleReady": false,
  "status": "BLOCKED",
  "blockers": [
    {
      "code": "REAUTHORIZATION_REQUIRED",
      "message": "A revised estimate is awaiting reauthorization"
    }
  ]
}
```

All successful mutations also write audit history and a versioned domain-event outbox record.

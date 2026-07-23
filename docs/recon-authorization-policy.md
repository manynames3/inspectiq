# Recon Authorization Policy

## Principle

A recommendation to repair, detail, or service a vehicle is not permission to spend a consignor's money. InspectIQ stores recommendations, authorization decisions, and executable work orders as separate records so the economic decision is explicit and auditable.

## Approval Modes

| Mode | Behavior |
| --- | --- |
| `MANUAL` | Every recommendation requires a consignor decision. |
| `AUTO_APPROVE_UNDER_LIMIT` | Eligible services may be authorized automatically within service and total-vehicle limits. |
| `MANAGED_PROGRAM` | Eligible work may be authorized by a documented managed-program policy. |
| `NO_RECON` | The policy does not authorize recon work. |

Each service rule contains an enabled flag and an automatic approval limit. The account policy also defines a total vehicle limit and a cost-overrun tolerance.

```json
{
  "approvalMode": "AUTO_APPROVE_UNDER_LIMIT",
  "totalVehicleLimit": 500,
  "serviceRules": {
    "DETAIL": { "enabled": true, "automaticApprovalLimit": 200 },
    "TIRE": { "enabled": true, "automaticApprovalLimit": 300 },
    "BODY": { "enabled": true, "automaticApprovalLimit": 0 },
    "MECHANICAL": { "enabled": true, "automaticApprovalLimit": 0 }
  },
  "costOverrunTolerance": 25
}
```

## Decision Order

For each recommendation, the policy evaluator:

1. Rejects automatic authorization when the policy is `NO_RECON`.
2. Requires manual review when the service is disabled or missing.
3. Requires manual review when the mode is `MANUAL`.
4. Requires manual review when the item exceeds its service limit.
5. Requires manual review when combined authorized items would exceed the total vehicle limit.
6. Otherwise authorizes the item using `CONSIGNOR_POLICY` or `MANAGED_PROGRAM_POLICY`.

The policy is snapshotted on the authorization record. A later policy edit does not rewrite the basis of an earlier decision.

## Authorization Sources

| Source | Meaning |
| --- | --- |
| `CONSIGNOR_USER` | A person representing the consignor approved the item. |
| `CONSIGNOR_POLICY` | The item met the account's automatic authorization policy. |
| `MANAGED_PROGRAM_POLICY` | The item met a managed-program policy. |
| `ADMINISTRATIVE_OVERRIDE` | An Admin used an exceptional path with a required reason and prominent audit record. |

The UI must not describe a policy authorization as a personal approval.

## Partial Authorization

When a plan contains approved, declined, and pending recommendations:

- approved items can generate work orders;
- declined items remain in the condition report and disclosures;
- pending items remain non-executable;
- projected grade lift includes only authorized items; and
- the recon plan is `PARTIALLY_AUTHORIZED`.

Work-order generation is idempotent, so replaying an authorization event cannot create another order for the same recommendation group.

## Estimate Changes

The current estimate may not exceed:

```text
authorized amount + cost-overrun tolerance
```

When it does:

- the affected work order becomes `BLOCKED`;
- its recommendation becomes `REAUTHORIZATION_REQUIRED`;
- an audit record and domain event are created; and
- work cannot be treated as approved until a new decision is recorded.

The consignor can approve, decline, or request revision. The consignor does not directly rewrite the facility estimate.

## Security

- Recon Coordinators prepare estimates but cannot authorize consignor spending.
- Consignor Approvers can access only represented consignor accounts.
- Technicians can update authorized work but cannot change authorization policy.
- Administrative overrides require an explicit reason.
- Optimistic versions reject stale decisions instead of silently overwriting them.

## Calculation Boundary

Limits, costs, durations, and expected grade lift in seeded examples are illustrative. A commercial deployment would integrate customer-specific rate cards, labor rules, tax handling, vendor agreements, and approval terms.

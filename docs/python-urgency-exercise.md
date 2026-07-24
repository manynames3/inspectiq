# Python Urgency Exercise

## Prompt

Given inspections with an urgency score from 1 through 5:

1. classify scores 4 and 5 as high urgency;
2. count high-urgency inspections with a loop;
3. sort vehicles by urgency, then by sale deadline.

Do not sort the list just to count high-urgency records.

## Sample Input

```python
inspections = [
    {"vin": "1A", "urgencyScore": 5, "saleDateTime": "2026-07-24T09:00:00Z"},
    {"vin": "2B", "urgencyScore": 2, "saleDateTime": "2026-07-24T08:00:00Z"},
    {"vin": "3C", "urgencyScore": 4, "saleDateTime": "2026-07-24T07:00:00Z"},
]
```

## Simple Solution

```python
def classify_urgency(score):
    if score >= 4:
        return "HIGH"
    if score >= 2:
        return "MEDIUM"
    return "LOW"


high_urgency_count = 0
for inspection in inspections:
    if inspection["urgencyScore"] >= 4:
        high_urgency_count += 1


ordered = sorted(
    inspections,
    key=lambda inspection: (
        -inspection["urgencyScore"],
        inspection["saleDateTime"],
    ),
)
```

Expected high-urgency count: `2`.

Expected VIN order: `1A`, `3C`, `2B`.

## Practice Variations

- Reject scores below 1 or above 5.
- Add an urgency reason such as “QC failed.”
- Break equal urgency and deadline values by VIN.
- Return the count, ordered list, and classification totals together.

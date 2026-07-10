# InspectIQ Operations Projector

Python 3.12 Lambda consuming versioned InspectIQ domain events from EventBridge. It writes an idempotent, expiring operational projection to DynamoDB; Neon remains the transactional source of truth.

```bash
python3 -m pytest services/operations-projector
```

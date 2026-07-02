# ADR 0002: Async AI Report Generation

Decision: Model report generation as a job even when the local mock completes immediately.

Reason: Real model calls are slow, retryable, and failure-prone. The state machine and data model should reflect that from the start.


# Tradeoffs

- The MVP prioritizes the complete inspection workflow over production persistence plumbing.
- The API includes Postgres schema and Drizzle table definitions, while tests use an in-memory store for speed and no Docker dependency.
- The Java grading service is intentionally small. It is useful for demonstrating a deterministic service boundary, but a small team might collapse it into the Node API until rules become independently owned.
- Mock AI providers are not pretending to be real model quality. They provide repeatable local behavior, schema validation, and failure-mode coverage.
- Terraform is a realistic skeleton rather than a deploy-ready module set, because account networking and packaging choices vary.


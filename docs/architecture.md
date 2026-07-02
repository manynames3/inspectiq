# Architecture

InspectIQ is a monorepo with a React/Vite frontend, TypeScript Express API, shared Zod schemas, and a Java grading service.

```mermaid
flowchart LR
  UI[React inspection workbench] --> API[Node Express API]
  API --> Store[Demo store and Postgres schema]
  API --> Vision[Vision provider interface]
  Vision --> MockVision[Mock deterministic provider]
  Vision --> BedrockVision[Production Bedrock adapter seam]
  API --> Java[Java grading service]
  API --> Report[Report provider interface]
  Report --> MockReport[Mock deterministic provider]
  Report --> BedrockReport[Production Claude adapter seam]
  API --> Audit[Audit trail]
```

The local demo uses deterministic mock providers so it works without paid credentials. The data model, endpoints, and Terraform skeleton map to Postgres, S3, SQS/EventBridge, Step Functions, workers, and Bedrock in AWS, but the production Bedrock adapters and durable repository are intentionally not implemented in the demo.

# Architecture

InspectIQ is a monorepo with a React/Vite frontend, TypeScript Express API, shared Zod schemas, and a Java grading service.

```mermaid
flowchart LR
  UI[React inspection workbench] --> API[Node Express API]
  API --> Store[Demo store and Postgres schema]
  API --> Vision[Vision provider interface]
  Vision --> MockVision[Mock deterministic provider]
  Vision --> BedrockVision[Bedrock-ready provider stub]
  API --> Java[Java grading service]
  API --> Report[Report provider interface]
  Report --> MockReport[Mock deterministic provider]
  Report --> BedrockReport[Bedrock Claude-ready stub]
  API --> Audit[Audit trail]
```

The local demo uses deterministic mock providers so it works without paid credentials. The data model, endpoints, and Terraform skeleton map to Postgres, S3, SQS/EventBridge, Step Functions, workers, and Bedrock in AWS.


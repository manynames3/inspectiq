# ADR 0007: Serverless vs Containers

Decision: Keep both Lambda and ECS/Fargate viable in the Terraform plan.

Reason: Lambda is attractive for bursty workers, while containers simplify long-lived APIs, Java services, and dependency-heavy image pipelines.


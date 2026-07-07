# ADR 0007: Serverless vs Containers

Decision: Use Lambda for the current AWS deployment.

Reason: The inspection API and image-analysis worker are bursty, easy to package as Node.js functions, and benefit from low idle cost. Containers remain a later option only if native image tooling, long-running processing, or independent Python grading deployment outgrows Lambda constraints.

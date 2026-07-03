# ADR 0005: Java Grading Service Boundary

Decision: Keep grading rules in a lightweight Java service.

Reason: It shows a realistic microservice boundary and supports independent rule ownership. If the product were smaller, this service could be folded into the Node API.

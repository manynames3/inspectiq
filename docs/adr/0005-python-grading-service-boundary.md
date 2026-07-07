# ADR 0005: Python Grading Service Boundary

Decision: Keep repeatable condition grading rules in a lightweight Python service.

Reason: Condition grades are deterministic business rules, not generative AI output. A separate Python service is defensible when grading rules are independently owned, versioned, tested, reused by other systems, or released on a different cadence than the inspection API.

Tradeoff: The current service is intentionally small. In an early product team, a separate service can add deployment, observability, and incident-response cost before the ownership boundary is valuable. InspectIQ therefore keeps an equivalent Node fallback so the workflow remains reliable when the Python service is not running.

Production rule: keep the Python boundary only if there is a real ownership or reuse reason; otherwise collapse the rule engine into the API until the boundary earns its operational cost.

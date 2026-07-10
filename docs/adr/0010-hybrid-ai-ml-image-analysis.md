# ADR 0010: Hybrid AI/ML Image Analysis

Decision: Use Bedrock multimodal analysis as the advisory reasoning layer, not as the only production damage detector.

Reason: A general multimodal model can inspect whole-vehicle photos, classify likely angle, extract readable VIN/odometer text, describe visible damage, and return schema-validated reviewer suggestions. That accelerates workflow. It is not buyer-dispute-grade evidence unless performance is proven on an independently labeled automotive corpus.

Production shape:

- Image-quality rules/model for blur, glare, low light, framing, occlusion, and retake policy.
- Angle classifier for the required-photo checklist.
- OCR tuned for VIN and odometer capture.
- Dedicated, calibrated damage detection for dents, scratches, paint, wheels, glass, and interior wear when precision/recall requirements justify it.
- Bedrock reasoning for evidence summarization, exception handling, schema output, and report language.
- Human approval before AI affects CR readiness, VDP visibility, recon estimates, arbitration risk, or buyer reports.

Tradeoff: The current implementation uses Bedrock and deterministic local providers behind one schema. The 108-image challenge set proves the evaluation mechanism but has only 12 independent sources. Production promotion requires a larger adjudicated field corpus, calibrated thresholds, reviewer-override monitoring, cost/latency evidence, and rollback criteria.

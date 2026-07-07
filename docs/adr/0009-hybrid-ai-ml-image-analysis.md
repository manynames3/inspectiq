# ADR 0009: Hybrid AI/ML Image Analysis

Decision: Use Bedrock multimodal analysis as the advisory reasoning layer, not as the only production damage detector.

Reason: A general multimodal model can inspect whole-vehicle photos, classify likely angle, extract readable VIN/odometer text, describe visible damage, and return schema-validated reviewer suggestions. That is valuable for workflow acceleration. It is not enough by itself for buyer-dispute-grade damage decisions unless its performance is proven on a labeled automotive inspection corpus.

Production shape:

- Image-quality model or rules for blur, glare, low light, framing, occlusion, and retake policy.
- Angle classifier for the required photo checklist.
- OCR path tuned for VIN and odometer capture.
- Dedicated damage-detection model for dents, scratches, paint damage, wheels, glass, and interior wear when calibrated precision/recall is required.
- Bedrock multimodal reasoning for evidence summarization, exception handling, schema output, and report language.
- Human reviewer approval before AI output affects CR readiness, VDP visibility, reconditioning estimates, arbitration risk, or buyer-ready reports.

Tradeoff: The current implementation uses Bedrock and deterministic local providers behind the same schema because that proves the event-driven architecture and human-in-the-loop workflow. The production gate is not a different API shape; it is a larger labeled dataset, measured model quality, calibrated thresholds, and operational recovery around the same contract.


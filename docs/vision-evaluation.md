# Vision Evaluation

`apps/api/scripts/vision-eval.ts` expands the rights-cleared sources in `evals/vision-eval-set.json`, sends each pixel-distinct image through the selected provider, validates `VisionOutputSchema`, scores outcomes, and fails when a promotion gate is missed.

## Commands

Deterministic contract gate used by ordinary CI:

```bash
npm run eval:vision
```

Real Bedrock promotion gate, run manually to control spend:

```bash
AWS_REGION=us-east-1 \
VISION_PROVIDER=bedrock \
BEDROCK_VISION_FALLBACK=fail \
VISION_EVAL_OUTPUT=output/model-evaluation/bedrock-report.json \
npm run eval:vision
```

Set `VISION_EVAL_CORPUS_DIR` to retain the rendered JPEG corpus. Set `VISION_EVAL_ALLOW_FAIL=true` only for diagnosis; promotion workflows must fail closed.

## Corpus Design

The suite has 12 independent source images and nine transforms per source: baseline, JPEG compression, resize, mild darkness, mild brightness, small rotation, heavy blur, low light, and center occlusion. It therefore executes 108 image inputs while reporting both counts so transformations are not misrepresented as independent field data.

Coverage includes all required checklist angles, clean false-positive controls, visible dents/scratches, readable VIN/odometer evidence, partial VIN, dirty odometer, dark interior, blur, framing/occlusion, and auction-lane clutter.

## Promotion Gates

- 100% schema validity.
- At least 90% macro angle accuracy and 85% for every angle.
- At least 95% normalized VIN/odometer accuracy on readable evidence.
- At least 90% damage precision, 80% damage recall, and 85% type/severity accuracy.
- At least 90% retake precision and recall.
- Zero hidden fallback calls in the Bedrock promotion run.

The report also records p95 latency, token counts, estimated cost, provider/model/prompt version, failure category, and every case result. Model output remains advisory even after promotion; reviewer acceptance is the boundary where a suggestion can become an operational fact.

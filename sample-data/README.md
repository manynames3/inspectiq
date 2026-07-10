# Sample Data

Reference inspection vehicles use source-documented external listing photos for required exterior, interior, and most engine-bay angles. Local development can expose a VIN-matched reference set for the selected inspection so a Toyota, Honda, Ford, Nissan, Subaru, or Hyundai record cannot accidentally receive unrelated reference evidence. Deployed production disables reference loading and expects captured uploads.

The polished Hyundai, Toyota, Honda, Ford, Nissan, and Subaru reference records now use VIN-specific listing photos for the required evidence cards wherever public listings expose them, including odometer and VIN-label-area evidence. Local generated identity fixtures remain only for automated tests, retake-policy evaluation, and edge-case workflows; they are not production capture evidence.

Reference manifests establish source and intended checklist slot only. They are not model analysis: the application hides AI confidence for manifest mappings, does not treat vehicle metadata as image OCR, and does not pre-confirm damage unless the linked evidence visibly supports it. Dedicated challenge fixtures remain isolated in the evaluator corpus and never materialize as condition facts for these VIN-specific records.

The local provider classifies sample evidence by filename and declared angle so the full image-analysis workflow can run without paid model credentials. The evaluation set also covers glare, blur, dark interiors, bad side angles, dirty odometer, partial VIN, and auction-lane exterior cases. The Bedrock provider can read local, inline, S3, or external sample image bytes.

Use `npm run test:live` with `LIVE_PHOTO_DIR` to prove the deployed path with real uploaded photos, Cognito auth, S3 object storage, SQS, Bedrock analysis, reviewer approval, and audit events.

See `IMAGE_CREDITS.md` for source and license notes.

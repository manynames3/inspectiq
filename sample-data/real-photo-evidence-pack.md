# Real-Photo Evidence Pack

InspectIQ keeps third-party vehicle photos source-documented instead of committing copied listing images into the repository. The app references public listing/gallery URLs for local walkthrough realism, while the live proof path expects uploaded inspection photos through presigned storage.

## Source-Documented Vehicle Sets

| Vehicle | Source | VIN-specific | Covered angles |
| --- | --- | --- | --- |
| 2024 Hyundai Tucson SEL | CARFAX listing photo set | Yes | front, rear, driver side, passenger side, interior, engine bay reference, odometer, VIN label |
| 2021 Toyota Camry SE | AutoNation dealer listing photo set | Yes | front, rear, driver side, passenger side, interior, odometer, VIN-label area, engine bay reference |
| 2020 Honda Accord EX | CARFAX listing photo set | Yes | front, rear, driver side, passenger side, interior, engine bay, odometer, VIN label |
| 2022 Ford Escape SEL | DCH Kay Honda dealer listing | Yes | front, rear, driver side, passenger side, interior, engine bay reference, odometer, VIN plate |
| 2019 Nissan Rogue SV | West Herr dealer listing | Yes | front, rear, driver side, passenger side, interior, engine bay reference, odometer, VIN-label area |
| 2023 Subaru Outback Premium | A-Kar Auto Sales dealer listing | Yes | front, rear, driver side, passenger side, interior, engine bay, odometer, VIN-label area |

Detailed URLs and license notes are maintained in `sample-data/IMAGE_CREDITS.md`.

## Edge-Case Evidence

The local/evaluation evidence pack includes cases that matter in mobile, offsite, and auction-lane capture:

| Case | Purpose |
| --- | --- |
| Blurry front | Retake guidance for motion blur. |
| Glare front | Retake/review guidance for harsh reflections. |
| Bad side angle | Angle-quality guidance for incomplete side coverage. |
| Dark interior | Interior exposure guidance. |
| Partial VIN plate | VIN/OCR retake guidance. |
| Dirty odometer | Odometer/OCR retake guidance. |
| Auction-lane front | Negative control for background clutter and adjacent vehicles. |

## Production Boundary

Local reference evidence exists for repeatable review and screenshots. Deployed production disables reference evidence and expects photos uploaded by an authenticated inspector. The stronger proof path is:

```bash
npm run prepare:live-photos -- --out /tmp/inspectiq-live-photos-ford
LIVE_API_BASE_URL=https://imml0cczh7.execute-api.us-east-1.amazonaws.com \
LIVE_ID_TOKEN="$(cat /tmp/inspectiq-live-auth/inspector.idtoken)" \
LIVE_REVIEWER_TOKEN="$(cat /tmp/inspectiq-live-auth/reviewer.idtoken)" \
LIVE_REQUIRE_SEPARATE_ROLES=true \
LIVE_PHOTO_DIR=/tmp/inspectiq-live-photos-ford \
npm run test:live
```

That path proves uploaded photos, object storage metadata, image analysis, reviewer approval, final report, and audit events against the deployed API.

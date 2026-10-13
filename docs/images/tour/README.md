# Product Tour: Capture Provenance

These are actual rendered InspectIQ screens, not design mockups or AI-generated UI. They document the unmerged `agent/inspection-recon-operations` branch. Demo vehicle metadata, scores, and workflow outcomes are illustrative, not customer inspections or measured damage-detection accuracy.

## Web Screens

Captured on 2026-10-13 UTC from the local app with deterministic providers, memory persistence, and development-role sessions. The web implementation is `2b49dee`; the additional release changes at capture time were documentation and API/domain tests, not UI code.

| Image | Actual view | Capture method |
| --- | --- | --- |
| [work-queue.png](work-queue.png) | Inspector work queue with explicit next steps and buyer-visible status. | Repository `make screenshots-local`, `dashboard.png`, desktop width 1440. |
| [evidence-workbench.png](evidence-workbench.png) | Reviewer workbench, filmstrip, evidence decisions, full report paper, approval/version history, and audit. | Same regression run, `inspection-workbench.png`, full page at desktop width 1440. |
| [reports.png](reports.png) | Report queue distinguishing draft, finalized, approval, version, and buyer visibility. | Same regression run, `reports-page.png`, desktop width 1440. |

The regression clock is deliberately fixed to `2026-07-10T16:25:18.000Z` for repeatable SLA/date rendering. Dates visible in those images are fixture dates, not capture or release dates. The run passed all 13 visual comparisons and its serious/critical accessibility and horizontal-overflow checks; that does not certify complete accessibility or field usability.

The reference Ford evidence is attributed in the UI to **DCH Kay Honda dealer listing**. Source metadata lives in the [sample-image catalog](../../../apps/api/src/sampleImages.ts); [seed data](../../../apps/api/src/seedData.ts) records the demonstration identity limitations. It includes a synthetic VIN identity card used for workflow demonstration; the UI/report does not present it as independently verified identity. Marketplace/reference images remain subject to their source terms. These contextual screenshots are not a commercial image license, an owned training dataset, or proof that all views are independently verified.

## Native Android Screen

[android-workspace.png](android-workspace.png) is a genuine, unedited Android screenshot at 1080×2400, captured on 2026-10-13 UTC using platform `screencap` from a task-isolated Pixel 6 emulator (Android 17/API 37).

- Package: `com.aidenrhaa.inspectiq`, version `1.0.0`, version code `1`, target SDK `36`.
- APK: internal arm64 release artifact from [successful Android CI at `2b49dee`](https://github.com/manynames3/inspectiq/actions/runs/38339742078), artifact `inspectiq-android-arm64`.
- APK SHA-256: `76ec44d850338bc2a4aae0d5ab0210f26fb3723dd598feebcd9ad65c02fb4fc8`.
- Screen: online, read-only **Evaluation Reviewer** workspace against the existing AWS API. Counts and demo records reflect that API, not local web fixture data or a newer backend rollout.
- No sign-in tokens, camera capture, authenticated mutations, or paid Bedrock calls were needed for this screenshot.

The native screen proves the APK renders its branded evaluation workspace. It does not prove physical-device camera behavior, background/offline recovery, an app-store release, or damage-detection performance. The separate emulator was shut down and its temporary AVD removed; another task's emulator was left untouched.

## Reproduce the Web Tour

From the repository root with dependencies installed:

```bash
make screenshots-local
```

The generated captures and comparison results are under `output/screenshots/`; reviewed captures were copied into this directory without altering their pixels. No baseline was updated to make the release checks pass.

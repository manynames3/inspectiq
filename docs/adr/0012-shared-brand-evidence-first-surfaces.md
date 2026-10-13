# ADR 0012: Shared Brand Tokens, Evidence-First Review Surfaces

Date: 2026-10-13

Status: Accepted — records the implemented Supreme AI Ventures redesign on the unmerged inspection/recon branch.

## Context

A dense reviewer workbench and a field camera interface serve different tasks. Both should belong to InspectIQ, but brand consistency must not hide photo detail, reduce outdoor readability, or imply that advisory AI output is an approved vehicle fact.

## Decision

Share brand/field color tokens through `@inspectiq/shared`; keep client-specific components and navigation. Use ink-and-mint desktop surfaces with self-hosted Instrument Sans and a neutral photo stage. Use light native field surfaces, system typography, and large capture targets. Do not add a new framework or production dependency for branding.

Make the selected evidence photo the center of review, with adjacent photo-linked decisions, a filmstrip, enlargement, previous/next controls, bounded zoom, and pan. Surface missing or unavailable evidence and qualitative uncertainty. Keep draft, unsaved, approved-awaiting-release, and finalized report states distinct; changed language loses the visible approval/release claim and must be saved and reviewed before finalization.

## Alternatives Considered

- **One shared web/native UI renderer:** would couple desktop information density to field navigation and camera ergonomics.
- **Dark styling everywhere:** visually consistent, but not the best field-reading default.
- **Confidence-led dashboards:** look authoritative without calibration and make evidence defects less visible.

## Consequences

Brand tokens stay consistent while web and native layouts can evolve independently. Accessibility, focus restoration, responsive overflow checks, and image-failure states are part of correctness. The paper report preview improves review; it does not add PDF export, establish model accuracy, or bypass existing API permissions and release guards.

## Implementation and Evidence

- [Shared brand tokens](../../packages/shared/src/brand.ts), [web styles](../../apps/web/src/brand.css), and [native theme](../../apps/mobile/src/theme.ts)
- [Web evidence stage](../../apps/web/src/pages/InspectionDetailPage.tsx), [zoom/pan](../../apps/web/src/components/ZoomableEvidence.tsx), and [native viewer](../../apps/mobile/src/components/EvidencePhotoViewer.tsx)
- [Report document](../../apps/web/src/components/ConditionReportDocument.tsx) and [unsaved-state tests](../../apps/web/src/components/ConditionReportDocument.test.tsx)
- [Visual/accessibility CI at `2b49dee`](https://github.com/manynames3/inspectiq/actions/runs/38339742074), [tour screenshots](../images/tour/README.md), and [AI human-review decision](0003-ai-human-review.md)

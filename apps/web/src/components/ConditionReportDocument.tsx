import type { InspectionBundle } from "../types.js";
import { Brand } from "./Brand.js";

export function ConditionReportDocument({ bundle, body }: { bundle: InspectionBundle; body?: string }) {
  const report = bundle.finalReport;
  const vehicle = bundle.inspection;
  const unsaved = Boolean(report && body !== undefined && body !== report.reportBody);
  const state = unsaved ? "Unsaved draft · not reviewed" : report?.finalizedAt ? "Finalized" : report?.approvalStatus === "approved" ? "Approved · awaiting release" : "Draft · not approved for buyer release";
  return <article className="report-paper" role="region" aria-label="Condition report document">
    <header><Brand compact /><span>Condition report / {report ? `v${report.version}` : "preliminary"}</span></header>
    <div className={`document-state ${report?.finalizedAt && !unsaved ? "released" : "draft"}`}>{state}</div>
    <h2>{vehicle.year} {vehicle.make} {vehicle.model}</h2>
    <p className="document-vehicle-meta">{vehicle.trim} · {vehicle.exteriorColor} · {vehicle.mileage.toLocaleString()} miles</p>
    <dl className="document-identity"><div><dt>Vehicle identification</dt><dd>{vehicle.vin}<small>{bundle.conditionQc?.identity.vin.status.replaceAll("_", " ") ?? "Not verified"}</small></dd></div><div><dt>Odometer evidence</dt><dd>{vehicle.mileage.toLocaleString()} miles<small>{bundle.conditionQc?.identity.odometer.status.replaceAll("_", " ") ?? "Not verified"}</small></dd></div></dl>
    <div className="document-body">{(body ?? report?.reportBody)?.trim() || "No report language prepared. Complete the evidence review and approve the condition grade before preparing this document."}</div>
    {bundle.conditionQc?.issues.length ? <section className="document-limitations"><h3>Evidence limitations &amp; review record</h3>{bundle.conditionQc.issues.map((issue) => <p key={issue.id}><strong>{issue.title}.</strong> {issue.detail}{issue.decision ? ` Reviewed by ${issue.decision.actor}: ${issue.decision.reason}` : " Review unresolved."}</p>)}</section> : null}
    <footer><div><span>Reviewer approval</span><strong>{unsaved ? "Not reviewed" : report?.approvedBy ?? "Not approved"}</strong><small>{!unsaved && report?.approvedAt ? new Date(report.approvedAt).toLocaleString() : "Human approval required"}</small></div><div><span>Release record</span><strong>{!unsaved && report?.finalizedAt ? `v${report.version} · finalized` : "Not released"}</strong><small>{!unsaved && report?.finalizedAt ? new Date(report.finalizedAt).toLocaleString() : "Drafts are not buyer-ready reports"}</small></div></footer>
  </article>;
}

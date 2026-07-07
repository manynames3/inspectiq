import { AlertTriangle, Camera, CheckCircle2, Database, Gauge, PlayCircle, RefreshCw, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api.js";
import { useActor } from "../App.js";

type Health = {
  runtimeProof: {
    environment: string;
    apiBaseUrl: string;
    authenticatedRole: string;
    actorName: string;
    authMode: string;
    roleSource: string;
    persistenceMode: string;
    postgres: string;
    imageStorage: string;
    imageBucket: string;
    imageAnalysisMode: string;
    visionProvider: string;
    promptVersion: string;
    queueHealth: {
      failedImageJobs: number;
      deadLetterImageJobs: number;
      activeImageJobs: number;
    };
    latestSuccessfulImageAnalysis: {
      inspection: string;
      provider: string;
      promptVersion: string;
      confidence: string;
      completedAt: string;
    } | null;
    latestFailedOrRecoveredJob: {
      type: string;
      inspection?: string;
      status?: string;
      attempts?: number;
      message?: string;
      actor?: string;
      updatedAt?: string;
      recoveredAt?: string;
    } | null;
    opsSimulation: {
      enabled: boolean;
      endpoint: string;
      localOnly: string;
    };
  };
  roleProof: Array<{
    role: "inspector" | "reviewer" | "admin";
    title: string;
    proof: string;
    permissions: string[];
    latestEvent: {
      eventType: string;
      actor: string;
      inspectionId: string;
      occurredAt: string;
    } | null;
  }>;
  evidencePack: {
    requiredAngles: string[];
    vehicleSets: Array<{
      key: string;
      label: string;
      vehicle: string;
      documentedPhotoCount: number;
      requiredAngleCoverage: string;
      sources: string[];
    }>;
    sourceDocumentedImages: number;
    edgeCases: Array<{ key: string; label: string; angle: string; sourceName: string }>;
  };
  scorecard: Array<{ pillar: string; status: string; evidence: string }>;
  metricsTracked: string[];
  operationalMetrics: Array<{ metric: string; label: string; value: string; status: string; evidence: string }>;
  serviceLevelObjectives: Array<{ name: string; target: string; current: string; risk: string; evidence: string }>;
  alerts: Array<{ name: string; signal: string; response: string }>;
  failedJobRecovery: {
    detection: string;
    liveStatus: {
      failedImageJobs: number;
      deadLetterImageJobs: number;
      activeImageJobs: number;
      recoveryEndpoint: string;
    };
    operatorWorkflow: string[];
    safeguards: string[];
  };
  operationsDashboard: {
    name: string;
    region: string;
    widgets: string[];
  };
  aiContract: {
    provider: string;
    promptVersion: string;
    schema: string;
    validatedFields: string[];
    confidencePolicy: string;
    productionTarget: string;
    imageQualityPolicy: string;
  };
  productionReadinessProof: Array<{
    area: string;
    status: string;
    current: string;
    productionGate: string;
  }>;
  persistence: {
    activeMode: string;
    postgresReady: boolean;
    localMode: string;
    productionMode: string;
    hotPathRepositories: Array<{ domain: string; table: string; operation: string }>;
  };
  storageContract: {
    uploadIntentEndpoint: string;
    localBehavior: string;
    productionBehavior: string;
  };
  asyncWorkerContract: {
    queueEvent: string;
    statusValues: string[];
    idempotency: string;
    deadLetterPolicy: string;
  };
  implementationBoundary: {
    local: string[];
    production: string[];
    gradingBoundary: string;
  };
};

function proofStatusClass(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized.includes("implemented") || normalized.includes("ready")) return "proof-status-ready";
  if (normalized.includes("partial") || normalized.includes("watch")) return "proof-status-watch";
  return "proof-status-blocked";
}

export function PlatformHealthPage() {
  const { actor, can } = useActor();
  const [health, setHealth] = useState<Health | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setHealth(await api<Health>("/api/platform-health", {}, actor));
  }

  async function recoverFailedJobs() {
    setBusy(true);
    setRecoveryMessage(null);
    try {
      const result = await api<{ requeued: number }>(
        "/api/platform-health/recover-failed-jobs",
        { method: "POST", body: JSON.stringify({ reason: "Operator recovery from Platform Health" }) },
        actor
      );
      setRecoveryMessage(`${result.requeued} image job${result.requeued === 1 ? "" : "s"} requeued.`);
      await load();
    } catch (error) {
      setRecoveryMessage(error instanceof Error ? error.message : "Recovery action failed.");
    } finally {
      setBusy(false);
    }
  }

  async function simulateFailedJob() {
    setBusy(true);
    setRecoveryMessage(null);
    try {
      const result = await api<{ job: { id: string; status: string } }>(
        "/api/platform-health/simulate-failed-image-job",
        { method: "POST", body: JSON.stringify({ reason: "Operator failure drill from Platform Health" }) },
        actor
      );
      setRecoveryMessage(`Created failed image job ${result.job.id.slice(0, 8)} for recovery drill.`);
      await load();
    } catch (error) {
      setRecoveryMessage(error instanceof Error ? error.message : "Failure drill could not be created.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, [actor.id, actor.name, actor.role]);

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Platform Health</h1>
          <p>Live stack proof, role separation, image-analysis health, and recovery operations.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {health ? (
        <section className="production-proof-panel">
          <div className="proof-header">
            <div>
              <span>Production proof</span>
              <h2>Current runtime path</h2>
            </div>
            <strong>{health.runtimeProof.environment}</strong>
          </div>
          <div className="proof-grid">
            <article>
              <ShieldCheck size={18} />
              <span>Auth</span>
              <strong>{health.runtimeProof.authMode}</strong>
              <small>{health.runtimeProof.actorName} · {health.runtimeProof.authenticatedRole}</small>
              <small>{health.runtimeProof.roleSource}</small>
            </article>
            <article>
              <Database size={18} />
              <span>Persistence</span>
              <strong>{health.runtimeProof.persistenceMode}</strong>
              <small>Postgres {health.runtimeProof.postgres}</small>
              <small>{health.runtimeProof.apiBaseUrl}</small>
            </article>
            <article>
              <Camera size={18} />
              <span>Images and AI</span>
              <strong>{health.runtimeProof.visionProvider}</strong>
              <small>{health.runtimeProof.imageStorage}</small>
              <small>{health.runtimeProof.imageAnalysisMode}</small>
            </article>
            <article>
              <Gauge size={18} />
              <span>Queue health</span>
              <strong>{health.runtimeProof.queueHealth.failedImageJobs} failed · {health.runtimeProof.queueHealth.activeImageJobs} active</strong>
              <small>{health.runtimeProof.queueHealth.deadLetterImageJobs} DLQ candidates</small>
              <small>Prompt {health.runtimeProof.promptVersion}</small>
            </article>
          </div>
          <div className="proof-status-grid">
            <article>
              <h3>Latest successful analysis</h3>
              {health.runtimeProof.latestSuccessfulImageAnalysis ? (
                <p>
                  {health.runtimeProof.latestSuccessfulImageAnalysis.inspection} · {health.runtimeProof.latestSuccessfulImageAnalysis.provider}
                  {" "}· {health.runtimeProof.latestSuccessfulImageAnalysis.confidence}
                </p>
              ) : (
                <p>No completed image analysis has been recorded yet.</p>
              )}
            </article>
            <article>
              <h3>Latest failed/recovered job</h3>
              {health.runtimeProof.latestFailedOrRecoveredJob ? (
                <p>
                  {health.runtimeProof.latestFailedOrRecoveredJob.type === "failed_job" ? "Failed" : "Recovered"}
                  {" "}· {health.runtimeProof.latestFailedOrRecoveredJob.inspection ?? "Unknown inspection"}
                  {health.runtimeProof.latestFailedOrRecoveredJob.message ? ` · ${health.runtimeProof.latestFailedOrRecoveredJob.message}` : ""}
                </p>
              ) : (
                <p>No failed or recovered image job has been recorded yet.</p>
              )}
            </article>
          </div>
        </section>
      ) : null}
      {health ? (
        <section className="role-proof-panel">
          <div className="proof-header">
            <div>
              <span>Role-separated workflow</span>
              <h2>Inspector, reviewer, and admin evidence</h2>
            </div>
            <Users size={19} />
          </div>
          <div className="role-proof-grid">
            {health.roleProof.map((role) => (
              <article key={role.role}>
                <strong>{role.title}</strong>
                <p>{role.proof}</p>
                <small>{role.permissions.slice(0, 4).join(" · ")}</small>
                <div>
                  {role.latestEvent ? `${role.latestEvent.eventType} · ${role.latestEvent.actor}` : "No role-specific audit event yet"}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {health ? (
        <section className="evidence-pack-panel">
          <div className="proof-header">
            <div>
              <span>Real-photo evidence pack</span>
              <h2>Source-documented vehicle sets and edge cases</h2>
            </div>
            <strong>{health.evidencePack.sourceDocumentedImages} sourced images</strong>
          </div>
          <div className="evidence-pack-grid">
            {health.evidencePack.vehicleSets.map((set) => (
              <article key={set.key}>
                <strong>{set.vehicle}</strong>
                <span>{set.requiredAngleCoverage} required angles</span>
                <small>{set.documentedPhotoCount} source-documented photos</small>
                <p>{set.sources.join(" · ")}</p>
              </article>
            ))}
          </div>
          <div className="edge-case-row">
            {health.evidencePack.edgeCases.map((item) => (
              <span key={item.key}>{item.label}</span>
            ))}
          </div>
        </section>
      ) : null}
      <div className="scorecard-grid">
        {health?.scorecard.map((item) => (
          <article className="scorecard" key={item.pillar}>
            <h2><CheckCircle2 size={18} /> {item.pillar}</h2>
            <strong>{item.status}</strong>
            <p>{item.evidence}</p>
          </article>
        ))}
      </div>
      <div className="metrics-band operational-metrics">
        <h2>Operational metrics</h2>
        <div className="metric-card-grid">
          {health?.operationalMetrics.map((metric) => (
            <article className={`metric-card metric-${metric.status}`} key={metric.metric}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.evidence}</small>
            </article>
          ))}
        </div>
      </div>
      {health ? (
        <div className="ops-readiness-grid">
          <section className="ops-panel">
            <h2><Gauge size={18} /> Service levels</h2>
            <div className="ops-list">
              {health.serviceLevelObjectives.map((slo) => (
                <article key={slo.name}>
                  <div>
                    <strong>{slo.name}</strong>
                    <span>{slo.current}</span>
                  </div>
                  <p>{slo.target}</p>
                  <small>{slo.evidence}</small>
                </article>
              ))}
            </div>
          </section>
          <section className="ops-panel">
            <h2><AlertTriangle size={18} /> Alerts</h2>
            <div className="ops-list compact">
              {health.alerts.map((alert) => (
                <article key={alert.name}>
                  <div>
                    <strong>{alert.name}</strong>
                  </div>
                  <p>{alert.signal}</p>
                  <small>{alert.response}</small>
                </article>
              ))}
            </div>
          </section>
          <section className="ops-panel recovery-panel">
            <h2><RotateCcw size={18} /> Failed-job recovery</h2>
            <p>{health.failedJobRecovery.detection}</p>
            <div className="recovery-status-row">
              <span><strong>{health.failedJobRecovery.liveStatus.failedImageJobs}</strong><small>Failed image jobs</small></span>
              <span><strong>{health.failedJobRecovery.liveStatus.deadLetterImageJobs}</strong><small>DLQ candidates</small></span>
              <span><strong>{health.failedJobRecovery.liveStatus.activeImageJobs}</strong><small>Active jobs</small></span>
              <button
                className="secondary-button"
                disabled={busy || !can("ops:recover") || !health.runtimeProof.opsSimulation.enabled}
                title={!can("ops:recover") ? "Admin access required" : health.runtimeProof.opsSimulation.enabled ? undefined : "Failure simulation is disabled in this environment"}
                onClick={() => void simulateFailedJob()}
              >
                <PlayCircle size={15} /> Simulate failed job
              </button>
              <button
                className="secondary-button"
                disabled={busy || !can("ops:recover") || health.failedJobRecovery.liveStatus.failedImageJobs === 0}
                title={can("ops:recover") ? undefined : "Admin access required"}
                onClick={() => void recoverFailedJobs()}
              >
                <RotateCcw size={15} /> Requeue failed jobs
              </button>
            </div>
            {recoveryMessage ? <div className="recovery-message">{recoveryMessage}</div> : null}
            <div className="recovery-columns">
              <div>
                <h3>Operator path</h3>
                <ol>
                  {health.failedJobRecovery.operatorWorkflow.map((item) => <li key={item}>{item}</li>)}
                </ol>
              </div>
              <div>
                <h3>Safeguards</h3>
                <ul>
                  {health.failedJobRecovery.safeguards.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
            <div className="dashboard-chip-row">
              <span>{health.operationsDashboard.name}</span>
              <span>{health.operationsDashboard.region}</span>
              {health.operationsDashboard.widgets.map((widget) => <span key={widget}>{widget}</span>)}
            </div>
          </section>
        </div>
      ) : null}
      {health?.aiContract ? (
        <div className="ai-contract-panel">
          <div>
            <h2>AI validation contract</h2>
            <p>{health.aiContract.confidencePolicy}</p>
            <p>{health.aiContract.imageQualityPolicy}</p>
          </div>
          <dl>
            <div><dt>Provider</dt><dd>{health.aiContract.provider}</dd></div>
            <div><dt>Prompt version</dt><dd>{health.aiContract.promptVersion}</dd></div>
            <div><dt>Schema</dt><dd>{health.aiContract.schema}</dd></div>
            <div><dt>Production path</dt><dd>{health.aiContract.productionTarget}</dd></div>
          </dl>
          <div className="contract-fields">
            {health.aiContract.validatedFields.map((field) => <span key={field}>{field}</span>)}
          </div>
        </div>
      ) : null}
      {health?.productionReadinessProof ? (
        <div className="production-proof-panel">
          <div>
            <h2>Production readiness proof</h2>
            <p>Current implementation evidence separated from the gate that would be required before buyer-visible production launch.</p>
          </div>
          <div className="proof-card-grid">
            {health.productionReadinessProof.map((item) => (
              <article key={item.area}>
                <div>
                  <strong>{item.area}</strong>
                  <span className={proofStatusClass(item.status)}>{item.status}</span>
                </div>
                <p>{item.current}</p>
                <small>{item.productionGate}</small>
              </article>
            ))}
          </div>
        </div>
      ) : null}
      {health ? (
        <div className="production-readiness-grid">
          <article>
            <h2>Persistence</h2>
            <strong>{health.persistence.activeMode}</strong>
            <p>{health.persistence.postgresReady ? health.persistence.productionMode : health.persistence.localMode}</p>
            <div className="repository-proof-list">
              {health.persistence.hotPathRepositories.map((repo) => (
                <span key={repo.domain}>{repo.domain}</span>
              ))}
            </div>
          </article>
          <article>
            <h2>Image storage</h2>
            <strong>{health.storageContract.uploadIntentEndpoint}</strong>
            <p>{health.storageContract.productionBehavior}</p>
          </article>
          <article>
            <h2>Image worker</h2>
            <strong>{health.asyncWorkerContract.queueEvent}</strong>
            <p>{health.asyncWorkerContract.idempotency}</p>
            <small>{health.asyncWorkerContract.deadLetterPolicy}</small>
          </article>
        </div>
      ) : null}
      {health?.implementationBoundary ? (
        <div className="implementation-boundary-panel">
          <div>
            <h2>Implementation boundary</h2>
            <p>{health.implementationBoundary.gradingBoundary}</p>
          </div>
          <div className="boundary-grid">
            <article>
              <h3>Controlled test path</h3>
              <ul>
                {health.implementationBoundary.local.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
            <article>
              <h3>Production path</h3>
              <ul>
                {health.implementationBoundary.production.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          </div>
        </div>
      ) : null}
      <div className="metrics-band">
        <h2>Tracked metrics</h2>
        <div>
          {health?.metricsTracked.map((metric) => <span key={metric}>{metric}</span>)}
        </div>
      </div>
    </section>
  );
}

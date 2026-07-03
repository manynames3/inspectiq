import { CheckCircle2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api.js";

type Health = {
  scorecard: Array<{ pillar: string; status: string; evidence: string }>;
  metricsTracked: string[];
  operationalMetrics: Array<{ metric: string; label: string; value: string; status: string; evidence: string }>;
  aiContract: {
    provider: string;
    promptVersion: string;
    schema: string;
    validatedFields: string[];
    confidencePolicy: string;
    productionTarget: string;
  };
};

export function PlatformHealthPage() {
  const [health, setHealth] = useState<Health | null>(null);

  async function load() {
    setHealth(await api<Health>("/api/platform-health"));
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Platform Health</h1>
          <p>Well-Architected signals tied to the inspection workflow implementation.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
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
      {health?.aiContract ? (
        <div className="ai-contract-panel">
          <div>
            <h2>AI validation contract</h2>
            <p>{health.aiContract.confidencePolicy}</p>
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
      <div className="metrics-band">
        <h2>Tracked metrics</h2>
        <div>
          {health?.metricsTracked.map((metric) => <span key={metric}>{metric}</span>)}
        </div>
      </div>
    </section>
  );
}

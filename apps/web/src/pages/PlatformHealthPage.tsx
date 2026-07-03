import { CheckCircle2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../api.js";

type Health = {
  scorecard: Array<{ pillar: string; status: string; evidence: string }>;
  metricsTracked: string[];
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
      <div className="metrics-band">
        <h2>Tracked metrics</h2>
        <div>
          {health?.metricsTracked.map((metric) => <span key={metric}>{metric}</span>)}
        </div>
      </div>
    </section>
  );
}

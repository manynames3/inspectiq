import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { StatusPill } from "../components/StatusPill.js";
import type { Inspection } from "../types.js";

export function DashboardPage() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      setInspections(await api<Inspection[]>("/api/inspections"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inspections.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Seeded synthetic inspections for the local demo flow.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>VIN</th>
              <th>Status</th>
              <th>Complete</th>
              <th>Grade</th>
              <th>Review</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {inspections.map((inspection) => (
              <tr key={inspection.id}>
                <td>
                  <strong>{inspection.year} {inspection.make} {inspection.model}</strong>
                  <small>{inspection.trim || "Base"} · {inspection.mileage.toLocaleString()} mi</small>
                </td>
                <td>{inspection.vin}</td>
                <td><StatusPill status={inspection.status} /></td>
                <td>
                  <div className="progress-cell">
                    <span>{inspection.completenessPercentage}%</span>
                    <div><i style={{ width: `${inspection.completenessPercentage}%` }} /></div>
                  </div>
                </td>
                <td>{inspection.conditionGrade?.grade ?? "Not graded"}</td>
                <td>{inspection.humanReviewFlag ? <span className="review-flag"><AlertTriangle size={14} /> Required</span> : "Clear"}</td>
                <td>{new Date(inspection.updatedAt).toLocaleString()}</td>
                <td>
                  <Link className="row-link" to={`/inspections/${inspection.id}`}>
                    Open <ArrowRight size={15} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}


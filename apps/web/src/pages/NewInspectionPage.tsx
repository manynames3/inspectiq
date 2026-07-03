import { Save } from "lucide-react";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useActor } from "../App.js";
import type { Inspection } from "../types.js";

const initialForm = {
  vin: "5NMJBCAE4RH123456",
  year: "2024",
  make: "Hyundai",
  model: "Tucson",
  trim: "SEL",
  mileage: "14250",
  exteriorColor: "Gray",
  sellerSource: "Dealer trade-in lane",
  inspectorName: "John Smith"
};

export function NewInspectionPage() {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { actor, can } = useActor();
  const canCreateInspection = can("inspection:create");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!canCreateInspection) {
      setError("Inspector or Admin access is required to create inspections.");
      return;
    }
    try {
      const created = await api<Inspection>("/api/inspections", {
        method: "POST",
        body: JSON.stringify(form)
      }, actor);
      navigate(`/inspections/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create inspection.");
    }
  }

  return (
    <section className="page narrow-page">
      <div className="page-heading">
        <div>
          <h1>New Inspection</h1>
          <p>Create a vehicle inspection record for intake and review.</p>
        </div>
      </div>
      {!canCreateInspection ? (
        <div className="role-callout role-restricted">
          <strong>Inspector or Admin access required</strong>
          <span>Reviewers work from existing inspections once photo evidence and analysis are available.</span>
        </div>
      ) : null}
      {error ? <div className="error-banner">{error}</div> : null}
      <form className="form-grid" onSubmit={(event) => void submit(event)}>
        {Object.entries(form).map(([key, value]) => (
          <label key={key}>
            {key.replace(/([A-Z])/g, " $1")}
            <input
              disabled={!canCreateInspection}
              value={value}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
            />
          </label>
        ))}
        <button className="primary-button form-submit" disabled={!canCreateInspection}>
          <Save size={16} /> Create inspection
        </button>
      </form>
    </section>
  );
}

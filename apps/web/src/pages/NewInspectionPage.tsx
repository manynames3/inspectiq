import { Save } from "lucide-react";
import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useActor } from "../App.js";
import type { Inspection } from "../types.js";

const initialForm = {
  vin: "SYNTHVIN24NEW001",
  year: "2024",
  make: "Hyundai",
  model: "Tucson",
  trim: "SEL",
  mileage: "14250",
  exteriorColor: "Gray",
  sellerSource: "Dealer trade",
  inspectorName: "Demo Inspector"
};

export function NewInspectionPage() {
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { actor } = useActor();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
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
          <p>Create a synthetic vehicle session for the demo workflow.</p>
        </div>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      <form className="form-grid" onSubmit={(event) => void submit(event)}>
        {Object.entries(form).map(([key, value]) => (
          <label key={key}>
            {key.replace(/([A-Z])/g, " $1")}
            <input
              value={value}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
            />
          </label>
        ))}
        <button className="primary-button form-submit">
          <Save size={16} /> Create inspection
        </button>
      </form>
    </section>
  );
}


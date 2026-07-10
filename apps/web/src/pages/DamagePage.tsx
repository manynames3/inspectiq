import { AlertTriangle, RefreshCw, Search } from "lucide-react";
import { estimateDamageRepairCost, estimateTotalRepairRange } from "@inspectiq/shared";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useActor } from "../App.js";
import type { DamageItem } from "../types.js";
import { loadInspectionReviewRecords, type InspectionReviewRecord } from "./reviewData.js";

type DamageRow = {
  record: InspectionReviewRecord;
  item: DamageItem;
};
type SeverityFilter = "all" | DamageItem["severity"];
type SourceFilter = "all" | DamageItem["source"];
type DamageSort = "severity" | "estimate" | "vehicle";

function titleCase(value: string): string {
  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function DamagePage() {
  const { actor } = useActor();
  const [records, setRecords] = useState<InspectionReviewRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [sortBy, setSortBy] = useState<DamageSort>("severity");

  async function load() {
    setError(null);
    try {
      setRecords(await loadInspectionReviewRecords(actor));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load damage items.");
    }
  }

  useEffect(() => {
    void load();
  }, [actor]);

  const rows = useMemo<DamageRow[]>(() => records.flatMap((record) =>
    record.bundle.damageItems.map((item) => ({ record, item }))
  ), [records]);
  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const severityRank: Record<DamageItem["severity"], number> = {
      severe: 0,
      moderate: 1,
      minor: 2,
      unknown: 3
    };
    const matched = rows.filter(({ record, item }) => {
      if (severityFilter !== "all" && item.severity !== severityFilter) return false;
      if (sourceFilter !== "all" && item.source !== sourceFilter) return false;
      if (!normalizedQuery) return true;
      return [
        `${record.inspection.year} ${record.inspection.make} ${record.inspection.model}`,
        record.inspection.vin,
        item.location,
        item.damageType,
        item.severity,
        item.notes ?? ""
      ].join(" ").toLowerCase().includes(normalizedQuery);
    });
    return [...matched].sort((left, right) => {
      if (sortBy === "vehicle") {
        return `${left.record.inspection.make} ${left.record.inspection.model}`.localeCompare(`${right.record.inspection.make} ${right.record.inspection.model}`);
      }
      if (sortBy === "estimate") {
        return estimateDamageRepairCost(right.item.damageType, right.item.severity).max
          - estimateDamageRepairCost(left.item.damageType, left.item.severity).max;
      }
      return severityRank[left.item.severity] - severityRank[right.item.severity];
    });
  }, [query, records, rows, severityFilter, sortBy, sourceFilter]);
  const minorCount = rows.filter(({ item }) => item.severity === "minor").length;
  const moderateCount = rows.filter(({ item }) => item.severity === "moderate").length;
  const severeCount = rows.filter(({ item }) => item.severity === "severe").length;
  const partialDetailCount = records.filter((record) => record.bundleLoadError).length;
  const totalReconEstimate = estimateTotalRepairRange(rows.map(({ item }) => item));

  return (
    <section className="page">
      <div className="page-heading">
        <div>
          <h1>Damage</h1>
          <p>Confirmed condition issues from manual review and accepted model findings.</p>
        </div>
        <button className="secondary-button" onClick={() => void load()}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>
      {error ? <div className="error-banner">{error}</div> : null}
      {partialDetailCount > 0 ? (
        <div className="warning-banner">
          Showing available damage records while {partialDetailCount} inspection detail refresh{partialDetailCount === 1 ? "" : "es"} finish.
        </div>
      ) : null}

      <div className="summary-grid">
        <article className="summary-card">
          <AlertTriangle size={18} />
          <span>Total damage items</span>
          <strong>{rows.length}</strong>
        </article>
        <article className="summary-card">
          <span>Minor</span>
          <strong>{minorCount}</strong>
        </article>
        <article className="summary-card">
          <span>Moderate</span>
          <strong>{moderateCount}</strong>
        </article>
        <article className="summary-card">
          <span>Recon estimate</span>
          <strong>{totalReconEstimate?.label ?? "$0"}</strong>
        </article>
      </div>
      <div className="queue-context-line">
        <span>{minorCount} minor</span>
        <span>{moderateCount} moderate</span>
        <span>{severeCount} severe</span>
      </div>

      <div className="queue-filter-bar damage-filter-bar">
        <label className="queue-search-field">
          <Search size={15} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search VIN, vehicle, location, notes..."
            aria-label="Search damage items"
          />
        </label>
        <label>
          Severity
          <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value as SeverityFilter)}>
            <option value="all">All severity</option>
            <option value="severe">Severe</option>
            <option value="moderate">Moderate</option>
            <option value="minor">Minor</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label>
          Source
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
            <option value="all">All sources</option>
            <option value="vision_suggestion">Model-assisted</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        <label>
          Sort
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value as DamageSort)}>
            <option value="severity">Severity</option>
            <option value="estimate">Recon estimate</option>
            <option value="vehicle">Vehicle</option>
          </select>
        </label>
        <button
          className="secondary-button queue-reset-button"
          onClick={() => {
            setQuery("");
            setSeverityFilter("all");
            setSourceFilter("all");
            setSortBy("severity");
          }}
        >
          Reset
        </button>
      </div>
      <div className="queue-results-line">
        <span>{filteredRows.length} of {rows.length} damage items</span>
        <span>Prioritize severe and high-estimate recon before report release.</span>
      </div>

      <div className="table-panel">
        {rows.length === 0 ? (
          <div className="empty-state">
            <AlertTriangle size={22} />
            <strong>No confirmed damage yet</strong>
            <span>Add damage from an inspection detail page or accept an AI damage candidate.</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="empty-state">
            <AlertTriangle size={22} />
            <strong>No damage items match the filters</strong>
            <span>Clear filters or search a different VIN, location, or note.</span>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Inspection</th>
                <th>Location</th>
                <th>Type</th>
                <th>Severity</th>
                <th>Recon estimate</th>
                <th>Source</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(({ record, item }) => (
                <tr key={item.id}>
                  <td>
                    <strong>{record.inspection.year} {record.inspection.make} {record.inspection.model}</strong>
                    <small>{record.inspection.vin}</small>
                  </td>
                  <td>{titleCase(item.location)}</td>
                  <td>{titleCase(item.damageType)}</td>
                  <td><span className={`queue-status severity-${item.severity}`}>{item.severity}</span></td>
                  <td>{estimateDamageRepairCost(item.damageType, item.severity).label}</td>
                  <td>{item.source === "vision_suggestion" ? "Model-assisted, reviewer-confirmed" : "Manual"}</td>
                  <td>{item.notes || "No notes"}</td>
                  <td><Link className="row-link" to={`/inspections/${record.inspection.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

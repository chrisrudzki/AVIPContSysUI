import { useState } from "react";
import "./App.css";

// Reusable date-range control with an "All time" override.
// Props:
//   title       - heading text (e.g. "Graph Interval", "Delete Data")
//   actionLabel - label for the submit button (e.g. "generate data", "Delete")
//   idPrefix    - unique prefix for input ids/htmlFor, needed since this
//                 component can appear more than once on the same page
//   onSubmit    - called with { start, end, allTime } when the button is clicked
export default function DateRangePicker({
  title,
  actionLabel = "Submit",
  idPrefix = "drp",
  onSubmit,
}) {
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [allTime, setAllTime] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (field) => (e) => {
    const value = e.target.value;
    const next = { ...dateRange, [field]: value };

    if (next.start && next.end && next.start > next.end) {
      setError("Start date must be before end date.");
    } else {
      setError("");
    }

    setDateRange(next);
  };

  const toggleAllTime = () => {
    const next = !allTime;
    setAllTime(next);
    if (next) {
      setError("");
      setDateRange({ start: "", end: "" });
    }
  };

  const hasCompleteRange = Boolean(dateRange.start && dateRange.end);
  const canSubmit = allTime || (hasCompleteRange && !error);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit?.({ start: dateRange.start, end: dateRange.end, allTime });
  };

  return (
    <div className="drp">
      <div className="drp-header">
        <h2 className="drp-title">{title}</h2>
        <label className="drp-alltime">
          <input
            type="checkbox"
            className="drp-alltime-checkbox"
            checked={allTime}
            onChange={toggleAllTime}
          />
          All time
        </label>
      </div>

      <div className={`drp-fields ${allTime ? "drp-fields-disabled" : ""}`}>
        <div className="drp-field">
          <label className="drp-label" htmlFor={`${idPrefix}-start`}>
            Start date
          </label>
          <input
            id={`${idPrefix}-start`}
            type="date"
            className="drp-input"
            value={dateRange.start}
            max={dateRange.end || undefined}
            onChange={handleChange("start")}
            disabled={allTime}
          />
        </div>

        <div className="drp-field">
          <label className="drp-label" htmlFor={`${idPrefix}-end`}>
            End date
          </label>
          <input
            id={`${idPrefix}-end`}
            type="date"
            className="drp-input"
            value={dateRange.end}
            min={dateRange.start || undefined}
            onChange={handleChange("end")}
            disabled={allTime}
          />
        </div>
      </div>

      {error && !allTime && <p className="drp-error">{error}</p>}
      {allTime && <p className="drp-alltime-message">All time selected</p>}

      <button
        className="drp-submit"
        onClick={handleSubmit}
        disabled={!canSubmit}
      >
        {actionLabel}
      </button>
    </div>
  );
}

import { useState } from "react";
import "./App.css";

// Reusable date-range control with an "All time" override.
// Props:
//   title       - heading text (e.g. "Graph Interval", "Delete Data")
//   actionLabel - label for the submit button (e.g. "generate data", "Delete")
//   idPrefix    - unique prefix for input ids/htmlFor, needed since this
//                 component can appear more than once on the same page
//   onSubmit    - called with { start, end, allTime } when the button is clicked.
//                 start/end are combined "YYYY-MM-DDTHH:mm" local datetime
//                 strings (empty if allTime is true).
export default function DateRangePicker({
  title,
  actionLabel = "Submit",
  idPrefix = "drp",
  onSubmit,
}) {
  const [dateRange, setDateRange] = useState({
    startDate: "",
    startTime: "00:00",
    endDate: "",
    endTime: "23:59",
  });
  const [allTime, setAllTime] = useState(false);
  const [error, setError] = useState("");

  // Combine date + time fields into a single sortable "YYYY-MM-DDTHH:mm"
  // string so comparisons (and the max/min cross-linking below) work
  // the same way plain date strings did before.
  const combine = (date, time) => (date ? `${date}T${time || "00:00"}` : "");

  const handleChange = (field) => (e) => {
    const value = e.target.value;
    const next = { ...dateRange, [field]: value };

    const startCombined = combine(next.startDate, next.startTime);
    const endCombined = combine(next.endDate, next.endTime);

    if (startCombined && endCombined && startCombined > endCombined) {
      setError("Start must be before end.");
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
      setDateRange({ startDate: "", startTime: "00:00", endDate: "", endTime: "23:59" });
    }
  };

  const startCombined = combine(dateRange.startDate, dateRange.startTime);
  const endCombined = combine(dateRange.endDate, dateRange.endTime);

  const hasCompleteRange = Boolean(dateRange.startDate && dateRange.endDate);
  const canSubmit = allTime || (hasCompleteRange && !error);

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit?.({ start: startCombined, end: endCombined, allTime });
  };

  return (
    <div className="drp">
      <div className="drp-header">
        
        <h2 className="drp-title">{title + '    (Victoria time)'}</h2>
        
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
          <label className="drp-label" htmlFor={`${idPrefix}-start-date`}>
            Start date
          </label>
          <input
            id={`${idPrefix}-start-date`}
            type="date"
            className="drp-input"
            value={dateRange.startDate}
            max={dateRange.endDate || undefined}
            onChange={handleChange("startDate")}
            disabled={allTime}
          />
          <label className="drp-label" htmlFor={`${idPrefix}-start-time`}>
            Start time
          </label>
          <input
            id={`${idPrefix}-start-time`}
            type="time"
            className="drp-input"
            value={dateRange.startTime}
            onChange={handleChange("startTime")}
            disabled={allTime}
          />
        </div>

        <div className="drp-field">
          <label className="drp-label" htmlFor={`${idPrefix}-end-date`}>
            End date
          </label>
          <input
            id={`${idPrefix}-end-date`}
            type="date"
            className="drp-input"
            value={dateRange.endDate}
            min={dateRange.startDate || undefined}
            onChange={handleChange("endDate")}
            disabled={allTime}
          />
          <label className="drp-label" htmlFor={`${idPrefix}-end-time`}>
            End time
          </label>
          <input
            id={`${idPrefix}-end-time`}
            type="time"
            className="drp-input"
            value={dateRange.endTime}
            onChange={handleChange("endTime")}
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
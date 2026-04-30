const filters = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Closed", value: "closed" },
  { label: "Applied", value: "applied" },
];

export default function FilterButtons({ activeFilter, counts, onFilterChange }) {
  return (
    <div className="filter-group">
      <span className="filter-label">View</span>
      <div className="filters" aria-label="Choose opportunity view">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={activeFilter === filter.value ? "filter active" : "filter"}
            onClick={() => onFilterChange(filter.value)}
          >
            <span>{filter.label}</span>
            <span
              className="filter-count"
              aria-label={`${counts[filter.value] ?? 0} opportunities`}
            >
              {counts[filter.value] ?? 0}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

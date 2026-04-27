const filters = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Open Soon", value: "open-soon" },
];

export default function FilterButtons({ activeFilter, counts, onFilterChange }) {
  return (
    <div className="filter-group">
      <span className="filter-label">Status</span>
      <div className="filters" aria-label="Filter opportunities by status">
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            className={activeFilter === filter.value ? "filter active" : "filter"}
            onClick={() => onFilterChange(filter.value)}
          >
            <span>{filter.label}</span>
            <span className="filter-count" aria-label={`${counts[filter.value]} opportunities`}>
              {counts[filter.value]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

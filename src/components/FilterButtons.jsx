const filters = [
  { label: "All", value: "all" },
  { label: "Open", value: "open" },
  { label: "Open Soon", value: "open-soon" },
];

export default function FilterButtons({ activeFilter, onFilterChange }) {
  return (
    <div className="filters" aria-label="Filter opportunities by status">
      {filters.map((filter) => (
        <button
          key={filter.value}
          type="button"
          className={activeFilter === filter.value ? "filter active" : "filter"}
          onClick={() => onFilterChange(filter.value)}
        >
          {filter.label}
        </button>
      ))}
    </div>
  );
}

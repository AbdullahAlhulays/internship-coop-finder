import { formatNumber } from "../utils/locale.js";

const filterValues = ["open", "closed", "applied"];

export default function FilterButtons({
  activeFilter,
  counts,
  onFilterChange,
  locale,
  messages,
}) {
  return (
    <div className="filter-group">
      <span className="filter-label">{messages.filters.view}</span>
      <div className="filters" aria-label={messages.filters.chooseView}>
        {filterValues.map((value) => {
          const count = formatNumber(counts[value] ?? 0, locale);

          return (
            <button
              key={value}
              type="button"
              className={activeFilter === value ? "filter active" : "filter"}
              onClick={() => onFilterChange(value)}
            >
              <span>{messages.filters[value]}</span>
              <span
                className="filter-count"
                aria-label={messages.filters.count(count)}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

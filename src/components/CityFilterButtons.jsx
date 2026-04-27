export default function CityFilterButtons({
  activeCity,
  cities,
  counts,
  onCityChange,
}) {
  if (cities.length === 0) {
    return null;
  }

  return (
    <div className="filter-group">
      <span className="filter-label">Cities</span>
      <div className="filters" aria-label="Filter opportunities by city">
        <button
          type="button"
          className={activeCity === "all" ? "filter active" : "filter"}
          onClick={() => onCityChange("all")}
        >
          <span>All Cities</span>
          <span className="filter-count" aria-label={`${counts.all} opportunities`}>
            {counts.all}
          </span>
        </button>

        {cities.map((city) => (
          <button
            key={city}
            type="button"
            className={activeCity === city ? "filter active" : "filter"}
            onClick={() => onCityChange(city)}
          >
            <span>{city}</span>
            <span className="filter-count" aria-label={`${counts[city]} opportunities`}>
              {counts[city]}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}


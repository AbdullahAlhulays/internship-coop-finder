export default function CitySelect({ activeCity, cities, counts, onCityChange }) {
  const hasCities = cities.length > 0;

  return (
    <label className="city-select">
      <span>City</span>
      <select
        value={activeCity}
        onChange={(event) => onCityChange(event.target.value)}
        disabled={!hasCities}
        aria-label={hasCities ? "Filter by city" : "No cities available"}
      >
        <option value="all">All Cities ({counts.all})</option>
        {cities.map((city) => (
          <option key={city} value={city}>
            {city} ({counts[city]})
          </option>
        ))}
      </select>
    </label>
  );
}


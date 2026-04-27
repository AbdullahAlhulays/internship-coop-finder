export default function CitySelect({ activeCity, cities, counts, onCityChange }) {
  if (cities.length === 0) {
    return null;
  }

  return (
    <label className="city-select">
      <span>City</span>
      <select
        value={activeCity}
        onChange={(event) => onCityChange(event.target.value)}
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


import {
  formatNumber,
  getLocalizedCity,
} from "../utils/locale.js";

export default function CitySelect({
  activeCity,
  cities,
  counts,
  onCityChange,
  locale,
  messages,
}) {
  const hasCities = cities.length > 0;

  return (
    <label className="city-select">
      <span>{messages.filters.city}</span>
      <select
        value={activeCity}
        onChange={(event) => onCityChange(event.target.value)}
        disabled={!hasCities}
        aria-label={
          hasCities ? messages.filters.filterByCity : messages.filters.noCities
        }
      >
        <option value="all">
          {messages.filters.allCities(formatNumber(counts.all, locale))}
        </option>
        {cities.map((city) => (
          <option key={city} value={city}>
            {messages.filters.cityOption(
              getLocalizedCity(city, locale),
              formatNumber(counts[city], locale),
            )}
          </option>
        ))}
      </select>
    </label>
  );
}

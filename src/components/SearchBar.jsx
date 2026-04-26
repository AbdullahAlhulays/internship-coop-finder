export default function SearchBar({ searchTerm, onSearchChange }) {
  return (
    <label className="search-bar">
      <span>Find a company</span>
      <input
        type="search"
        value={searchTerm}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search Aramco, SABIC, stc..."
      />
    </label>
  );
}

import { useEffect, useRef } from "react";

export default function SearchBar({ searchTerm, onSearchChange }) {
  const inputRef = useRef(null);

  useEffect(() => {
    function handleSearchShortcut(event) {
      if (event.key !== "/" || event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const target = event.target;
      const isEditing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      if (isEditing) {
        return;
      }

      event.preventDefault();
      inputRef.current?.focus();
    }

    window.addEventListener("keydown", handleSearchShortcut);

    return () => {
      window.removeEventListener("keydown", handleSearchShortcut);
    };
  }, []);

  return (
    <label className="search-bar">
      <span>Find a company</span>
      <input
        ref={inputRef}
        type="search"
        value={searchTerm}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder="Search Aramco, SABIC, stc..."
      />
    </label>
  );
}

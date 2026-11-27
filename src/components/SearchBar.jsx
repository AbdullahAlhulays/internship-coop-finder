import { useEffect, useRef } from "react";

export default function SearchBar({ searchTerm, onSearchChange, messages }) {
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
      <span>{messages.search.label}</span>
      <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
      <input
        ref={inputRef}
        type="search"
        aria-label={messages.search.label}
        value={searchTerm}
        onChange={(event) => onSearchChange(event.target.value)}
        placeholder={messages.search.placeholder}
      />
    </label>
  );
}

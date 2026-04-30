export default function MobileBottomNav({ activeFilter, counts, onFilterChange }) {
  const activeTab =
    activeFilter === "closed" || activeFilter === "applied"
      ? activeFilter
      : "browse";
  const navItems = [
    { label: "Browse", value: "browse", count: counts.all ?? 0 },
    { label: "Closed", value: "closed", count: counts.closed ?? 0 },
    { label: "Applied", value: "applied", count: counts.applied ?? 0 },
  ];

  function handleNavClick(value) {
    onFilterChange(value === "browse" ? "all" : value);
  }

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
      {navItems.map((item) => (
        <button
          key={item.value}
          type="button"
          className={
            activeTab === item.value
              ? "mobile-nav-item active"
              : "mobile-nav-item"
          }
          aria-current={activeTab === item.value ? "page" : undefined}
          onClick={() => handleNavClick(item.value)}
        >
          <span>{item.label}</span>
          <strong>{item.count}</strong>
        </button>
      ))}
    </nav>
  );
}

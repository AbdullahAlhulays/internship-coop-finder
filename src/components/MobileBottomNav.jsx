export default function MobileBottomNav({ activeFilter, counts, onFilterChange }) {
  const activeTab = ["open", "closed", "applied", "new"].includes(activeFilter)
    ? activeFilter
    : "open";
  const navItems = [
    { label: "Open", value: "open", count: counts.open ?? 0 },
    { label: "Closed", value: "closed", count: counts.closed ?? 0 },
    { label: "Applied", value: "applied", count: counts.applied ?? 0 },
    { label: "New", value: "new", count: counts.new ?? 0 },
  ];

  function handleNavClick(value) {
    onFilterChange(value);
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

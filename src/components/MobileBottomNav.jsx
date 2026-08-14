import { formatNumber } from "../utils/locale.js";

export default function MobileBottomNav({
  activeFilter,
  counts,
  onFilterChange,
  locale,
  messages,
}) {
  const activeTab = ["open", "closed", "applied"].includes(activeFilter)
    ? activeFilter
    : "open";
  const navItems = ["open", "closed", "applied"].map((value) => ({
    label: messages.filters[value],
    value,
    count: counts[value] ?? 0,
  }));

  return (
    <nav
      className="mobile-bottom-nav"
      aria-label={messages.filters.mobileNavigation}
    >
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
          onClick={() => onFilterChange(item.value)}
        >
          <span>{item.label}</span>
          <strong>{formatNumber(item.count, locale)}</strong>
        </button>
      ))}
    </nav>
  );
}

export default function ThemeToggle({ theme, onToggle, messages }) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={isDark}
      aria-label={isDark ? messages.theme.light : messages.theme.dark}
      title={isDark ? messages.theme.light : messages.theme.dark}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {isDark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5" /></> : <path d="M20.9 13a9 9 0 0 1-9.9-9.9A9 9 0 1 0 20.9 13Z" />}
      </svg>
    </button>
  );
}

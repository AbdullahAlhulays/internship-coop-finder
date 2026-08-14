export default function ThemeToggle({ theme, onToggle, messages }) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={isDark}
      onClick={onToggle}
    >
      {isDark ? messages.theme.light : messages.theme.dark}
    </button>
  );
}

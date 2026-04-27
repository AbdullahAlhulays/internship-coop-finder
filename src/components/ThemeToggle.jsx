export default function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={isDark}
      onClick={onToggle}
    >
      {isDark ? "Light mode" : "Dark mode"}
    </button>
  );
}

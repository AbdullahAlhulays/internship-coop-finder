import ThemeToggle from "./ThemeToggle.jsx";

export default function Header({ theme, onThemeToggle }) {
  return (
    <header className="site-header">
      <div className="header-content">
        <div className="header-actions">
          <ThemeToggle theme={theme} onToggle={onThemeToggle} />
        </div>

        <div className="quote-wrap">
          <p className="arabic-quote" lang="ar" dir="rtl">
            {"{ والذي نفسُ مُحَمَّدٍ بيدِهِ لا يُؤْمِنُ أحدُكُم حتى يُحِبَّ لِأَخِيهِ ما يُحِبُّ لنفسِهِ من الخيرِ }"}
          </p>
        </div>

        <div className="intro">
          <h1>Student opportunities</h1>
        </div>
      </div>
    </header>
  );
}

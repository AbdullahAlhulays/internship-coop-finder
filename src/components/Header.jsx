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
          <div className="brand-lockup" aria-label="Fursati">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 48 48" focusable="false">
                <path
                  className="brand-mark-bg"
                  d="M24 4C12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20S35.05 4 24 4Z"
                />
                <path
                  className="brand-mark-path"
                  d="M14.5 25.5c2.8-7.1 9.5-11.6 18.4-11.6h1.7l-3.8-4.1 3-2.8 8.8 9.4-8.8 9.4-3-2.8 3.7-4h-1.6c-6.4 0-11.3 3-13.9 8.3l4 1.5-10 8.6-1.5-13 3 1.1Z"
                />
                <path
                  className="brand-mark-spark"
                  d="M24.5 30.2c2.5 0 4.5 2 4.5 4.4 0 2.5-2 4.5-4.5 4.5S20 37.1 20 34.6c0-2.4 2-4.4 4.5-4.4Z"
                />
              </svg>
            </span>
            <h1>Fursati</h1>
          </div>
          <h2>Internships &amp; CO-OP Opportunities for Students</h2>
        </div>
      </div>
    </header>
  );
}

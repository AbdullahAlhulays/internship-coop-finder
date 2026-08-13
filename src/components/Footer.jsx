export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-card">
        <div className="footer-intro">
          <p className="footer-eyebrow">Fursati</p>
          <h2>Helping students find their next opportunity.</h2>
          <p>
            If you find a good opportunity, share it. Someone may be waiting
            for exactly that link.
          </p>
        </div>

        <div className="footer-support">
          <p className="footer-eyebrow">Support &amp; suggestions</p>
          <p>Found an issue or have an idea? Get in touch.</p>
          <nav className="footer-links" aria-label="Support and social links">
            <a href="mailto:abdullah.alhulays@gmail.com">
              <span>Email</span>
              <span aria-hidden="true">↗</span>
            </a>
            <a
              href="https://linkedin.com/in/abdullah-alhulays-131240380"
              target="_blank"
              rel="noreferrer"
            >
              <span>LinkedIn</span>
              <span aria-hidden="true">↗</span>
            </a>
            <a
              href="https://x.com/abdullahmo44945?s=11"
              target="_blank"
              rel="noreferrer"
            >
              <span>X</span>
              <span aria-hidden="true">↗</span>
            </a>
          </nav>
        </div>
      </div>

      <p className="footer-note">Built to make the opportunity search easier.</p>
    </footer>
  );
}

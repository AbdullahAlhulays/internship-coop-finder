import { getLocalizedSitePage, sitePages } from "../data/siteContent.js";
import { getSitePagePath } from "../utils/siteRoutes.js";
import InternalLink from "./InternalLink.jsx";

export default function Footer({ messages, locale = "en", navigate }) {
  return (
    <footer className="site-footer">
      <div className="footer-card">
        <div className="footer-intro">
          <h2>{messages.footer.title}</h2>
          <p>{messages.footer.body}</p>
        </div>

        <div className="footer-support">
          <p className="footer-eyebrow">{messages.footer.support}</p>
          <p>{messages.footer.contact}</p>
          <nav
            className="footer-links"
            aria-label={messages.footer.linksLabel}
          >
            <a href="mailto:abdullah.alhulays@gmail.com">
              <span>{messages.footer.email}</span>
              <span aria-hidden="true">{"\u2197"}</span>
            </a>
            <a
              href="https://linkedin.com/in/abdullah-alhulays-131240380"
              target="_blank"
              rel="noreferrer"
            >
              <span>LinkedIn</span>
              <span aria-hidden="true">{"\u2197"}</span>
            </a>
            <a
              href="https://x.com/abdullahmo44945?s=11"
              target="_blank"
              rel="noreferrer"
            >
              <span>X</span>
              <span aria-hidden="true">{"\u2197"}</span>
            </a>
          </nav>
        </div>
      </div>

      <nav
        className="footer-policy-links"
        aria-label={
          locale === "ar" ? "صفحات التعريف والسياسات" : "About and policy pages"
        }
      >
        {sitePages.map((page) => (
          <InternalLink
            key={page.slug}
            href={getSitePagePath(page.slug, locale)}
            navigate={navigate}
          >
            {getLocalizedSitePage(page.slug, locale).title}
          </InternalLink>
        ))}
      </nav>

      <p className="footer-note">{messages.footer.note}</p>
    </footer>
  );
}

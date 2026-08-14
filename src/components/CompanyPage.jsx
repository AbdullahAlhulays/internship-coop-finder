import CompanyLogo from "./CompanyLogo.jsx";
import Footer from "./Footer.jsx";
import PageHeader from "./PageHeader.jsx";
import {
  getCompanyDisplayName,
  getEnglishCompanyName,
} from "../data/companyLogos.js";
import {
  getLocalizedCompanyDescription,
  getLocalizedLocation,
} from "../utils/locale.js";

function CompanyDescription({ description }) {
  const sections = description
    .trim()
    .split(/\n{2,}/)
    .map((section) => section.split("\n").filter(Boolean))
    .filter((section) => section.length > 0);

  return (
    <div className="company-description">
      {sections.map(([heading, ...lines]) => {
        const bullets = lines.filter((line) => line.startsWith("• "));
        const paragraphs = lines.filter((line) => !line.startsWith("• "));

        return (
          <section className="company-description-section" key={heading}>
            <h2>{heading}</h2>
            {paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {bullets.length > 0 && (
              <ul>
                {bullets.map((bullet) => (
                  <li key={bullet}>{bullet.slice(2)}</li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

export default function CompanyPage({
  company,
  statusKey,
  theme,
  onThemeToggle,
  navigate,
  onReturnToHome,
  locale,
  messages,
  homeHref,
  languageHref,
}) {
  const englishName = getEnglishCompanyName(company.name);
  const displayName = getCompanyDisplayName(company.name);
  const headingName = locale === "ar" ? displayName : englishName;
  const canApply = statusKey === "open";
  const isOpenSoon = statusKey === "open-soon";
  const isClosed = statusKey === "closed";
  const description = getLocalizedCompanyDescription(company, locale);

  return (
    <div className="company-page">
      <PageHeader
        theme={theme}
        onThemeToggle={onThemeToggle}
        navigate={navigate}
        locale={locale}
        messages={messages}
        homeHref={homeHref}
        languageHref={languageHref}
      />

      <main className="company-detail-shell">
        <a
          className="back-link"
          href={homeHref}
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }

            event.preventDefault();
            onReturnToHome();
          }}
        >
          <span aria-hidden="true">{locale === "ar" ? "\u2192" : "\u2190"}</span>
          {messages.companyPage.allOpportunities}
        </a>

        <article className="company-detail-card">
          <header className="company-detail-hero">
            <CompanyLogo company={company} eager messages={messages} />
            <div>
              <p className="company-detail-name" dir="auto">
                {displayName}
              </p>
              <h1 dir="auto">{messages.companyPage.heading(headingName)}</h1>
              {company.location?.trim() && (
                <p className="company-detail-location" dir="auto">
                  {getLocalizedLocation(company.location, locale)}
                </p>
              )}
            </div>
          </header>

          <section
            className={`company-description-panel ${
              description ? "has-description" : "is-empty"
            }`}
            aria-label={messages.companyPage.descriptionArea(headingName)}
          >
            {description && <CompanyDescription description={description} />}
          </section>

          <div className="company-detail-actions">
            <a
              className={
                canApply
                  ? "detail-apply-button"
                  : "detail-apply-button disabled"
              }
              href={canApply ? company.applicationLink : undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!canApply}
              tabIndex={canApply ? 0 : -1}
            >
              {isClosed
                ? messages.companyPage.applicationsClosed
                : isOpenSoon
                  ? messages.companyPage.opensSoon
                  : messages.companyPage.applyOfficial}
            </a>
          </div>
        </article>
      </main>

      <Footer messages={messages} />
    </div>
  );
}

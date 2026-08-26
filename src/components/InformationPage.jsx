import { SITE_CONTENT_UPDATED } from "../data/siteContent.js";
import { localizePathname } from "../utils/locale.js";
import Footer from "./Footer.jsx";
import InternalLink from "./InternalLink.jsx";
import PageHeader from "./PageHeader.jsx";

function formatUpdatedDate(locale) {
  const date = new Date(`${SITE_CONTENT_UPDATED}T12:00:00`);

  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-SA-u-ca-gregory-nu-arab" : "en-US",
    { day: "numeric", month: "long", year: "numeric" },
  ).format(date);
}

export default function InformationPage({
  content,
  theme,
  onThemeToggle,
  navigate,
  locale,
  messages,
  homeHref,
  languageHref,
}) {
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

      <main className="company-detail-shell information-page-shell">
        <InternalLink className="back-link" href={homeHref} navigate={navigate}>
          <span aria-hidden="true">{locale === "ar" ? "\u2192" : "\u2190"}</span>
          {messages.companyPage.allOpportunities}
        </InternalLink>

        <article className="information-page-card">
          <header className="information-page-hero">
            <p className="detail-eyebrow">{content.eyebrow}</p>
            <h1>{content.title}</h1>
            <p>{content.intro}</p>
            <p className="information-page-updated">
              {locale === "ar" ? "آخر تحديث" : "Last updated"}: {" "}
              {formatUpdatedDate(locale)}
            </p>
          </header>

          <div className="information-page-content">
            {content.sections.map((section) => (
              <section key={section.heading}>
                <h2>{section.heading}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
                {section.bullets && (
                  <ul>
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                )}
                {section.links && (
                  <div className="information-page-links">
                    {section.links.map((link) => {
                      const isInternal = link.href.startsWith("/");
                      const href = isInternal
                        ? localizePathname(link.href, locale)
                        : link.href;

                      return isInternal ? (
                        <InternalLink
                          key={link.href}
                          href={href}
                          navigate={navigate}
                        >
                          {link.label}
                        </InternalLink>
                      ) : (
                        <a
                          key={link.href}
                          href={href}
                          target={href.startsWith("http") ? "_blank" : undefined}
                          rel={href.startsWith("http") ? "noreferrer" : undefined}
                        >
                          {link.label}
                        </a>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        </article>
      </main>

      <Footer messages={messages} locale={locale} navigate={navigate} />
    </div>
  );
}

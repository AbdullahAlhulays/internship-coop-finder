import CompanyLogo from "./CompanyLogo.jsx";
import Footer from "./Footer.jsx";
import InternalLink from "./InternalLink.jsx";
import PageHeader from "./PageHeader.jsx";
import {
  getCompanyPath,
  getRestoredArabicCompanyName,
  hasRestoredCompanyPage,
} from "../utils/companyRoutes.js";
import {
  getCompanyDisplayName,
  getEnglishCompanyName,
  getOpportunityTypeKey,
} from "../data/companyLogos.js";
import {
  getLocalizedCompanyDescription,
  getLocalizedLocation,
} from "../utils/locale.js";
import { formatDeadline } from "../utils/status.js";

const detailLabels = {
  en: {
    details: "Announcement details",
    source: "Application source",
    added: "Added to Fursati",
    lastVerified: "Last verified",
    notSpecified: "Not specified",
    notRequired: "Not specified as required",
    sourceNote:
      "Requirements and role details are organized from the linked announcement. Confirm the latest terms at the source before applying.",
  },
  ar: {
    details: "تفاصيل الإعلان المتاحة",
    source: "مصدر التقديم",
    added: "تاريخ الإضافة إلى فرصتي",
    lastVerified: "آخر تحقق",
    notSpecified: "غير محدد",
    notRequired: "لم يُذكر أنه مطلوب",
    sourceNote:
      "نُظمت المتطلبات وتفاصيل الدور من الإعلان المرتبط. تأكد من أحدث الشروط في المصدر قبل التقديم.",
  },
};

function formatSourceDate(value, locale) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(
    locale === "ar" ? "ar-SA-u-ca-gregory-nu-arab" : "en-US",
    { day: "numeric", month: "long", year: "numeric" },
  ).format(date);
}

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
  relatedCompanies = [],
}) {
  const englishName = getEnglishCompanyName(company.name);
  const displayName = getCompanyDisplayName(company.name);
  const headingName =
    locale === "ar"
      ? hasRestoredCompanyPage(company)
        ? getRestoredArabicCompanyName(company)
        : displayName
      : englishName;
  const canApply = statusKey === "open";
  const isOpenSoon = statusKey === "open-soon";
  const isClosed = statusKey === "closed";
  const description = getLocalizedCompanyDescription(company, locale);
  const labels = detailLabels[locale] ?? detailLabels.en;
  const opportunityType = getOpportunityTypeKey(company.type);
  const deadline = company.deadline
    ? formatDeadline(company.deadline, company.deadlineTime, locale)
    : messages.companyPage.openUntilFilled;
  const sourceDateValue = company.lastVerifiedAt ?? company.addedAt;
  const sourceDate = formatSourceDate(sourceDateValue, locale);
  const sourceDateLabel = company.lastVerifiedAt
    ? labels.lastVerified
    : labels.added;
  const statusLabel = isClosed
    ? messages.companyPage.closed
    : isOpenSoon
      ? messages.companyPage.opensSoon
      : messages.companyPage.open;

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

          <section className="company-facts" aria-label={labels.details}>
            <h2>{labels.details}</h2>
            <dl>
              <div>
                <dt>{messages.companyPage.type}</dt>
                <dd>{messages.opportunityTypes[opportunityType]}</dd>
              </div>
              <div>
                <dt>{messages.companyPage.status}</dt>
                <dd>{statusLabel}</dd>
              </div>
              <div>
                <dt>{messages.companyPage.deadline}</dt>
                <dd>{deadline || labels.notSpecified}</dd>
              </div>
              <div>
                <dt>{messages.companyPage.universityLetter}</dt>
                <dd>
                  {company.requiresLetter
                    ? messages.companyPage.required
                    : labels.notRequired}
                </dd>
              </div>
              {sourceDate && (
                <div>
                  <dt>{sourceDateLabel}</dt>
                  <dd>{sourceDate}</dd>
                </div>
              )}
              <div>
                <dt>{labels.source}</dt>
                <dd>
                  <a
                    href={company.applicationLink}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {labels.source}
                  </a>
                </dd>
              </div>
            </dl>
            <p>{labels.sourceNote}</p>
          </section>

          {description && (
            <section
              className="company-description-panel has-description"
              aria-label={messages.companyPage.descriptionArea(headingName)}
            >
              <CompanyDescription description={description} />
            </section>
          )}

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

          {relatedCompanies.length > 0 && (
            <nav className="company-related" aria-label={locale === "ar" ? "فرص ذات صلة" : "Related opportunities"}>
              <h2>{locale === "ar" ? "فرص ذات صلة" : "Related opportunities"}</h2>
              <ul>
                {relatedCompanies.map(({ company: related, slug }) => (
                  <li key={slug}>
                    <InternalLink
                      href={getCompanyPath(slug, locale)}
                      navigate={navigate}
                    >
                      {getCompanyDisplayName(related.name)}
                    </InternalLink>
                  </li>
                ))}
              </ul>
            </nav>
          )}
        </article>
      </main>

      <Footer messages={messages} locale={locale} navigate={navigate} />
    </div>
  );
}

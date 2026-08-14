import { memo } from "react";
import CompanyLogo from "./CompanyLogo.jsx";
import InternalLink from "./InternalLink.jsx";
import {
  getCompanyDisplayName,
  getOpportunityTypeKey,
} from "../data/companyLogos.js";
import { getCompanyPath } from "../utils/companyRoutes.js";
import {
  formatNumber,
  getLocalizedCompanyDescription,
  getLocalizedLocation,
} from "../utils/locale.js";
import { formatDeadline } from "../utils/status.js";

function getDeadlineContent(
  company,
  statusKey,
  statusDaysLeft,
  isUrgent,
  locale,
  messages,
) {
  if (statusKey === "closed") {
    return { label: null, value: messages.card.applicationsClosed };
  }

  if (statusKey === "open-soon" && company.openingDate) {
    return {
      label: messages.card.applicationsOpen,
      value:
        formatDeadline(company.openingDate, undefined, locale) ||
        messages.card.deadlineUnavailable,
    };
  }

  if (!company.deadline) {
    return { label: null, value: messages.card.openUntilFilled };
  }

  if (isUrgent) {
    if (statusDaysLeft <= 0) {
      return { label: null, value: messages.card.closesToday };
    }

    if (statusDaysLeft === 1) {
      return { label: null, value: messages.card.closesTomorrow };
    }

    return {
      label: null,
      value: messages.card.closesInDays(
        formatNumber(statusDaysLeft, locale),
      ),
    };
  }

  return {
    label: messages.card.deadline,
    value:
      formatDeadline(company.deadline, company.deadlineTime, locale) ||
      messages.card.deadlineUnavailable,
  };
}

function CompanyCard({
  company,
  slug,
  statusKey,
  statusDaysLeft,
  isUrgent,
  isApplied = false,
  onAppliedToggle,
  navigate,
  locale,
  messages,
}) {
  const isOpenSoon = statusKey === "open-soon";
  const isClosed = statusKey === "closed";
  const canApply = statusKey === "open";
  const requiresLetter = Boolean(company.requiresLetter);
  const hasLocation = Boolean(company.location?.trim());
  const deadlineContent = getDeadlineContent(
    company,
    statusKey,
    statusDaysLeft,
    isUrgent,
    locale,
    messages,
  );
  const displayName = getCompanyDisplayName(company.name);
  const opportunityType = getOpportunityTypeKey(company.type);
  const hasDescription = Boolean(
    getLocalizedCompanyDescription(company, locale),
  );

  return (
    <article
      className={`company-card ${isOpenSoon ? "is-open-soon" : ""} ${
        isUrgent ? "is-urgent" : ""
      } ${isClosed ? "is-closed" : ""} ${isApplied ? "is-applied" : ""}`}
    >
      <div className="company-identity">
        <CompanyLogo company={company} messages={messages} />
        <div className="company-heading">
          <h2 dir="auto" title={company.name} aria-label={company.name}>
            {displayName}
          </h2>
          {hasLocation && (
            <p className="location" dir="auto">
              {getLocalizedLocation(company.location, locale)}
            </p>
          )}
        </div>
      </div>

      <div className="opportunity-meta">
        <span className="opportunity-type">
          {messages.opportunityTypes[opportunityType]}
        </span>
        {requiresLetter && (
          <>
            <span className="meta-separator" aria-hidden="true">
              {"\u2022"}
            </span>
            <span className="letter-requirement">
              <span className="letter-badge-icon" aria-hidden="true" />
              {messages.card.letterRequired}
            </span>
          </>
        )}
      </div>

      <div className="deadline-line" aria-label={deadlineContent.value}>
        <span className="deadline-dot" aria-hidden="true" />
        {deadlineContent.label && <span>{deadlineContent.label}</span>}
        <strong>{deadlineContent.value}</strong>
      </div>

      <div className="card-actions">
        <a
          className={canApply ? "apply-button" : "apply-button disabled"}
          href={canApply ? company.applicationLink : undefined}
          target="_blank"
          rel="noreferrer"
          aria-disabled={!canApply}
          tabIndex={canApply ? 0 : -1}
        >
          {isClosed
            ? messages.card.closed
            : isOpenSoon
              ? messages.card.opensSoon
              : isApplied
                ? messages.card.viewApplication
                : messages.card.applyNow}
        </a>

        {hasDescription ? (
          <InternalLink
            className="description-button"
            href={getCompanyPath(slug, locale)}
            navigate={navigate}
            aria-label={messages.card.descriptionLabel(displayName)}
          >
            {messages.card.description}
          </InternalLink>
        ) : (
          <span className="description-button unavailable" aria-disabled="true">
            {messages.card.descriptionUnavailable}
          </span>
        )}

        {canApply && (
          <button
            type="button"
            className={isApplied ? "applied-button active" : "applied-button"}
            aria-pressed={isApplied}
            onClick={() => onAppliedToggle(company.applicationLink)}
          >
            {isApplied
              ? `\u2713 ${messages.card.applied}`
              : messages.card.markApplied}
          </button>
        )}
      </div>
    </article>
  );
}

export default memo(CompanyCard);

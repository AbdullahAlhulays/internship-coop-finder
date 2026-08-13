import CompanyLogo from "./CompanyLogo.jsx";
import {
  getCompanyDisplayName,
  getOpportunityTypeLabel,
} from "../data/companyLogos.js";
import {
  formatDeadline,
  getCompanyStatus,
  isDeadlineUrgent,
} from "../utils/status.js";

function getDeadlineContent(company, status, isUrgent) {
  if (status.key === "closed") {
    return {
      label: null,
      value: "Applications closed",
    };
  }

  if (status.key === "open-soon" && company.openingDate) {
    return {
      label: "Applications open",
      value: formatDeadline(company.openingDate),
    };
  }

  if (!company.deadline) {
    return {
      label: null,
      value: "Open until filled",
    };
  }

  if (isUrgent) {
    if (status.daysLeft <= 0) {
      return { label: null, value: "Closes today" };
    }

    if (status.daysLeft === 1) {
      return { label: null, value: "Closes tomorrow" };
    }

    return { label: null, value: `Closes in ${status.daysLeft} days` };
  }

  return {
    label: "Deadline",
    value: formatDeadline(company.deadline, company.deadlineTime),
  };
}

export default function CompanyCard({
  company,
  currentTime,
  isApplied = false,
  onAppliedToggle = () => {},
}) {
  const status = getCompanyStatus(company, currentTime);
  const isOpenSoon = status.key === "open-soon";
  const isClosed = status.key === "closed";
  const canApply = status.key === "open";
  const isUrgent = isDeadlineUrgent(company, currentTime);
  const requiresLetter = Boolean(company.requiresLetter);
  const hasLocation = Boolean(company.location?.trim());
  const deadlineContent = getDeadlineContent(company, status, isUrgent);
  const displayName = getCompanyDisplayName(company.name);

  return (
    <article
      className={`company-card ${isOpenSoon ? "is-open-soon" : ""} ${
        isUrgent ? "is-urgent" : ""
      } ${isClosed ? "is-closed" : ""} ${isApplied ? "is-applied" : ""}`}
    >
      <div className="company-identity">
        <CompanyLogo company={company} />
        <div className="company-heading">
          <h2 dir="auto" title={company.name} aria-label={company.name}>
            {displayName}
          </h2>
          {hasLocation && <p className="location">{company.location}</p>}
        </div>
      </div>

      <div className="opportunity-meta">
        <span className="opportunity-type">
          {getOpportunityTypeLabel(company.type)}
        </span>
        {requiresLetter && (
          <>
            <span className="meta-separator" aria-hidden="true">•</span>
            <span className="letter-requirement">
              <span className="letter-badge-icon" aria-hidden="true" />
              Letter required
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
            ? "Closed"
            : isOpenSoon
              ? "Opens soon"
              : isApplied
                ? "View application"
                : "Apply now"}
        </a>

        {canApply && (
          <button
            type="button"
            className={isApplied ? "applied-button active" : "applied-button"}
            disabled={!canApply}
            aria-pressed={isApplied}
            onClick={() => onAppliedToggle(company.applicationLink)}
          >
            {isApplied ? "✓ Applied" : "Mark applied"}
          </button>
        )}
      </div>
    </article>
  );
}

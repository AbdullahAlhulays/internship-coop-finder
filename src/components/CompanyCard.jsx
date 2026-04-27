import { useState } from "react";
import {
  formatCountdown,
  formatDeadline,
  getCompanyStatus,
  getDeadlineCountdown,
  getOpeningCountdown,
  isDeadlineUrgent,
} from "../utils/status.js";

export default function CompanyCard({ company, currentTime }) {
  const status = getCompanyStatus(company, currentTime);
  const isOpenSoon = status.key === "open-soon";
  const canApply = status.key === "open";
  const isUrgent = isDeadlineUrgent(company, currentTime);
  const hasBio = Boolean(company.bio?.trim());
  const hasLocation = Boolean(company.location?.trim());
  const hasDeadline = Boolean(company.deadline?.trim());
  const deadlineCountdown = getDeadlineCountdown(
    company.deadline,
    currentTime,
    company.deadlineTime,
  );
  const openingCountdown =
    isOpenSoon && company.openingDate
      ? getOpeningCountdown(company.openingDate, currentTime)
      : null;
  const [showBio, setShowBio] = useState(false);

  return (
    <article
      className={`company-card ${isOpenSoon ? "is-open-soon" : ""} ${
        isUrgent ? "is-urgent" : ""
      }`}
    >
      <div className="card-topline">
        <span className="opportunity-type">{company.type}</span>
        <span className={`status status-${status.key}`}>{status.label}</span>
      </div>

      <div>
        <h2>{company.name}</h2>
        {hasLocation && <p className="location">{company.location}</p>}
        {hasBio && (
          <button
            type="button"
            className="bio-toggle"
            aria-expanded={showBio}
            onClick={() => setShowBio((current) => !current)}
          >
            {showBio ? "Hide bio" : "About company"}
          </button>
        )}
        {hasBio && showBio && <p className="bio">{company.bio}</p>}
      </div>

      <div className="deadline-box">
        {isOpenSoon && company.openingDate && (
          <>
            <span>Opens</span>
            <strong>{formatDeadline(company.openingDate)}</strong>
            <small className="live-countdown">
              Opens in {formatCountdown(openingCountdown)}
            </small>
          </>
        )}
        <span>Deadline</span>
        <strong>{formatDeadline(company.deadline, company.deadlineTime)}</strong>
        {canApply && isUrgent && (
          <small className="deadline-alert">Less than 48 hours left</small>
        )}
        {canApply && hasDeadline && (
          <small className="live-countdown">
            Closes in {formatCountdown(deadlineCountdown)}
          </small>
        )}
        {canApply && !hasDeadline && <small>No deadline specified</small>}
      </div>

      <a
        className={canApply ? "apply-button" : "apply-button disabled"}
        href={canApply ? company.applicationLink : undefined}
        target="_blank"
        rel="noreferrer"
        aria-disabled={!canApply}
        tabIndex={canApply ? 0 : -1}
      >
        {isOpenSoon ? "Open soon" : "Apply now"}
      </a>
    </article>
  );
}

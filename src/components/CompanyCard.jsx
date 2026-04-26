import { useState } from "react";
import {
  formatCountdown,
  formatDeadline,
  getCompanyStatus,
  getDeadlineCountdown,
  getOpeningCountdown,
} from "../utils/status.js";

export default function CompanyCard({ company, currentTime }) {
  const status = getCompanyStatus(company, currentTime);
  const isOpenSoon = status.key === "open-soon";
  const canApply = status.key === "open";
  const hasBio = Boolean(company.bio?.trim());
  const deadlineCountdown = getDeadlineCountdown(company.deadline, currentTime);
  const openingCountdown =
    isOpenSoon && company.openingDate
      ? getOpeningCountdown(company.openingDate, currentTime)
      : null;
  const [showBio, setShowBio] = useState(false);

  return (
    <article className={`company-card ${isOpenSoon ? "is-open-soon" : ""}`}>
      <div className="card-topline">
        <span className="opportunity-type">{company.type}</span>
        <span className={`status status-${status.key}`}>{status.label}</span>
      </div>

      <div>
        <h2>{company.name}</h2>
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
        <strong>{formatDeadline(company.deadline)}</strong>
        {canApply && (
          <small className="live-countdown">
            Closes in {formatCountdown(deadlineCountdown)}
          </small>
        )}
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

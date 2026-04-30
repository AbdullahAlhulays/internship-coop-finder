import { useState } from "react";
import {
  formatCountdown,
  formatDeadline,
  getCompanyStatus,
  getDeadlineCountdown,
  getOpeningCountdown,
  isDeadlineUrgent,
} from "../utils/status.js";

function getWhatsAppShareUrl(company) {
  const message = `Check out this student opportunity from ${company.name}: ${company.applicationLink}`;

  return `https://wa.me/?text=${encodeURIComponent(message)}`;
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
  const whatsappShareUrl = getWhatsAppShareUrl(company);
  const [showBio, setShowBio] = useState(false);

  return (
    <article
      className={`company-card ${isOpenSoon ? "is-open-soon" : ""} ${
        isUrgent ? "is-urgent" : ""
      } ${isClosed ? "is-closed" : ""}`}
    >
      <div className="card-topline">
        <div className="card-badges">
          <span className="opportunity-type">{company.type}</span>
          {company.isNew && <span className="new-badge">New</span>}
        </div>
        <div className="card-status-actions">
          <span className={`status status-${status.key}`}>{status.label}</span>
        </div>
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
        {isClosed && (
          <>
            <span>Status</span>
            <strong>Closed</strong>
            <small>Applications are no longer accepting submissions.</small>
          </>
        )}
        {!isClosed && isOpenSoon && company.openingDate && (
          <>
            <span>Opens</span>
            <strong>{formatDeadline(company.openingDate)}</strong>
            <small className="live-countdown">
              Opens in {formatCountdown(openingCountdown)}
            </small>
          </>
        )}
        {!isClosed && <span>Deadline</span>}
        {!isClosed && (
          <strong>{formatDeadline(company.deadline, company.deadlineTime)}</strong>
        )}
        {!isClosed && canApply && isUrgent && (
          <small className="deadline-alert">Less than 48 hours left</small>
        )}
        {!isClosed && canApply && hasDeadline && (
          <small className="live-countdown">
            Closes in {formatCountdown(deadlineCountdown)}
          </small>
        )}
        {!isClosed && canApply && !hasDeadline && (
          <small>No deadline specified</small>
        )}
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
          {isClosed ? "Closed" : isOpenSoon ? "Open soon" : "Apply now"}
        </a>
        <div className="secondary-actions">
          <a
            className="whatsapp-share"
            href={whatsappShareUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Share ${company.name} on WhatsApp`}
          >
            WhatsApp
          </a>
          <button
            type="button"
            className={isApplied ? "applied-button active" : "applied-button"}
            disabled={!canApply}
            aria-pressed={isApplied}
            onClick={() => onAppliedToggle(company.applicationLink)}
          >
            {isApplied ? "Applied" : "Mark applied"}
          </button>
        </div>
      </div>
    </article>
  );
}

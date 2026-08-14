import { memo } from "react";
import CompanyCard from "./CompanyCard.jsx";

function CompanyList({
  records,
  appliedLinks,
  onAppliedToggle,
}) {
  if (records.length === 0) {
    return (
      <div className="empty-state">
        <h2>No opportunities found</h2>
        <p>Try another company name or choose a different status filter.</p>
      </div>
    );
  }

  return (
    <section className="company-grid" aria-label="Company opportunities">
      {records.map(({ company, statusKey, statusDaysLeft, isUrgent }) => (
        <CompanyCard
          key={company.applicationLink}
          company={company}
          statusKey={statusKey}
          statusDaysLeft={statusDaysLeft}
          isUrgent={isUrgent}
          isApplied={appliedLinks.has(company.applicationLink)}
          onAppliedToggle={onAppliedToggle}
        />
      ))}
    </section>
  );
}

export default memo(CompanyList);

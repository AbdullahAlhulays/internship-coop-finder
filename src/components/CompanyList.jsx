import { memo } from "react";
import CompanyCard from "./CompanyCard.jsx";

function CompanyList({
  records,
  appliedLinks,
  onAppliedToggle,
  navigate,
  locale,
  messages,
}) {
  if (records.length === 0) {
    return (
      <div className="empty-state">
        <h2>{messages.emptyState.title}</h2>
        <p>{messages.emptyState.body}</p>
      </div>
    );
  }

  return (
    <section className="company-grid" aria-label={messages.emptyState.listLabel}>
      {records.map(({ company, slug, statusKey, statusDaysLeft, isUrgent }) => (
        <CompanyCard
          key={company.applicationLink}
          company={company}
          slug={slug}
          statusKey={statusKey}
          statusDaysLeft={statusDaysLeft}
          isUrgent={isUrgent}
          isApplied={appliedLinks.has(company.applicationLink)}
          onAppliedToggle={onAppliedToggle}
          navigate={navigate}
          locale={locale}
          messages={messages}
        />
      ))}
    </section>
  );
}

export default memo(CompanyList);

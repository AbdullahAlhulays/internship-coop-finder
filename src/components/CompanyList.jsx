import CompanyCard from "./CompanyCard.jsx";

export default function CompanyList({
  companies,
  currentTime,
  appliedLinks,
  savedLinks,
  onAppliedToggle,
  onSavedToggle,
}) {
  if (companies.length === 0) {
    return (
      <div className="empty-state">
        <h2>No opportunities found</h2>
        <p>Try another company name or choose a different status filter.</p>
      </div>
    );
  }

  return (
    <section className="company-grid" aria-label="Company opportunities">
      {companies.map((company) => (
        <CompanyCard
          key={company.applicationLink}
          company={company}
          currentTime={currentTime}
          isApplied={appliedLinks.has(company.applicationLink)}
          isSaved={savedLinks.has(company.applicationLink)}
          onAppliedToggle={onAppliedToggle}
          onSavedToggle={onSavedToggle}
        />
      ))}
    </section>
  );
}

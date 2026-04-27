import CompanyCard from "./CompanyCard.jsx";

export default function CompanyList({ companies, currentTime }) {
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
        />
      ))}
    </section>
  );
}

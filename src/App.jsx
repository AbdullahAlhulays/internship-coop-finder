import { useEffect, useMemo, useState } from "react";
import Header from "./components/Header.jsx";
import SearchBar from "./components/SearchBar.jsx";
import FilterButtons from "./components/FilterButtons.jsx";
import CompanyList from "./components/CompanyList.jsx";
import Footer from "./components/Footer.jsx";
import { companies as fallbackCompanies } from "./data/companies.js";
import { getCompanies } from "./services/companiesApi.js";
import { getCompanyStatus } from "./utils/status.js";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const CLOCK_INTERVAL_MS = 1000;

export default function App() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [companies, setCompanies] = useState(fallbackCompanies);
  const [isLoading, setIsLoading] = useState(Boolean(import.meta.env.VITE_COMPANIES_DATA_URL));
  const [dataError, setDataError] = useState("");
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    let isMounted = true;

    async function loadCompanies({ showLoading = false } = {}) {
      if (showLoading) {
        setIsLoading(true);
      }

      try {
        const latestCompanies = await getCompanies();

        if (isMounted) {
          setCompanies(latestCompanies);
          setDataError("");
        }
      } catch (error) {
        if (isMounted) {
          setDataError(error.message);
          setCompanies(fallbackCompanies);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadCompanies({ showLoading: true });

    const intervalId = window.setInterval(loadCompanies, REFRESH_INTERVAL_MS);

    function refreshWhenVisible() {
      if (!document.hidden) {
        loadCompanies();
      }
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    const clockId = window.setInterval(() => {
      setCurrentTime(new Date());
    }, CLOCK_INTERVAL_MS);

    return () => window.clearInterval(clockId);
  }, []);

  const filteredCompanies = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return companies.filter((company) => {
      const status = getCompanyStatus(company, currentTime);
      const matchesSearch = company.name.toLowerCase().includes(normalizedSearch);
      const isVisible = status.key !== "closed";
      const matchesFilter =
        activeFilter === "all" || status.key === activeFilter;

      return isVisible && matchesSearch && matchesFilter;
    });
  }, [activeFilter, companies, currentTime, searchTerm]);

  const opportunityCounts = useMemo(() => {
    return companies.reduce(
      (counts, company) => {
        const status = getCompanyStatus(company, currentTime);

        if (status.key === "closed") {
          return counts;
        }

        counts.all += 1;
        counts[status.key] += 1;

        return counts;
      },
      {
        all: 0,
        open: 0,
        "open-soon": 0,
      },
    );
  }, [companies, currentTime]);

  return (
    <>
      <Header />

      <main className="page-shell">
        <section className="controls" aria-label="Search and filters">
          <SearchBar searchTerm={searchTerm} onSearchChange={setSearchTerm} />
          <FilterButtons
            activeFilter={activeFilter}
            counts={opportunityCounts}
            onFilterChange={setActiveFilter}
          />
        </section>

        {isLoading && <p className="data-note">Loading latest opportunities...</p>}
        {dataError && (
          <p className="data-note error">
            Using local backup data. {dataError}
          </p>
        )}

        <CompanyList companies={filteredCompanies} currentTime={currentTime} />
      </main>

      <Footer />
    </>
  );
}

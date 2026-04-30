import { useEffect, useMemo, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import Header from "./components/Header.jsx";
import SearchBar from "./components/SearchBar.jsx";
import FilterButtons from "./components/FilterButtons.jsx";
import CitySelect from "./components/CitySelect.jsx";
import DeadlineSortToggle from "./components/DeadlineSortToggle.jsx";
import CompanyList from "./components/CompanyList.jsx";
import Footer from "./components/Footer.jsx";
import MobileBottomNav from "./components/MobileBottomNav.jsx";
import { companies as fallbackCompanies } from "./data/companies.js";
import { getCompanies } from "./services/companiesApi.js";
import { getCompanyCities } from "./utils/cities.js";
import { getCompanyStatus, getDeadlineSortTime } from "./utils/status.js";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const CLOCK_INTERVAL_MS = 1000;
const THEME_STORAGE_KEY = "internship-coop-theme";
const SAVED_STORAGE_KEY = "internship-coop-saved";
const APPLIED_STORAGE_KEY = "internship-coop-applied";
const LAST_UPDATED = "April 30, 2026";

function getSortLabel(company) {
  return company.name || company.title || company.type || "";
}

function getSavedTheme() {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark"
      ? "dark"
      : "light";
  } catch {
    return "light";
  }
}

function getStoredLinks(storageKey) {
  try {
    const parsedLinks = JSON.parse(window.localStorage.getItem(storageKey));

    return Array.isArray(parsedLinks)
      ? parsedLinks.filter((link) => typeof link === "string")
      : [];
  } catch {
    return [];
  }
}

function saveStoredLinks(storageKey, links) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(links));
  } catch {
    // Saving is optional; the app still works for the current session.
  }
}

function toggleStoredLink(link, links) {
  if (links.includes(link)) {
    return links.filter((storedLink) => storedLink !== link);
  }

  return [...links, link];
}

export default function App() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [activeCity, setActiveCity] = useState("all");
  const [sortByDeadline, setSortByDeadline] = useState(false);
  const [theme, setTheme] = useState(getSavedTheme);
  const [savedLinks, setSavedLinks] = useState(() =>
    getStoredLinks(SAVED_STORAGE_KEY),
  );
  const [appliedLinks, setAppliedLinks] = useState(() =>
    getStoredLinks(APPLIED_STORAGE_KEY),
  );
  const [companies, setCompanies] = useState(fallbackCompanies);
  const [isLoading, setIsLoading] = useState(
    Boolean(import.meta.env.VITE_COMPANIES_DATA_URL),
  );
  const [dataError, setDataError] = useState("");
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const savedLinksSet = useMemo(() => new Set(savedLinks), [savedLinks]);
  const appliedLinksSet = useMemo(() => new Set(appliedLinks), [appliedLinks]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme still changes even if the browser blocks localStorage.
    }
  }, [theme]);

  useEffect(() => {
    saveStoredLinks(SAVED_STORAGE_KEY, savedLinks);
  }, [savedLinks]);

  useEffect(() => {
    saveStoredLinks(APPLIED_STORAGE_KEY, appliedLinks);
  }, [appliedLinks]);

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

    return companies
      .filter((company) => {
        const status = getCompanyStatus(company, currentTime);
        const isSaved = savedLinksSet.has(company.applicationLink);
        const isApplied = appliedLinksSet.has(company.applicationLink);
        const matchesSearch = getSortLabel(company)
          .toLowerCase()
          .includes(normalizedSearch);
        const isVisible = status.key !== "closed" || company.isClosed;
        const matchesFilter =
          activeFilter === "saved"
            ? isSaved
            : activeFilter === "applied"
              ? isApplied
              : activeFilter === "all" || status.key === activeFilter;
        const cities = getCompanyCities(company);
        const matchesCity = activeCity === "all" || cities.includes(activeCity);

        return isVisible && matchesSearch && matchesFilter && matchesCity;
      })
      .sort((firstCompany, secondCompany) => {
        const labelSort = getSortLabel(firstCompany).localeCompare(getSortLabel(secondCompany), "en", {
          numeric: true,
          sensitivity: "base",
        });

        if (!sortByDeadline) {
          return labelSort;
        }

        const deadlineSort =
          getDeadlineSortTime(firstCompany) - getDeadlineSortTime(secondCompany);

        return deadlineSort || labelSort;
      });
  }, [
    activeCity,
    activeFilter,
    appliedLinksSet,
    companies,
    currentTime,
    savedLinksSet,
    searchTerm,
    sortByDeadline,
  ]);

  const opportunityCounts = useMemo(() => {
    return companies.reduce(
      (counts, company) => {
        const status = getCompanyStatus(company, currentTime);

        if (status.key === "closed" && !company.isClosed) {
          return counts;
        }

        counts.all += 1;
        if (counts[status.key] !== undefined) {
          counts[status.key] += 1;
        }

        if (savedLinksSet.has(company.applicationLink)) {
          counts.saved += 1;
        }

        if (appliedLinksSet.has(company.applicationLink)) {
          counts.applied += 1;
        }

        return counts;
      },
      {
        all: 0,
        open: 0,
        "open-soon": 0,
        saved: 0,
        applied: 0,
      },
    );
  }, [appliedLinksSet, companies, currentTime, savedLinksSet]);

  const handleSavedToggle = (applicationLink) => {
    setSavedLinks((currentLinks) =>
      toggleStoredLink(applicationLink, currentLinks),
    );
  };

  const handleAppliedToggle = (applicationLink) => {
    setAppliedLinks((currentLinks) =>
      toggleStoredLink(applicationLink, currentLinks),
    );
  };

  const cityCounts = useMemo(() => {
    return companies.reduce(
      (counts, company) => {
        const status = getCompanyStatus(company, currentTime);

        if (status.key === "closed" && !company.isClosed) {
          return counts;
        }

        const cities = getCompanyCities(company);

        cities.forEach((city) => {
          counts[city] = (counts[city] ?? 0) + 1;
        });

        return counts;
      },
      {
        all: opportunityCounts.all,
      },
    );
  }, [companies, currentTime, opportunityCounts.all]);

  const cityOptions = useMemo(() => {
    return Object.keys(cityCounts)
      .filter((city) => city !== "all")
      .sort((firstCity, secondCity) => firstCity.localeCompare(secondCity));
  }, [cityCounts]);

  useEffect(() => {
    if (activeCity !== "all" && !cityOptions.includes(activeCity)) {
      setActiveCity("all");
    }
  }, [activeCity, cityOptions]);

  return (
    <>
      <Header
        theme={theme}
        onThemeToggle={() =>
          setTheme((currentTheme) =>
            currentTheme === "dark" ? "light" : "dark",
          )
        }
      />

      <main className="page-shell">
        <p className="last-updated">Last updated: {LAST_UPDATED}</p>

        <section className="controls" aria-label="Search and filters">
          <SearchBar searchTerm={searchTerm} onSearchChange={setSearchTerm} />
          <div className="filter-panel">
            <FilterButtons
              activeFilter={activeFilter}
              counts={opportunityCounts}
              onFilterChange={setActiveFilter}
            />
            <div className="filter-pair">
              <CitySelect
                activeCity={activeCity}
                cities={cityOptions}
                counts={cityCounts}
                onCityChange={setActiveCity}
              />
              <DeadlineSortToggle
                checked={sortByDeadline}
                onChange={setSortByDeadline}
              />
            </div>
          </div>
        </section>

        {isLoading && <p className="data-note">Loading latest opportunities...</p>}
        {dataError && (
          <p className="data-note error">
            Using local backup data. {dataError}
          </p>
        )}

        <CompanyList
          companies={filteredCompanies}
          currentTime={currentTime}
          appliedLinks={appliedLinksSet}
          savedLinks={savedLinksSet}
          onAppliedToggle={handleAppliedToggle}
          onSavedToggle={handleSavedToggle}
        />
      </main>

      <Footer />
      <MobileBottomNav
        activeFilter={activeFilter}
        counts={opportunityCounts}
        onFilterChange={setActiveFilter}
      />
      <Analytics />
    </>
  );
}

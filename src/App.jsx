import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Analytics } from "@vercel/analytics/react";
import Header from "./components/Header.jsx";
import InformationPage from "./components/InformationPage.jsx";
import SearchBar from "./components/SearchBar.jsx";
import FilterButtons from "./components/FilterButtons.jsx";
import CitySelect from "./components/CitySelect.jsx";
import DeadlineSortToggle from "./components/DeadlineSortToggle.jsx";
import LetterRequirementToggle from "./components/LetterRequirementToggle.jsx";
import CompanyList from "./components/CompanyList.jsx";
import CompanyPage from "./components/CompanyPage.jsx";
import NotFoundPage from "./components/NotFoundPage.jsx";
import Footer from "./components/Footer.jsx";
import MobileBottomNav from "./components/MobileBottomNav.jsx";
import { companies as fallbackCompanies } from "./data/companies.js";
import { getLocalizedSitePage } from "./data/siteContent.js";
import { getMessages } from "./locales/messages.js";
import useClientRoute from "./hooks/useClientRoute.js";
import useDocumentMetadata from "./hooks/useDocumentMetadata.js";
import {
  getCompanies,
  hasRemoteCompanies,
  haveSameCompanies,
} from "./services/companiesApi.js";
import { getCompanyCities } from "./utils/cities.js";
import {
  getCanonicalUrl,
  getCompanyPageDescription,
  getCompanyPageEntries,
  getCompanyPageTitle,
  getCompanyPath,
  getCompanySlugFromPathname,
  getHomePageDescription,
  getHomePageTitle,
  hasPublishableCompanyContent,
  isCompanyPath,
} from "./utils/companyRoutes.js";
import {
  getHomePath,
  getLanguageSwitchPath,
  getLocaleFromPathname,
  normalizePathname,
} from "./utils/locale.js";
import {
  getCompanyStatus,
  getDeadlineSortTime,
  getNextStatusChangeTime,
  isDeadlineUrgent,
} from "./utils/status.js";
import {
  getSitePagePath,
  getSitePageSlugFromPathname,
} from "./utils/siteRoutes.js";

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MIN_REFRESH_GAP_MS = 60 * 1000;
const THEME_STORAGE_KEY = "internship-coop-theme";
const APPLIED_STORAGE_KEY = "internship-coop-applied";
const LAST_UPDATED = "September 1, 2026";

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

function formatLastUpdated(locale) {
  const date = new Date(`${LAST_UPDATED} 12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return LAST_UPDATED;
  }

  const dateLocale =
    locale === "ar" ? "ar-SA-u-ca-gregory-nu-arab" : "en-US";

  return new Intl.DateTimeFormat(dateLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function App() {
  const { pathname, navigate, returnTo } = useClientRoute();
  const locale = getLocaleFromPathname(pathname);
  const messages = getMessages(locale);
  const homeHref = getHomePath(locale);
  const languageHref = getLanguageSwitchPath(pathname);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("open");
  const [activeCity, setActiveCity] = useState("all");
  const [sortByDeadline, setSortByDeadline] = useState(false);
  const [showNoLetterOnly, setShowNoLetterOnly] = useState(false);
  const [theme, setTheme] = useState(getSavedTheme);
  const [appliedLinks, setAppliedLinks] = useState(() =>
    getStoredLinks(APPLIED_STORAGE_KEY),
  );
  const [companies, setCompanies] = useState(fallbackCompanies);
  const [dataError, setDataError] = useState("");
  const [statusTime, setStatusTime] = useState(() => new Date());
  const companiesRef = useRef(fallbackCompanies);
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const appliedLinksSet = useMemo(() => new Set(appliedLinks), [appliedLinks]);
  const companyEntries = useMemo(
    () => getCompanyPageEntries(companies),
    [companies],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Theme still changes even if the browser blocks localStorage.
    }
  }, [theme]);

  useEffect(() => {
    saveStoredLinks(APPLIED_STORAGE_KEY, appliedLinks);
  }, [appliedLinks]);

  useEffect(() => {
    if (!hasRemoteCompanies) {
      return undefined;
    }

    let isMounted = true;
    let requestInFlight = false;
    let lastRequestTime = 0;
    let requestController;

    async function loadCompanies({ force = false } = {}) {
      const requestTime = Date.now();

      if (
        requestInFlight ||
        (!force && requestTime - lastRequestTime < MIN_REFRESH_GAP_MS)
      ) {
        return;
      }

      requestInFlight = true;
      lastRequestTime = requestTime;
      requestController = new AbortController();

      try {
        const latestCompanies = await getCompanies({
          signal: requestController.signal,
        });

        if (isMounted) {
          if (!haveSameCompanies(companiesRef.current, latestCompanies)) {
            companiesRef.current = latestCompanies;
            setCompanies(latestCompanies);
            setStatusTime(new Date());
          }

          setDataError("");
        }
      } catch (error) {
        if (isMounted && error.name !== "AbortError") {
          setDataError(error.message);

          if (!haveSameCompanies(companiesRef.current, fallbackCompanies)) {
            companiesRef.current = fallbackCompanies;
            setCompanies(fallbackCompanies);
            setStatusTime(new Date());
          }
        }
      } finally {
        requestInFlight = false;
      }
    }

    loadCompanies({ force: true });

    const intervalId = window.setInterval(() => {
      if (!document.hidden) {
        loadCompanies();
      }
    }, REFRESH_INTERVAL_MS);

    function refreshWhenVisible() {
      if (!document.hidden) {
        loadCompanies();
      }
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      isMounted = false;
      requestController?.abort();
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  useEffect(() => {
    let timeoutId;
    let nextChangeTime = 0;

    function scheduleNextStatusChange() {
      window.clearTimeout(timeoutId);

      const now = new Date();
      nextChangeTime = getNextStatusChangeTime(companies, now);
      const delay = Math.max(nextChangeTime - now.getTime() + 25, 1000);

      timeoutId = window.setTimeout(() => {
        const updatedTime = new Date();
        setStatusTime(updatedTime);
        scheduleNextStatusChange();
      }, delay);
    }

    function refreshStatusWhenVisible() {
      if (!document.hidden && Date.now() >= nextChangeTime) {
        setStatusTime(new Date());
        scheduleNextStatusChange();
      }
    }

    scheduleNextStatusChange();
    document.addEventListener("visibilitychange", refreshStatusWhenVisible);

    return () => {
      window.clearTimeout(timeoutId);
      document.removeEventListener(
        "visibilitychange",
        refreshStatusWhenVisible,
      );
    };
  }, [companies]);

  const companyRecords = useMemo(() => {
    return companyEntries.map(({ company, slug }) => {
      const status = getCompanyStatus(company, statusTime);

      return {
        company,
        slug,
        searchLabel: getSortLabel(company).toLowerCase(),
        cities: getCompanyCities(company),
        deadlineSortTime: getDeadlineSortTime(company),
        statusKey: status.key,
        statusDaysLeft: status.daysLeft,
        isUrgent:
          status.key === "open" && isDeadlineUrgent(company, statusTime),
      };
    });
  }, [companyEntries, statusTime]);

  const companySlug = getCompanySlugFromPathname(pathname);
  const activeCompanyRecord = useMemo(
    () => companyRecords.find((record) => record.slug === companySlug),
    [companyRecords, companySlug],
  );
  const isHomePage = normalizePathname(pathname) === homeHref;
  const isCompanyRoute = isCompanyPath(pathname);
  const isKnownCompanyPage =
    isCompanyRoute &&
    Boolean(activeCompanyRecord) &&
    hasPublishableCompanyContent(activeCompanyRecord.company);
  const sitePageSlug = getSitePageSlugFromPathname(pathname);
  const sitePageContent = getLocalizedSitePage(sitePageSlug, locale);
  const isInformationPage = Boolean(sitePageContent);
  const metadata = useMemo(() => {
    if (isInformationPage) {
      const englishPath = getSitePagePath(sitePageSlug, "en");
      const arabicPath = getSitePagePath(sitePageSlug, "ar");

      return {
        title: `${sitePageContent.title} | ${messages.siteName}`,
        description: sitePageContent.description,
        canonicalUrl: getCanonicalUrl(
          getSitePagePath(sitePageSlug, locale),
        ),
        alternateUrls: {
          en: getCanonicalUrl(englishPath),
          ar: getCanonicalUrl(arabicPath),
          "x-default": getCanonicalUrl(englishPath),
        },
        noIndex: false,
      };
    }

    if (isKnownCompanyPage) {
      const englishPath = getCompanyPath(activeCompanyRecord.slug, "en");
      const arabicPath = getCompanyPath(activeCompanyRecord.slug, "ar");

      return {
        title: getCompanyPageTitle(activeCompanyRecord.company, locale),
        description: getCompanyPageDescription(
          activeCompanyRecord.company,
          locale,
        ),
        canonicalUrl: getCanonicalUrl(
          getCompanyPath(activeCompanyRecord.slug, locale),
        ),
        alternateUrls: {
          en: getCanonicalUrl(englishPath),
          ar: getCanonicalUrl(arabicPath),
          "x-default": getCanonicalUrl(englishPath),
        },
        noIndex: false,
      };
    }

    if (isHomePage) {
      return {
        title: getHomePageTitle(locale),
        description: getHomePageDescription(locale),
        canonicalUrl: getCanonicalUrl(homeHref),
        alternateUrls: {
          en: getCanonicalUrl("/"),
          ar: getCanonicalUrl("/ar"),
          "x-default": getCanonicalUrl("/"),
        },
        noIndex: false,
      };
    }

    return {
      title: messages.seo.notFoundTitle,
      description: messages.seo.notFoundDescription,
      canonicalUrl: getCanonicalUrl(pathname),
      alternateUrls: null,
      noIndex: true,
    };
  }, [
    activeCompanyRecord,
    homeHref,
    isHomePage,
    isInformationPage,
    isKnownCompanyPage,
    locale,
    messages,
    pathname,
    sitePageContent,
    sitePageSlug,
  ]);

  useDocumentMetadata(metadata);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  useEffect(() => {
    document.body.classList.toggle("has-detail-page", !isHomePage);

    return () => document.body.classList.remove("has-detail-page");
  }, [isHomePage]);

  const filteredRecords = useMemo(() => {
    const normalizedSearch = deferredSearchTerm.trim().toLowerCase();

    return companyRecords
      .filter((record) => {
        const { company, cities, searchLabel, statusKey } = record;
        const isClosed = statusKey === "closed";
        const isApplied = appliedLinksSet.has(company.applicationLink);
        const isOpen = !isClosed && !isApplied;
        const isAppliedVisible = !isClosed && isApplied;
        const matchesSearch = searchLabel.includes(normalizedSearch);
        const matchesFilter =
          activeFilter === "closed"
            ? isClosed
            : activeFilter === "applied"
              ? isAppliedVisible
              : isOpen;
        const matchesCity = activeCity === "all" || cities.includes(activeCity);
        const matchesLetterFilter =
          !showNoLetterOnly || !company.requiresLetter;

        return (
          matchesSearch &&
          matchesFilter &&
          matchesCity &&
          matchesLetterFilter
        );
      })
      .sort((firstRecord, secondRecord) => {
        const labelSort = firstRecord.searchLabel.localeCompare(
          secondRecord.searchLabel,
          "en",
          {
            numeric: true,
            sensitivity: "base",
          },
        );

        if (!sortByDeadline) {
          return labelSort;
        }

        const deadlineSort =
          firstRecord.deadlineSortTime - secondRecord.deadlineSortTime;

        return deadlineSort || labelSort;
      });
  }, [
    activeCity,
    activeFilter,
    appliedLinksSet,
    companyRecords,
    deferredSearchTerm,
    showNoLetterOnly,
    sortByDeadline,
  ]);

  const opportunityCounts = useMemo(() => {
    return companyRecords.reduce(
      (counts, { company, statusKey }) => {
        if (statusKey === "closed") {
          counts.closed += 1;
          return counts;
        }

        if (appliedLinksSet.has(company.applicationLink)) {
          counts.applied += 1;
          counts.all += 1;
          return counts;
        }

        counts.all += 1;
        counts.open += 1;

        return counts;
      },
      {
        all: 0,
        open: 0,
        "open-soon": 0,
        closed: 0,
        applied: 0,
      },
    );
  }, [appliedLinksSet, companyRecords]);

  const handleAppliedToggle = useCallback((applicationLink) => {
    setAppliedLinks((currentLinks) =>
      toggleStoredLink(applicationLink, currentLinks),
    );
  }, []);

  const handleThemeToggle = useCallback(() => {
    setTheme((currentTheme) =>
      currentTheme === "dark" ? "light" : "dark",
    );
  }, []);

  const handleReturnToHome = useCallback(() => {
    returnTo(homeHref);
  }, [homeHref, returnTo]);

  const cityCounts = useMemo(() => {
    const normalizedSearch = deferredSearchTerm.trim().toLowerCase();

    return companyRecords.reduce(
      (counts, { company, cities, searchLabel, statusKey }) => {
        const isClosed = statusKey === "closed";
        const isApplied = appliedLinksSet.has(company.applicationLink);
        const matchesFilter =
          activeFilter === "closed"
            ? isClosed
            : activeFilter === "applied"
              ? !isClosed && isApplied
              : !isClosed && !isApplied;
        const matchesSearch = searchLabel.includes(normalizedSearch);
        const matchesLetterFilter =
          !showNoLetterOnly || !company.requiresLetter;

        // City labels describe the cards reachable in the current
        // view. The old implementation counted closed/applied cards
        // while "All Cities" counted only the active view, producing
        // impossible labels such as Riyadh (69) with 50 visible cards.
        // Deliberately ignore activeCity here so selecting one city
        // does not erase the counts for all the other choices.
        if (!matchesFilter || !matchesSearch || !matchesLetterFilter) {
          return counts;
        }

        counts.all += 1;

        cities.forEach((city) => {
          counts[city] = (counts[city] ?? 0) + 1;
        });

        return counts;
      },
      {
        all: 0,
      },
    );
  }, [
    activeFilter,
    appliedLinksSet,
    companyRecords,
    deferredSearchTerm,
    showNoLetterOnly,
  ]);

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

  if (isKnownCompanyPage) {
    return (
      <>
        <CompanyPage
          company={activeCompanyRecord.company}
          statusKey={activeCompanyRecord.statusKey}
          theme={theme}
          onThemeToggle={handleThemeToggle}
          navigate={navigate}
          onReturnToHome={handleReturnToHome}
          locale={locale}
          messages={messages}
          homeHref={homeHref}
          languageHref={languageHref}
        />
        <Analytics />
      </>
    );
  }

  if (isInformationPage) {
    return (
      <>
        <InformationPage
          content={sitePageContent}
          theme={theme}
          onThemeToggle={handleThemeToggle}
          navigate={navigate}
          locale={locale}
          messages={messages}
          homeHref={homeHref}
          languageHref={languageHref}
        />
        <Analytics />
      </>
    );
  }

  if (!isHomePage) {
    return (
      <>
        <NotFoundPage
          theme={theme}
          onThemeToggle={handleThemeToggle}
          navigate={navigate}
          locale={locale}
          messages={messages}
          homeHref={homeHref}
          languageHref={languageHref}
        />
        <Analytics />
      </>
    );
  }

  return (
    <>
      <Header
        theme={theme}
        onThemeToggle={handleThemeToggle}
        locale={locale}
        messages={messages}
        languageHref={languageHref}
        navigate={navigate}
      />

      <main className="page-shell">
        <p className="last-updated">
          {messages.lastUpdated}: {formatLastUpdated(locale)}
        </p>

        <section className="controls" aria-label={messages.filters.controlsLabel}>
          <SearchBar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            messages={messages}
          />
          <div className="filter-panel">
            <FilterButtons
              activeFilter={activeFilter}
              counts={opportunityCounts}
              onFilterChange={setActiveFilter}
              locale={locale}
              messages={messages}
            />
            <div className="filter-pair">
              <CitySelect
                activeCity={activeCity}
                cities={cityOptions}
                counts={cityCounts}
                onCityChange={setActiveCity}
                locale={locale}
                messages={messages}
              />
              <div className="filter-toggles">
                <DeadlineSortToggle
                  checked={sortByDeadline}
                  onChange={setSortByDeadline}
                  messages={messages}
                />
                <LetterRequirementToggle
                  checked={showNoLetterOnly}
                  onChange={setShowNoLetterOnly}
                  messages={messages}
                />
              </div>
            </div>
          </div>
        </section>

        {dataError && (
          <p className="data-note error">
            {messages.dataError}
            {locale === "en" ? ` ${dataError}` : ""}
          </p>
        )}

        <CompanyList
          records={filteredRecords}
          appliedLinks={appliedLinksSet}
          onAppliedToggle={handleAppliedToggle}
          navigate={navigate}
          locale={locale}
          messages={messages}
        />
      </main>

      <Footer messages={messages} locale={locale} navigate={navigate} />
      <MobileBottomNav
        activeFilter={activeFilter}
        counts={opportunityCounts}
        onFilterChange={setActiveFilter}
        locale={locale}
        messages={messages}
      />
      <Analytics />
    </>
  );
}

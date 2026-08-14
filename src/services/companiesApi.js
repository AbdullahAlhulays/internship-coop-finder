import { companies as fallbackCompanies } from "../data/companies.js";

const DATA_URL = import.meta.env.VITE_COMPANIES_DATA_URL;
const COMPANY_FIELDS = [
  "name",
  "addedAt",
  "bio",
  "description",
  "isClosed",
  "requiresLetter",
  "location",
  "openingDate",
  "deadlineTime",
  "applicationLink",
  "deadline",
  "type",
];

export const hasRemoteCompanies = Boolean(DATA_URL);

function isValidDescription(description) {
  return (
    description === undefined ||
    typeof description === "string" ||
    (description !== null &&
      typeof description === "object" &&
      (description.en === undefined || typeof description.en === "string") &&
      (description.ar === undefined || typeof description.ar === "string"))
  );
}

function isValidCompany(company) {
  return (
    company &&
    typeof company.name === "string" &&
    (company.addedAt === undefined || typeof company.addedAt === "string") &&
    (company.bio === undefined || typeof company.bio === "string") &&
    isValidDescription(company.description) &&
    (company.isClosed === undefined || typeof company.isClosed === "boolean") &&
    (company.requiresLetter === undefined ||
      typeof company.requiresLetter === "boolean") &&
    (company.location === undefined || typeof company.location === "string") &&
    (company.openingDate === undefined || typeof company.openingDate === "string") &&
    (company.deadlineTime === undefined || typeof company.deadlineTime === "string") &&
    typeof company.applicationLink === "string" &&
    (company.deadline === undefined || typeof company.deadline === "string") &&
    typeof company.type === "string"
  );
}

export async function getCompanies({ signal } = {}) {
  if (!DATA_URL) {
    return fallbackCompanies;
  }

  const response = await fetch(DATA_URL, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-cache",
    signal,
  });

  if (!response.ok) {
    throw new Error("Could not load the latest opportunities.");
  }

  const data = await response.json();
  const companies = Array.isArray(data) ? data : data.companies;

  if (!Array.isArray(companies) || !companies.every(isValidCompany)) {
    throw new Error("The opportunities data format is invalid.");
  }

  return companies;
}

export function haveSameCompanies(firstCompanies, secondCompanies) {
  if (firstCompanies === secondCompanies) {
    return true;
  }

  if (firstCompanies.length !== secondCompanies.length) {
    return false;
  }

  const firstCompaniesByLink = new Map(
    firstCompanies.map((company) => [company.applicationLink, company]),
  );

  return secondCompanies.every((company) => {
    const matchingCompany = firstCompaniesByLink.get(company.applicationLink);

    return (
      matchingCompany &&
      COMPANY_FIELDS.every((field) => {
        if (field === "description") {
          return (
            JSON.stringify(matchingCompany[field]) ===
            JSON.stringify(company[field])
          );
        }

        return matchingCompany[field] === company[field];
      })
    );
  });
}

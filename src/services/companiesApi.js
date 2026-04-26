import { companies as fallbackCompanies } from "../data/companies.js";

const DATA_URL = import.meta.env.VITE_COMPANIES_DATA_URL;

function isValidCompany(company) {
  return (
    company &&
    typeof company.name === "string" &&
    (company.bio === undefined || typeof company.bio === "string") &&
    (company.openingDate === undefined || typeof company.openingDate === "string") &&
    typeof company.applicationLink === "string" &&
    typeof company.deadline === "string" &&
    typeof company.type === "string"
  );
}

export async function getCompanies() {
  if (!DATA_URL) {
    return fallbackCompanies;
  }

  const response = await fetch(DATA_URL, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
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

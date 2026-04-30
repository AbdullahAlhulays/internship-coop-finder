const SAUDI_CITY_LABELS = {
  abqaiq: "Abqaiq",
  "al khobar": "Al Khobar",
  "al-khobar": "Al Khobar",
  dammam: "Dammam",
  eastern: "Eastern",
  jeddah: "Jeddah",
  jubail: "Jubail",
  khobar: "Al Khobar",
  madinah: "Madinah",
  mecca: "Makkah",
  mekkah: "Makkah",
  makkah: "Makkah",
  rabigh: "Rabigh",
  riyadh: "Riyadh",
  yanbu: "Yanbu",
};

const ALL_SAUDI_CITY_LABELS = [...new Set(Object.values(SAUDI_CITY_LABELS))];

export function getSaudiCitiesFromLocation(location = "") {
  const normalizedLocation = location.toLowerCase();

  if (/(^|[^a-z])many([^a-z]|$)/.test(normalizedLocation)) {
    return ALL_SAUDI_CITY_LABELS;
  }

  return Object.entries(SAUDI_CITY_LABELS).reduce((cities, [keyword, label]) => {
    if (normalizedLocation.includes(keyword) && !cities.includes(label)) {
      cities.push(label);
    }

    return cities;
  }, []);
}

export function getCompanyCities(company) {
  return getSaudiCitiesFromLocation(company.location);
}

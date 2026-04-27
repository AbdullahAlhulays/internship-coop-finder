const SAUDI_CITY_LABELS = {
  abqaiq: "Abqaiq",
  "al khobar": "Al Khobar",
  "al-khobar": "Al Khobar",
  dammam: "Dammam",
  jeddah: "Jeddah",
  khobar: "Al Khobar",
  madinah: "Madinah",
  mecca: "Makkah",
  mekkah: "Makkah",
  makkah: "Makkah",
  rabigh: "Rabigh",
  riyadh: "Riyadh",
  yanbu: "Yanbu",
};

export function getSaudiCitiesFromLocation(location = "") {
  const normalizedLocation = location.toLowerCase();

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


const COMPANY_LOGO_DOMAINS = {
  "SSCL": "sscl.sa",
  "HUMAIN": "humain.ai",
  "Saudi Water Authority": "swa.gov.sa",
  "Wadi Jeddah Innovation Hub": "wadi-jeddah.com.sa",
  "Saudi Power Procurement Company (SPPC)": "sppc.com.sa",
  "Nahdi Medical": "nahdi.sa",
  "Mobily": "mobily.com.sa",
  "ARDARA": "ardara.sa",
  "SAMI Autonomous": "sami.com.sa",
  "Taibah Valley": "taibahvalley.com.sa",
  "Saudi Energy Efficiency Center": "seec.gov.sa",
  "CEREBRA": "cerebra.sa",
  "Ministry of Communications and Information Technology": "mcit.gov.sa",
  "Saudi Space Agency": "ssa.gov.sa",
  "P&G LEADgen": "pg.com",
  "Clifford Chance": "cliffordchance.com",
  "Ministry of Economy & Planning": "mep.gov.sa",
  "King Fahd Medical Research Center": "kau.edu.sa",
  "Rua Al Madinah Holding": "ruaalmadinah.com",
  "Tahcom AI": "tahcom.com",
  "ASMO": "asmo.com",
  "SAB": "sab.com",
  "PwC": "pwc.com",
  "Soudah Development": "soudah.sa",
  "Saudi Air Navigation Services (SANS)": "sans.com.sa",
  "flyadeal": "flyadeal.com",
  "Misk x Hyundai Motor Company": "misk.org.sa",
  "Zid": "zid.sa",
  "SGS": "sgs.com",
  "WAS SPA": "spa.gov.sa",
  "SAMREF": "samref.com.sa",
  "Petro Rabigh": "petrorabigh.com",
  "GE Vernova": "gevernova.com",
  "Madinah Municipality": "amana-md.gov.sa",
  "SPARK": "spark.sa",
  "WalaPlus": "walaplus.com",
  "POWR": "powr.sa",
  "Siemens Ltd": "siemens.com",
  "SAP": "sap.com",
  "Bosch": "bosch.com",
  "Alfanar": "alfanar.com",
  "Public Health Authority": "pha.gov.sa",
  "KACST": "kacst.gov.sa",
  "Communications, Space and Technology Commission (CST)": "cst.gov.sa",
  "Deloitte": "deloitte.com",
  "Osool": "osoolre.com",
  "Mnzil": "mnzil.com",
  "Digital Government Authority": "dga.gov.sa",
  "Diriyah Company": "diriyahcompany.sa",
  "Lean Business Services": "lean.sa",
  "Takamol": "takamol.sa",
  "SABIC": "sabic.com",
  "SAMACO Motors": "samaco.com.sa",
  "WEBOOK": "webook.com",
  "Tamara": "tamara.co",
  "Saudi Geological Survey": "sgs.gov.sa",
  "SDAIA": "sdaia.gov.sa",
  "Roland Berger": "rolandberger.com",
  "Ministry of Hajj & Umrah": "haj.gov.sa",
  "Al Rugaib": "alrugaibfurniture.com",
  "SAMI": "sami.com.sa",
  "Reemat Al-Riyadh": "remat.sa",
  "TCC": "tcc-ict.com",
  "SIDF": "sidf.gov.sa",
  "AON": "aon.com",
  "Motor Vehicle Periodic Inspection": "mvpi.com.sa",
  "Alkhorayef Water & Power Technologies": "awpt.com.sa",
  "Ministry of Justice": "moj.gov.sa",
  "Wadi Makkah": "wadimakkah.sa",
  "The Board of Grievances": "bog.gov.sa",
  "Tetco": "tetco.sa",
  "STC Channels": "channels.com.sa",
  "Ministry of Industry and Mineral Resources": "mim.gov.sa",
  "AlFalak": "alfalak.com",
  "Talent 360 ME": "talent-360.me",
  "Sarj.ai": "sarj.ai",
  "ELM": "elm.sa",
  "FedEx": "fedex.com",
  "Emdad": "emdad.com.sa",
  "Saudi Railway Polytechnic": "srp.edu.sa",
  "Saudi National Bank (SNB)": "alahli.com",
  "SATORP": "satorp.com",
  "CAMCO": "camco.com.sa",
  "NESR": "nesr.com",
  "Al Rajhi Takaful": "alrajhitakaful.com",
  "Barakah": "barakah.app",
  "Pure Consulting": "pure-consulting.com",
  "NHC": "nhc.sa",
  "King Fahd Armed Forces Hospital": "kfafh.med.sa",
  "Saudi Azm": "azm.com",
  "Peaks": "saudipeaks.com",
  "Zaiti": "zaiti.co",
  "National Transport Safety Center": "ntsc.gov.sa",
  "NOV": "nov.com",
  "Ministry of Tourism": "mt.gov.sa",
  "General Authority for Statistics": "stats.gov.sa",
  "ROSHN Group": "roshn.sa",
  "Ram World": "ramworld.net",
  "Air Products": "airproducts.com",
  "Panda Retail Company": "panda.com.sa",
  "Devoteam": "devoteam.com",
  "Riyadh Air": "riyadhair.com",
  "Lucidya": "lucidya.com",
  "National Development Fund (NDF)": "ndf.gov.sa",
  "Amana Cooperative Insurance": "amana.sa",
  "Tatweer Education Holding Company": "tatweer.sa",
  "Center for National Health Insurance (CNHI)": "cnhi.gov.sa",
  "Bupa Arabia": "bupa.com.sa",
  "Lumi": "lumi.sa",
  "Insurance Authority": "ia.gov.sa",
  "TAWAL": "tawal.com.sa",
  "Hassan Allam Holding": "hassanallam.com",
  "National Medical Care": "care.med.sa",
  "Hewlett Packard Enterprise": "hpe.com",
  "Gulf Insulation Group": "giginsulation.com",
  "Apex Group Ltd": "apexgroup.com",
  "Ektis": "ektis.com",
};

const SVG_LOGO_KEYS = new Set([
  "ardara",
  "insurance-authority",
  "ministry-of-communications-and-information-technology",
  "saudi-air-navigation-services-sans",
]);

const WEBP_LOGO_KEYS = new Set(["sami", "sami-autonomous"]);
const PNG_LOGO_KEYS = new Set(["taibah-valley"]);

const COMPANY_LOGO_OVERRIDES = {
  "Medical Care": {
    domain: "care.med.sa",
    key: "national-medical-care",
    extension: "jpg",
  },
  Flyadeal: {
    domain: "flyadeal.com",
    key: "flyadeal",
    extension: "jpg",
  },
  "Up Marketing Group": {
    domain: "upmgsa.com",
    key: "up-marketing-group",
    extension: "png",
  },
  MyTrip: {
    domain: "mytrip.company",
    key: "mytrip",
    extension: "png",
  },
  "MEMF Electrical Industries Co.": {
    domain: "memf.com.sa",
    key: "memf-electrical-industries-co",
    extension: "png",
  },
  "أكاديمية واس": {
    domain: "spanewsacademy.net.sa",
    key: "was-spa",
    extension: "jpg",
  },
};

export function getEnglishCompanyName(name = "") {
  const parts = name.split("|").map((part) => part.trim()).filter(Boolean);
  const englishPart = parts.find((part) => /[A-Za-z]/.test(part));

  return englishPart || parts[0] || "Company";
}

export function getCompanyDisplayName(name = "") {
  const parts = name.split("|").map((part) => part.trim()).filter(Boolean);
  const englishPart = parts.find((part) => /[A-Za-z]/.test(part));
  const arabicPart = parts.find((part) => /[\u0600-\u06ff]/.test(part));

  if (!englishPart || !arabicPart) {
    return name;
  }

  const bilingualName = `${englishPart} | ${arabicPart}`;
  const isLongName = bilingualName.length > 42 || englishPart.length > 30;

  return isLongName ? englishPart : bilingualName;
}

function getLogoFileName(name = "") {
  return name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function getCompanyLogo(company) {
  const englishName = getEnglishCompanyName(company.name);
  const override = COMPANY_LOGO_OVERRIDES[englishName];
  const domain = override?.domain ?? COMPANY_LOGO_DOMAINS[englishName];
  const key = override?.key ?? getLogoFileName(englishName);
  const extension =
    override?.extension ??
    (SVG_LOGO_KEYS.has(key)
      ? "svg"
      : WEBP_LOGO_KEYS.has(key)
        ? "webp"
        : PNG_LOGO_KEYS.has(key)
          ? "png"
          : "jpg");

  return {
    alt: `${englishName} logo`,
    domain,
    key,
    initials: englishName
      .replace(/\([^)]*\)/g, " ")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase(),
    url: domain ? `/company-logos/${key}.${extension}` : null,
  };
}

export function getOpportunityTypeLabel(type = "") {
  return getOpportunityTypeKey(type) === "coop" ? "COOP" : "Internship";
}

export function getOpportunityTypeKey(type = "") {
  const normalizedType = type.toLowerCase();
  const isCoop = normalizedType.includes("coop") || normalizedType.includes("co-op");

  return isCoop ? "coop" : "internship";
}

export { COMPANY_LOGO_DOMAINS };

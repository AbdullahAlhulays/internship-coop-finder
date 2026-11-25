// Closed listings are kept in the directory only for widely recognized employers
// and public institutions. Match the English name before any translation.
const featuredClosedCompanies = new Set([
  "humain", "saudi water authority", "nahdi medical", "mobily",
  "p&g leadgen", "ministry of economy & planning", "ministry of economy and planning",
  "sab", "pwc", "flyadeal", "misk x hyundai motor company", "petro rabigh",
  "ge vernova", "siemens ltd", "sap", "kacst",
  "communications, space and technology commission (cst)", "deloitte",
  "digital government authority", "diriyah company", "sabic", "tamara",
  "saudi geological survey", "sdaia", "ministry of hajj & umrah", "sami",
  "sidf", "stc channels", "ministry of industry and mineral resources", "elm",
  "fedex", "saudi national bank (snb)", "satorp", "al rajhi takaful", "nhc",
  "roshn group", "riyadh air", "national development fund (ndf)", "bupa arabia",
  "tawal", "hewlett packard enterprise", "aramco", "ministry of tourism",
  "al rajhi bank", "ministry of communications and information technology",
  "national cybersecurity authority",
  "alfalak", "amgen", "blackrock", "bosch", "king fahd medical research center",
  "lean technologies", "lucidya", "lumi", "medtronic", "meituan",
  "saudi space agency", "siemens energy", "shaker group", "schneider electric",
  "saudi consult", "king abdullah petroleum studies and research center", "ardara",
]);

export function isFeaturedClosedCompany(company) {
  return featuredClosedCompanies.has(company.name.split("|")[0].trim().toLowerCase());
}

// Add, remove, or edit company opportunities here.
// The app automatically calculates each status from the deadline date.
// Keep dates in YYYY-MM-DD format so filtering and deadline logic stay reliable.
// The bio field is optional. If you add it, students can reveal it from the card.
// The location field is optional. Use it for city, country, remote, or hybrid details.
// The openingDate field is optional. Use it for opportunities that should show "Open Soon".
export const companies = [
  {
    name: "Aramco",
    bio: "A global energy and chemicals company with training programs across engineering, business, IT, and operations.",
    location: "Saudi Arabia",
    applicationLink: "https://www.aramco.com/en/careers",
    deadline: "2026-05-30",
    type: "Internship / COOP",
  },
  {
    name: "SABIC",
    bio: "A leading chemicals company offering student development opportunities in technical and corporate functions.",
    location: "Riyadh / Jubail",
    applicationLink: "https://www.sabic.com/en/careers",
    openingDate: "2026-05-01",
    deadline: "2026-05-12",
    type: "COOP",
  },
  {
    name: "stc",
    bio: "A digital enabler with opportunities in telecommunications, cybersecurity, software, data, and business.",
    location: "Riyadh",
    applicationLink: "https://www.stc.com.sa/content/stc/sa/en/about-stc/careers.html",
    deadline: "2026-04-28",
    type: "Internship",
  },
  {
    name: "NEOM",
    bio: "A future-focused development company with roles across technology, sustainability, design, and operations.",
    location: "NEOM / Tabuk",
    applicationLink: "https://www.neom.com/en-us/careers",
    deadline: "2026-04-20",
    type: "Internship / COOP",
  },
];
